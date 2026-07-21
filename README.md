# MGCA — Make Gameplan Chaotic Again

A Chrome/Firefox (Manifest V3) extension that injects an **All Discussions** community into the [Gameplan](https://github.com/frappe/gameplan) sidebar. Clicking it opens a panel with a single space, **All Discussion**, listing every discussion you can access across all communities and spaces — something the native UI no longer offers.

No build step. Plain JS/CSS, loadable unpacked.

## How it works

- The extension has **no static content scripts**. You configure your Gameplan instance's domain in the popup; the extension requests host permission for just that origin and dynamically registers the content script for it (`chrome.scripting.registerContentScripts`).
- On a matching page, the content script first verifies it's actually a Gameplan frontend (the `/g` route + Gameplan page markers) before injecting anything.
- It appends an icon to the bottom of the community rail (kept alive across SPA navigations with a `MutationObserver`). Clicking it opens an overlay styled with the app's own frappe-ui CSS tokens, so light/dark theme is followed automatically.
- Discussions are fetched from `GET /api/v2/method/gameplan.gameplan.doctype.gp_discussion.api.get_discussions` with no `team`/`project` filter (server-side permission filtering still applies), using your existing session cookie. Author names/avatars come from `gameplan.api.get_user_info`. Falls back to `/api/method/...` on older Frappe versions.
- Clicking a row navigates to the discussion's canonical URL: `/g/community/<team>/space/<space>/discussion/<id>/<slug>`.

## Install (Chrome / Edge / Brave / Arc)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this `mgca/` directory.
   (A warning about the `background.scripts` key is expected — that key is for Firefox.)

## Install (Firefox)

1. Open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on** → select `manifest.json` in this directory.
   (A warning about the `service_worker` key is expected — that key is for Chrome.)

## Configure

1. Click the extension's toolbar icon.
2. Enter your Gameplan instance URL (e.g. `https://gameplan.example.com` or `http://gameplan-demo.test:8000`) and click **Add**.
3. Accept the host-permission prompt. The instance should now show as **active**.
4. Open (or reload) your Gameplan tab — a new chat-bubble icon appears at the bottom of the community list in the left rail.

## Use

- Click the injected icon to open **All Discussions** → the **All Discussion** space lists discussions site-wide, newest activity first, 20 at a time (**Load more** for the next page).
- Click a discussion to open it. Click any native rail icon, press `Escape`, or click the injected icon again to dismiss the panel.
- **Going back from a post returns you to the panel.** When you open a post from the panel, the extension saves a per-tab return marker (panel URL, loaded rows, scroll position). On the post page it intercepts the app's back affordances — the breadcrumb space link and the mobile back button — and drives `history.back()` instead of the SPA route; landing back on the saved URL (that way, or via the browser back button) reopens the panel with the same rows and scroll offset. On browsers that restore the page from the back/forward cache the panel simply reappears frozen as you left it, and the marker is consumed so it can't fire again later. Markers expire after an hour or on navigating anywhere else.

## Verify

- DevTools → Network: the list loads via a `GET` to `.../get_discussions` returning `{ data: [...], has_next_page: ... }` — cookies only, no CSRF token needed for reads.
- Logged out you'll see a "log in" message instead of the list (the endpoint returns 403).
- Toggle Gameplan's dark mode — the panel follows, since it uses the app's CSS custom properties.

## Build & distribute (without the stores)

`./build.sh` produces sideloadable packages in `dist/`:

- `mgca-<version>-chrome.zip` — manifest as-is. Teammates unzip it and **Load unpacked**; managed browsers can force-install it via enterprise policy (`ExtensionInstallForcelist` / `ExtensionSettings`). Note that regular Chrome on Windows/macOS refuses `.crx` files from outside the Web Store, so policy or Load unpacked are the only real channels.
- `mgca-<version>-firefox.zip` (and its unzipped source in `dist/firefox-src/`) — same code, plus `gecko.update_url` baked in when `UPDATE_BASE_URL` is set. Release Firefox only installs **signed** extensions, so run it through Mozilla's self-distribution channel — the add-on is signed but never publicly listed.

### Firefox self-distribution flow

1. Get AMO API credentials: https://addons.mozilla.org/developers/addon/api/key/
2. Build and sign (needs Node for `npx web-ext`):

   ```sh
   UPDATE_BASE_URL=https://your-host.example/mgca \
   AMO_JWT_ISSUER=user:xxx AMO_JWT_SECRET=yyy \
   ./build.sh sign
   ```

3. Upload the signed `.xpi` from `dist/` to `https://your-host.example/mgca/mgca-<version>.xpi` (serving it with `Content-Type: application/x-xpinstall` lets Firefox install it on click) and upload `dist/updates.json` next to it.
4. Users install by opening the `.xpi` URL in Firefox. Installed copies auto-update: Firefox polls `updates.json`, so shipping an update is bump `version` in `manifest.json` → rebuild → sign → upload the new `.xpi` → replace `updates.json`.

Skip `UPDATE_BASE_URL` if you don't want auto-updates, and skip `sign` if your users run Firefox Developer Edition/Nightly/ESR with `xpinstall.signatures.required = false` — they can install the unsigned `mgca-<version>-firefox.zip` directly.
