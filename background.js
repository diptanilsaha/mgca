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
