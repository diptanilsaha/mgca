const api = globalThis.browser ?? globalThis.chrome

const SCRIPT_ID = 'mgca'

// Single source of truth for content-script registration: reconcile the
// configured origins in storage with the actually-granted host permissions.
async function syncRegistrations() {
  const { origins = [] } = await api.storage.sync.get({ origins: [] })

  const granted = []
  for (const origin of origins) {
    try {
      if (await api.permissions.contains({ origins: [origin + '/*'] })) {
        granted.push(origin)
      }
    } catch (e) {
      // invalid pattern in storage — skip it
    }
  }

  // Clear every registration this extension owns, not just SCRIPT_ID — a
  // registration left over from an older id would otherwise double-inject.
  const existing = await api.scripting.getRegisteredContentScripts()
  if (existing.length) {
    await api.scripting.unregisterContentScripts({ ids: existing.map((script) => script.id) })
  }

  if (granted.length) {
    await api.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        matches: granted.map((origin) => origin + '/*'),
        js: ['content/content.js'],
        css: ['content/content.css'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ])
  }
}

// Runs in the page via activeTab to check for a Gameplan frontend before
// activating. Mirrors the markers content.js checks.
function detectGameplan() {
  if (document.querySelector('link[rel="manifest"][href*="gameplan"]')) return true
  const app = document.getElementById('app')
  return (
    !!app &&
    Array.from(document.scripts).some((s) => !s.src && /frappe|gameplan/i.test(s.textContent || ''))
  )
}

async function flashBadge(tabId, text, title) {
  await api.action.setBadgeText({ tabId, text })
  await api.action.setTitle({ tabId, title })
  setTimeout(() => {
    api.action.setBadgeText({ tabId, text: '' })
    api.action.setTitle({ tabId, title: 'MGCA: activate on this Gameplan site' })
  }, 2500)
}

// One-click activation: on a page with Gameplan UI, inject immediately via
// activeTab (no prompt), open the panel, then best-effort request permanent
// host permission so future loads auto-activate.
api.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) return
  const origin = new URL(tab.url).origin

  let isGameplan = false
  try {
    const [probe] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: detectGameplan,
    })
    isGameplan = !!(probe && probe.result)
  } catch (e) {
    // page not scriptable (browser UI page, PDF, ...)
  }
  if (!isGameplan) {
    flashBadge(tab.id, '✕', 'MGCA: this does not look like a Gameplan site')
    return
  }

  await api.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content/content.css'] })
  await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] })
  // content.js listens for this in the same isolated world and opens the panel
  await api.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.dispatchEvent(new CustomEvent('gpx-open')),
  })

  try {
    const granted = await api.permissions.request({ origins: [origin + '/*'] })
    if (granted) {
      const { origins = [] } = await api.storage.sync.get({ origins: [] })
      if (!origins.includes(origin)) {
        origins.push(origin)
        await api.storage.sync.set({ origins })
      }
      await syncRegistrations()
    }
  } catch (e) {
    // Some browsers reject permissions.request here (gesture already spent).
    // The activeTab injection above still works for this tab; permanence can
    // be granted any time from the options page.
  }
})

api.runtime.onInstalled.addListener(() => syncRegistrations())
api.runtime.onStartup.addListener(() => syncRegistrations())
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
