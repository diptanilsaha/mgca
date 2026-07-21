#!/usr/bin/env bash
# Build (and optionally sign) distributable MGCA packages.
#
#   ./build.sh              build dist/ packages for Chrome + Firefox
#   ./build.sh sign         also sign the Firefox package via Mozilla's
#                           self-distribution ("unlisted") channel
#
# Environment:
#   UPDATE_BASE_URL   where you will host the signed .xpi and updates.json,
#                     e.g. https://mgca.diptanil.dev — baked into the Firefox
#                     manifest as gecko.update_url for self-hosted auto-updates.
#                     Omit it to build a Firefox package without auto-updates.
#   AMO_JWT_ISSUER    AMO API key    (sign only — from
#   AMO_JWT_SECRET    AMO API secret  addons.mozilla.org/developers/addon/api/key/)
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
SRC="manifest.json background.js content options icons"

rm -rf dist
mkdir -p dist/firefox-src

# Chrome / Edge / Brave: manifest as-is. Sideload by unzipping + Load unpacked,
# or serve to managed browsers via enterprise policy.
# shellcheck disable=SC2086
zip -qr "dist/mgca-$VERSION-chrome.zip" $SRC
echo "built dist/mgca-$VERSION-chrome.zip"

# Firefox: same source, plus gecko.update_url when UPDATE_BASE_URL is set.
# Kept unzipped in dist/firefox-src so `web-ext sign` can use it directly.
# shellcheck disable=SC2086
cp -R $SRC dist/firefox-src/
if [ -n "${UPDATE_BASE_URL:-}" ]; then
  python3 - "$UPDATE_BASE_URL" <<'PY'
import json, sys

path = 'dist/firefox-src/manifest.json'
manifest = json.load(open(path))
base = sys.argv[1].rstrip('/')
manifest['browser_specific_settings']['gecko']['update_url'] = f'{base}/updates.json'
json.dump(manifest, open(path, 'w'), indent=2)

addon_id = manifest['browser_specific_settings']['gecko']['id']
version = manifest['version']
updates = {
    'addons': {
        addon_id: {
            'updates': [
                {'version': version, 'update_link': f'{base}/mgca-{version}.xpi'},
            ]
        }
    }
}
json.dump(updates, open('dist/updates.json', 'w'), indent=2)
print(f'baked update_url {base}/updates.json into Firefox manifest')
print('built dist/updates.json — upload it alongside the signed .xpi')
PY
else
  echo "UPDATE_BASE_URL not set — Firefox package will not self-update"
fi
(cd dist/firefox-src && zip -qr "../mgca-$VERSION-firefox.zip" .)
echo "built dist/mgca-$VERSION-firefox.zip"

if [ "${1:-}" = "sign" ]; then
  : "${AMO_JWT_ISSUER:?set AMO_JWT_ISSUER (AMO API key)}"
  : "${AMO_JWT_SECRET:?set AMO_JWT_SECRET (AMO API secret)}"
  npx --yes web-ext sign \
    --source-dir dist/firefox-src \
    --artifacts-dir dist \
    --channel unlisted \
    --api-key "$AMO_JWT_ISSUER" \
    --api-secret "$AMO_JWT_SECRET"
  echo "signed .xpi written to dist/ — rename to mgca-$VERSION.xpi when uploading"
fi
