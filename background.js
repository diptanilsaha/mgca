const api = globalThis.browser ?? globalThis.chrome

const SCRIPT_ID = 'mgca'

// Load order matters: main.js boots off what the earlier files put on
// window.__gpx, so it goes last.
const CONTENT_JS = [
  'content/util.js',
  'content/api.js',
  'content/return-flow.js',
  'content/rows.js',
  'content/panel.js',
  'content/rail.js',
  'content/main.js',
]
const CONTENT_CSS = ['content/rail.css', 'content/panel.css']

// Single-host match pattern like "http://gameplan.localhost:8003/*"
const HOST_PATTERN = /^https?:\/\/[^*/]+\/\*$/

// One-click activation. permissions.request MUST be the first call, made
// synchronously inside the click gesture — after any await the browser
// treats the request as gesture-less and rejects it, which silently degrades
// activation to the per-tab activeTab grant that dies on reload. So: request
// the permanent grant first, then probe; if the page turns out not to be
// Gameplan, release the permission again.
api.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) return
  const tabId = tab.id
  const pattern = new URL(tab.url).origin + '/*'

  const requesting = api.permissions.request({ origins: [pattern] }).catch(() => false)

  requesting.then((granted) => activate(tabId, pattern, granted))
})

async function activate(tabId, pattern, granted) {
  if (!(await probeIsGameplan(tabId))) {
    if (granted) {
      await api.permissions.remove({ origins: [pattern] }).catch(() => {})
    }
    flashBadge(tabId, '✕', 'MGCA: this does not look like a Gameplan site')
    return
  }

  if (granted) {
    // Permanent: registers the content script so every future page load
    // auto-activates until the permission is removed. A registration
    // failure must not block injecting into this tab right now.
    try {
      await syncRegistrations()
    } catch (e) {
      // onAdded listener retries; this tab still gets the one-off injection
    }
  }

  // Inject into this tab now either way (activeTab covers a denied prompt):
  // the "All Discussions" button appears in the rail, and the user opens
  // the panel from there.
  await api.scripting.insertCSS({ target: { tabId }, files: CONTENT_CSS })
  await api.scripting.executeScript({ target: { tabId }, files: CONTENT_JS })
}

api.runtime.onInstalled.addListener(() => syncRegistrations())
api.runtime.onStartup.addListener(() => syncRegistrations())
api.permissions.onAdded.addListener(() => syncRegistrations())
api.permissions.onRemoved.addListener(() => syncRegistrations())

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'sync-registrations') {
    syncRegistrations().then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: String(error) }),
    )
    return true // keep the message channel open for the async response
  }
})

// Single source of truth for content-script registration: every granted host
// permission gets the content script registered, so an allowed Gameplan site
// loads the extension on page load — no matter how the permission was granted
// (our prompt, the options page, or the browser's own site-access settings).
//
// Single-flight: granting via our prompt resolves permissions.request AND
// fires permissions.onAdded, so two syncs start near-simultaneously and race
// on unregister/register ("Duplicate script ID"). Queue them instead.
let syncChain = Promise.resolve()
function syncRegistrations() {
  const run = syncChain.then(doSyncRegistrations, doSyncRegistrations)
  syncChain = run.catch(() => {})
  return run
}

async function doSyncRegistrations() {
  const { origins: grantedPatterns = [] } = await api.permissions.getAll()
  const matches = grantedPatterns.filter((pattern) => HOST_PATTERN.test(pattern))

  // Mirror into storage so the options page lists what's actually active.
  await api.storage.sync.set({ origins: matches.map((pattern) => pattern.slice(0, -2)) })

  // Clear every registration this extension owns, not just SCRIPT_ID — a
  // registration left over from an older id would otherwise double-inject.
  const existing = await api.scripting.getRegisteredContentScripts()
  if (existing.length) {
    await api.scripting.unregisterContentScripts({ ids: existing.map((script) => script.id) })
  }

  if (matches.length) {
    await api.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        matches,
        js: CONTENT_JS,
        css: CONTENT_CSS,
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ])
  }
}

// Runs in the page via activeTab; mirrors the markers content/util.js checks.
function detectGameplan() {
  if (document.querySelector('link[rel="manifest"][href*="gameplan"]')) return true
  const app = document.getElementById('app')
  return (
    !!app &&
    Array.from(document.scripts).some((s) => !s.src && /frappe|gameplan/i.test(s.textContent || ''))
  )
}

async function probeIsGameplan(tabId) {
  try {
    const [probe] = await api.scripting.executeScript({ target: { tabId }, func: detectGameplan })
    return !!(probe && probe.result)
  } catch (e) {
    return false // page not scriptable (browser UI page, PDF, ...)
  }
}

async function flashBadge(tabId, text, title) {
  await api.action.setBadgeText({ tabId, text })
  await api.action.setTitle({ tabId, title })
  setTimeout(() => {
    api.action.setBadgeText({ tabId, text: '' })
    api.action.setTitle({ tabId, title: 'MGCA: activate on this Gameplan site' })
  }, 2500)
}
