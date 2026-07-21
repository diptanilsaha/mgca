const api = globalThis.browser ?? globalThis.chrome

const SCRIPT_ID = 'mgca'

const form = document.getElementById('add-form')
const input = document.getElementById('origin-input')
const errorEl = document.getElementById('error')
const listEl = document.getElementById('origin-list')
const emptyEl = document.getElementById('empty')

function showError(message) {
  errorEl.textContent = message
  errorEl.hidden = !message
}

function normalizeOrigin(value) {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed.includes('://') ? trimmed : 'https://' + trimmed).origin
  } catch (e) {
    return null
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  showError('')

  const origin = normalizeOrigin(input.value)
  if (!origin) {
    showError('Enter a valid URL, e.g. https://gameplan.example.com')
    return
  }

  // permissions.request must be called synchronously inside the user gesture
  // (Firefox rejects it after an await), so no storage reads before this.
  api.permissions
    .request({ origins: [origin + '/*'] })
    .then(async (granted) => {
      if (!granted) {
        showError('Permission was not granted for ' + origin)
        return
      }
      const { origins = [] } = await api.storage.sync.get({ origins: [] })
      if (!origins.includes(origin)) {
        origins.push(origin)
        await api.storage.sync.set({ origins })
      }
      await api.runtime.sendMessage({ type: 'sync-registrations' })
      input.value = ''
      render()
    })
    .catch((error) => showError(String(error)))
})

async function removeOrigin(origin) {
  const { origins = [] } = await api.storage.sync.get({ origins: [] })
  await api.storage.sync.set({ origins: origins.filter((o) => o !== origin) })
  try {
    await api.permissions.remove({ origins: [origin + '/*'] })
  } catch (e) {
    // permission may already be gone
  }
  await api.runtime.sendMessage({ type: 'sync-registrations' })
  render()
}

async function render() {
  const { origins = [] } = await api.storage.sync.get({ origins: [] })

  const registered = await api.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })
  const registeredMatches = registered.length ? registered[0].matches || [] : []

  listEl.textContent = ''
  emptyEl.hidden = origins.length > 0

  for (const origin of origins) {
    const hasPermission = await api.permissions
      .contains({ origins: [origin + '/*'] })
      .catch(() => false)
    const isRegistered = registeredMatches.includes(origin + '/*')
    const active = hasPermission && isRegistered

    const li = document.createElement('li')

    const dot = document.createElement('span')
    dot.className = 'status-dot' + (active ? ' active' : '')
    li.appendChild(dot)

    const url = document.createElement('span')
    url.className = 'origin-url'
    url.textContent = origin
    li.appendChild(url)

    const status = document.createElement('span')
    status.className = 'status-label'
    status.textContent = active ? 'active' : hasPermission ? 'not registered' : 'no permission'
    li.appendChild(status)

    const remove = document.createElement('button')
    remove.className = 'remove-btn'
    remove.textContent = '×'
    remove.title = 'Remove ' + origin
    remove.addEventListener('click', () => removeOrigin(origin))
    li.appendChild(remove)

    listEl.appendChild(li)
  }
}

render()
