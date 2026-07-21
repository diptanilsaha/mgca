// Back-from-post flow. The app's own back affordances (mobile
// PageHeaderBackButton, desktop breadcrumb) route to SpaceDiscussions — they
// don't know about our panel. When a post is opened from the panel we save a
// per-tab return marker; on the post page we intercept those "back" targets
// and use history.back() instead, and when we land back on the saved URL (via
// that or the native browser back) we reopen the panel with its list state.
;(() => {
  const gpx = (window.__gpx = window.__gpx || {})

  const RETURN_KEY = 'gpx-return'
  const RETURN_MAX_AGE = 60 * 60 * 1000

  class ReturnFlow {
    constructor(panel) {
      this.panel = panel
    }

    start() {
      // On a back/forward-cache restore the frozen page already shows the
      // panel exactly as it was — consume the marker so it can't fire again.
      window.addEventListener('pageshow', (event) => {
        if (!event.persisted) return
        const current = read()
        if (current && location.href === current.returnUrl) clear()
      })

      const ret = read()
      if (!ret) return

      if (location.href === ret.returnUrl) {
        clear()
        this.panel.pendingRestore = { loaded: ret.loaded, scrollTop: ret.scrollTop }
        this.panel.open()
        return
      }

      if (location.pathname === ret.postPath) {
        this.interceptBackTargets()
        return
      }

      // Landed somewhere else entirely — the marker is stale.
      clear()
    }

    // Called by the panel when a row is opened in the same tab.
    save(row, postHref) {
      const scroll = this.panel.scrollEl()
      const spacePath = row.team
        ? `/g/community/${encodeURIComponent(row.team)}/space/${encodeURIComponent(row.project)}`
        : null
      try {
        sessionStorage.setItem(
          RETURN_KEY,
          JSON.stringify({
            returnUrl: location.href,
            postPath: new URL(postHref).pathname,
            spacePath,
            loaded: this.panel.rows.length,
            scrollTop: scroll ? scroll.scrollTop : 0,
            ts: Date.now(),
          }),
        )
      } catch (e) {
        // sessionStorage unavailable — back flow degrades gracefully
      }
    }

    interceptBackTargets() {
      document.addEventListener(
        'click',
        (event) => {
          const current = read()
          if (!current || location.pathname !== current.postPath) return
          if (!(event.target instanceof Element)) return
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return
          if (isBackTarget(event.target, current)) {
            event.preventDefault()
            event.stopPropagation()
            history.back()
          }
        },
        true,
      )
    }
  }

  function read() {
    try {
      const raw = sessionStorage.getItem(RETURN_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed.returnUrl || Date.now() - (parsed.ts || 0) > RETURN_MAX_AGE) {
        clear()
        return null
      }
      return parsed
    } catch (e) {
      return null
    }
  }

  function clear() {
    sessionStorage.removeItem(RETURN_KEY)
  }

  function isBackTarget(el, ret) {
    const link = el.closest('a')
    if (link && ret.spacePath) {
      const href = link.getAttribute('href')
      if (href) {
        try {
          const path = new URL(href, location.origin).pathname
          if (path === ret.spacePath || path === ret.spacePath + '/discussions') return true
        } catch (e) {
          // unparsable href — not ours
        }
      }
    }
    const button = el.closest('button, a')
    return !!(button && button.querySelector('[class*="arrow-left"]'))
  }

  gpx.ReturnFlow = ReturnFlow
})()
