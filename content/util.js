// Shared low-level helpers for the MGCA content script bundle.
// Every content file is a classic script; they share state through the
// window.__gpx namespace (isolated world), loaded in the order background.js
// lists them.
;(() => {
  const gpx = (window.__gpx = window.__gpx || {})

  // ---------- Gameplan detection ----------

  gpx.hasGameplanMarkers = function hasGameplanMarkers() {
    if (document.querySelector('link[rel="manifest"][href*="gameplan"]')) return true
    const app = document.getElementById('app')
    return (
      !!app &&
      Array.from(document.scripts).some(
        (s) => !s.src && /frappe|gameplan/i.test(s.textContent || ''),
      )
    )
  }

  gpx.onGameplanRoute = function onGameplanRoute() {
    return location.pathname === '/g' || location.pathname.startsWith('/g/')
  }

  // ---------- SVG helpers (static markup only, never server data) ----------

  const ICONS = {
    space:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
    reply:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    poll: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>',
  }

  gpx.svgSpan = function svgSpan(name, className) {
    const span = document.createElement('span')
    span.className = className || ''
    span.innerHTML = ICONS[name]
    return span
  }

  // ---------- Timestamps ----------

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  gpx.relativeTimestamp = function relativeTimestamp(value) {
    const date = parseTimestamp(value)
    if (!date) return ''
    const diff = Date.now() - date.getTime()
    const DAY = 86400000
    if (diff < 3 * DAY) {
      if (diff < 60000) return 'just now'
      const minutes = Math.floor(diff / 60000)
      if (minutes < 60) return minutes === 1 ? 'a minute ago' : `${minutes} minutes ago`
      const hours = Math.floor(diff / 3600000)
      if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
      const days = Math.floor(diff / DAY)
      return days === 1 ? 'a day ago' : `${days} days ago`
    }
    const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`
    return diff < 365 * DAY ? label : `${label} ${date.getFullYear()}`
  }

  function parseTimestamp(value) {
    if (!value) return null
    // Frappe sends "YYYY-MM-DD HH:MM:SS.ffffff" — not ISO until the space goes.
    const date = new Date(String(value).replace(' ', 'T'))
    return isNaN(date.getTime()) ? null : date
  }
})()
