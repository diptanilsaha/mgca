// The full-width "All Discussions" overlay panel: list state, fetching,
// open/close lifecycle, and dismissal handling.
;(() => {
  const gpx = (window.__gpx = window.__gpx || {})

  const PAGE_SIZE = 20

  class Panel {
    constructor(api) {
      this.api = api
      this.returnFlow = null // wired by main.js (mutual reference)
      this.rail = null // wired by Rail
      this.isOpen = false
      this.el = null
      this.rows = []
      this.start = 0
      this.hasNext = false
      this.loading = false
      this.pendingRestore = null

      // Stable references so close() can remove exactly what open() added.
      this.onDocumentClick = (event) => {
        if (!this.isOpen) return
        if (this.el && this.el.contains(event.target)) return
        if (this.rail && this.rail.buttonEl && this.rail.buttonEl.contains(event.target)) return
        // A click on the native rail (or anything else outside) dismisses the
        // overlay but must not block native navigation.
        this.close()
      }
      this.onKeydown = (event) => {
        if (event.key === 'Escape' && this.isOpen) this.close()
      }
      this.onPopstate = () => this.close()
      this.onResize = () => this.position()
    }

    toggle() {
      this.isOpen ? this.close() : this.open()
    }

    open() {
      if (this.isOpen) return
      this.isOpen = true
      this.el = build()
      document.body.appendChild(this.el)
      this.position()
      if (this.rail) this.rail.setActive(true)

      // Push a same-URL history entry so the browser Back button closes the
      // panel instead of navigating the SPA away. The panel is pure DOM with
      // no history of its own, so without this Back pops the real route out
      // from under the overlay (Firefox surfaced this; the popstate handler
      // below only ran *after* that navigation). Reuse an existing overlay
      // entry rather than stacking duplicates on repeated open/close.
      try {
        if (!(history.state && history.state.gpxOverlay)) {
          history.pushState(Object.assign({}, history.state, { gpxOverlay: true }), '')
        }
      } catch (e) {
        // history API unavailable — Back degrades to its old behavior
      }

      document.addEventListener('click', this.onDocumentClick, true)
      document.addEventListener('keydown', this.onKeydown, true)
      window.addEventListener('popstate', this.onPopstate)
      window.addEventListener('resize', this.onResize)

      const restore = this.pendingRestore
      this.pendingRestore = null
      if (restore && restore.loaded > 0) {
        this.rows = []
        this.start = 0
        this.loadMore(Math.max(restore.loaded, PAGE_SIZE)).then(() => {
          const scroll = this.scrollEl()
          if (scroll) scroll.scrollTop = restore.scrollTop || 0
        })
      } else if (!this.rows.length) {
        this.start = 0
        this.loadMore()
      } else {
        this.renderRows()
        this.renderFooter()
      }
    }

    close() {
      if (!this.isOpen) return
      this.isOpen = false
      if (this.el) {
        this.el.remove()
        this.el = null
      }
      if (this.rail) this.rail.setActive(false)
      document.removeEventListener('click', this.onDocumentClick, true)
      document.removeEventListener('keydown', this.onKeydown, true)
      window.removeEventListener('popstate', this.onPopstate)
      window.removeEventListener('resize', this.onResize)
    }

    position() {
      if (!this.el) return
      let left = 50
      const railRoot = this.rail && this.rail.findRailRoot()
      const railColumn =
        this.rail && this.rail.buttonEl && this.rail.buttonEl.closest('[class*="w-\\[50px\\]"]')
      if (railRoot) {
        left = Math.round(railRoot.getBoundingClientRect().right)
      } else if (railColumn) {
        left = Math.round(railColumn.getBoundingClientRect().right)
      }
      this.el.style.left = left + 'px'
    }

    async loadMore(limit) {
      if (this.loading) return
      this.loading = true
      this.renderFooter()
      try {
        const [page, userMap] = await Promise.all([
          this.api.discussions(this.start, limit || PAGE_SIZE),
          this.api.users(),
        ])
        this.userMap = userMap
        this.rows.push(...page.rows)
        this.start += page.rows.length
        this.hasNext = page.hasNext
        this.renderRows()
      } catch (error) {
        this.renderError(error)
      } finally {
        this.loading = false
        this.renderFooter()
      }
    }

    renderRows() {
      const list = this.listEl()
      if (!list) return
      list.textContent = ''
      if (!this.rows.length && !this.loading) {
        list.appendChild(message('No discussions found.'))
        return
      }
      const deps = {
        userMap: this.userMap,
        onNavigate: (row, href) => {
          if (this.returnFlow) this.returnFlow.save(row, href)
        },
      }
      for (const row of this.rows) {
        list.appendChild(gpx.buildDiscussionRow(row, deps))
      }
    }

    renderError(error) {
      const list = this.listEl()
      if (!list) return
      list.textContent = ''
      const text =
        error && error.status === 403
          ? 'You need to log in to Gameplan to see discussions.'
          : 'Could not load discussions. ' + (error && error.message ? error.message : '')
      list.appendChild(message(text))
    }

    renderFooter() {
      const footer = this.el && this.el.querySelector('.gpx-footer')
      if (!footer) return
      footer.textContent = ''
      if (this.loading) {
        footer.appendChild(message('Loading…'))
      } else if (this.hasNext) {
        const button = document.createElement('button')
        button.className = 'gpx-load-more'
        button.textContent = 'Load more'
        button.addEventListener('click', () => this.loadMore())
        footer.appendChild(button)
      }
    }

    listEl() {
      return this.el && this.el.querySelector('.gpx-list')
    }

    scrollEl() {
      return this.el && this.el.querySelector('.gpx-scroll')
    }
  }

  function build() {
    const overlay = document.createElement('div')
    overlay.className = 'gpx-overlay'

    const main = document.createElement('main')
    main.className = 'gpx-main'

    const header = document.createElement('header')
    header.className = 'gpx-header'
    const title = document.createElement('div')
    title.className = 'gpx-crumb-current'
    title.appendChild(gpx.svgSpan('space', 'gpx-crumb-icon'))
    const titleText = document.createElement('span')
    titleText.textContent = 'All Discussions'
    title.appendChild(titleText)
    header.appendChild(title)
    main.appendChild(header)

    const scroll = document.createElement('div')
    scroll.className = 'gpx-scroll'

    const tabs = document.createElement('div')
    tabs.className = 'gpx-tabs'
    const tab = document.createElement('span')
    tab.className = 'gpx-tab gpx-tab--active'
    tab.textContent = 'Discussions'
    tabs.appendChild(tab)
    scroll.appendChild(tabs)

    const list = document.createElement('div')
    list.className = 'gpx-list'
    scroll.appendChild(list)

    const footer = document.createElement('div')
    footer.className = 'gpx-footer'
    scroll.appendChild(footer)

    main.appendChild(scroll)
    overlay.appendChild(main)
    return overlay
  }

  function message(text) {
    const el = document.createElement('div')
    el.className = 'gpx-message'
    el.textContent = text
    return el
  }

  gpx.Panel = Panel
})()
