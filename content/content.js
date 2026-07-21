// Gameplan "All Discussions" — injects a community icon into the Gameplan rail
// that opens a panel listing every discussion across all communities/spaces.
;(() => {
  if (window.__gpxInjected) return
  window.__gpxInjected = true

  const PAGE_SIZE = 20
  const RETURN_KEY = 'gpx-return'
  const RETURN_MAX_AGE = 60 * 60 * 1000

  const state = {
    open: false,
    start: 0,
    hasNext: false,
    loading: false,
    rows: [],
    userMap: null,
    overlayEl: null,
    railItemEl: null,
    pendingRestore: null,
  }

  // ---------- Gameplan detection ----------

  function hasGameplanMarkers() {
    if (document.querySelector('link[rel="manifest"][href*="gameplan"]')) return true
    const app = document.getElementById('app')
    if (
      app &&
      Array.from(document.scripts).some(
        (s) => !s.src && /frappe|gameplan/i.test(s.textContent || ''),
      )
    ) {
      return true
    }
    return false
  }

  function onGameplanRoute() {
    return location.pathname === '/g' || location.pathname.startsWith('/g/')
  }

  if (!hasGameplanMarkers()) return

  // ---------- Back-from-post flow ----------
  // The app's own back affordances (mobile PageHeaderBackButton, desktop
  // breadcrumb) route to SpaceDiscussions/Discussions — they don't know about
  // our panel. When a post is opened from the panel we save a per-tab return
  // marker; on the post page we intercept those "back" targets and use
  // history.back() instead, and when we land back on the saved URL (via that
  // or the native browser back) we reopen the panel with its list state.

  function getReturnState() {
    try {
      const raw = sessionStorage.getItem(RETURN_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed.returnUrl || Date.now() - (parsed.ts || 0) > RETURN_MAX_AGE) {
        sessionStorage.removeItem(RETURN_KEY)
        return null
      }
      return parsed
    } catch (e) {
      return null
    }
  }

  function saveReturnState(row, postHref) {
    const scroll = state.overlayEl && state.overlayEl.querySelector('.gpx-scroll')
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
          loaded: state.rows.length,
          scrollTop: scroll ? scroll.scrollTop : 0,
          ts: Date.now(),
        }),
      )
    } catch (e) {
      // sessionStorage unavailable — back flow degrades gracefully
    }
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
    if (button && button.querySelector('[class*="arrow-left"]')) return true
    return false
  }

  function setupReturnFlow() {
    // On a back/forward-cache restore the frozen page already shows the panel
    // exactly as it was — consume the marker so it can't fire again later.
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return
      const current = getReturnState()
      if (current && location.href === current.returnUrl) {
        sessionStorage.removeItem(RETURN_KEY)
      }
    })

    const ret = getReturnState()
    if (!ret) return

    if (location.href === ret.returnUrl) {
      sessionStorage.removeItem(RETURN_KEY)
      state.pendingRestore = { loaded: ret.loaded, scrollTop: ret.scrollTop }
      openOverlay()
      return
    }

    if (location.pathname === ret.postPath) {
      document.addEventListener(
        'click',
        (event) => {
          const current = getReturnState()
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
      return
    }

    // Landed somewhere else entirely — the marker is stale.
    sessionStorage.removeItem(RETURN_KEY)
  }

  // ---------- SVG helpers (static markup only, never server data) ----------

  const ICONS = {
    // lucide message-circle on a dark rounded square, sized like CommunityImage
    rail: '<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="28" rx="7" fill="#383838"/><g transform="translate(5 5) scale(0.75)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></g></svg>',
    space:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
    reply:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    poll: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>',
  }

  function svgSpan(name, className) {
    const span = document.createElement('span')
    span.className = className || ''
    span.innerHTML = ICONS[name]
    return span
  }

  // ---------- API ----------

  async function apiGet(methodPath, params) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    const opts = {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    }
    let res = await fetch(`${location.origin}/api/v2/method/${methodPath}${qs}`, opts)
    if (res.status === 404) {
      // older Frappe without /api/v2
      res = await fetch(`${location.origin}/api/method/${methodPath}${qs}`, opts)
    }
    if (!res.ok) {
      const error = new Error('Request failed with HTTP ' + res.status)
      error.status = res.status
      throw error
    }
    return res.json()
  }

  async function ensureUserMap() {
    if (state.userMap) return state.userMap
    try {
      const json = await apiGet('gameplan.api.get_user_info')
      const users = json.data ?? json.message ?? []
      state.userMap = new Map(users.map((u) => [u.name, u]))
    } catch (e) {
      state.userMap = new Map()
    }
    return state.userMap
  }

  async function loadMore(limit) {
    if (state.loading) return
    state.loading = true
    renderFooter()
    try {
      const [json] = await Promise.all([
        apiGet('gameplan.gameplan.doctype.gp_discussion.api.get_discussions', {
          order_by: 'last_post_at desc',
          start: String(state.start),
          limit: String(limit || PAGE_SIZE),
        }),
        ensureUserMap(),
      ])
      const rows = json.data ?? json.message ?? []
      state.rows.push(...rows)
      state.start += rows.length
      state.hasNext = !!json.has_next_page
      renderRows()
    } catch (error) {
      renderError(error)
    } finally {
      state.loading = false
      renderFooter()
    }
  }

  // ---------- Formatting ----------

  function parseTimestamp(value) {
    if (!value) return null
    const date = new Date(String(value).replace(' ', 'T'))
    return isNaN(date.getTime()) ? null : date
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  function relativeTimestamp(value) {
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

  function discussionUrl(row) {
    const slug = row.slug ? `/${encodeURIComponent(row.slug)}` : ''
    if (row.team) {
      return `${location.origin}/g/community/${encodeURIComponent(row.team)}/space/${encodeURIComponent(
        row.project,
      )}/discussion/${encodeURIComponent(row.name)}${slug}`
    }
    return `${location.origin}/g/space/${encodeURIComponent(row.project)}/discussion/${encodeURIComponent(
      row.name,
    )}${slug}`
  }

  // ---------- Row rendering ----------

  function buildAvatar(email) {
    const user = state.userMap && state.userMap.get(email)
    const wrap = document.createElement('div')
    wrap.className = 'gpx-avatar'
    if (user && user.user_image) {
      const img = document.createElement('img')
      img.src = user.user_image
      img.alt = ''
      wrap.appendChild(img)
    } else {
      const name = (user && user.full_name) || email || '?'
      wrap.textContent = name.trim().charAt(0).toUpperCase()
      if (user && user.image_background_color) {
        wrap.style.background = user.image_background_color
      }
    }
    return wrap
  }

  function fullNameOf(email) {
    const user = state.userMap && state.userMap.get(email)
    return ((user && user.full_name) || email || '').trim()
  }

  function buildRow(row) {
    const link = document.createElement('a')
    link.className = 'gpx-row'
    link.href = discussionUrl(row)
    link.addEventListener('click', (event) => {
      // Only same-tab navigations should arm the back-from-post flow.
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        saveReturnState(row, link.href)
      }
    })

    link.appendChild(buildAvatar(row.owner))

    const main = document.createElement('div')
    main.className = 'gpx-row-main'

    const title = document.createElement('div')
    title.className = 'gpx-row-title' + (row.unread ? ' gpx-unread' : '')
    title.textContent = row.title || 'Untitled'
    main.appendChild(title)

    const sub = document.createElement('div')
    sub.className = 'gpx-row-sub'
    if (row.closed_at) {
      sub.appendChild(svgSpan('lock', 'gpx-sub-icon'))
    } else if (row.last_post_type === 'GP Comment') {
      sub.appendChild(svgSpan('reply', 'gpx-sub-icon'))
    } else if (row.last_post_type === 'GP Poll') {
      sub.appendChild(svgSpan('poll', 'gpx-sub-icon'))
    }
    const subText = document.createElement('span')
    subText.className = 'gpx-sub-text'
    const preview = row.last_comment_content || row.last_poll_title || ''
    subText.textContent = `${fullNameOf(row.last_post_by || row.owner)} in ${
      row.project_title || 'Unknown space'
    }: ${preview}`
    sub.appendChild(subText)
    main.appendChild(sub)
    link.appendChild(main)

    const meta = document.createElement('div')
    meta.className = 'gpx-row-meta'
    const time = document.createElement('div')
    time.className = 'gpx-time'
    time.textContent = relativeTimestamp(row.last_post_at || row.creation)
    meta.appendChild(time)
    const badge = document.createElement('span')
    if (row.unread) {
      badge.className = 'gpx-badge gpx-badge--unread'
      badge.textContent = String(row.unread)
    } else {
      badge.className = 'gpx-badge'
      badge.textContent = String((row.comments_count || 0) + 1)
    }
    meta.appendChild(badge)
    link.appendChild(meta)

    return link
  }

  function listEl() {
    return state.overlayEl && state.overlayEl.querySelector('.gpx-list')
  }

  function renderRows() {
    const list = listEl()
    if (!list) return
    list.textContent = ''
    if (!state.rows.length && !state.loading) {
      const empty = document.createElement('div')
      empty.className = 'gpx-message'
      empty.textContent = 'No discussions found.'
      list.appendChild(empty)
      return
    }
    for (const row of state.rows) {
      list.appendChild(buildRow(row))
    }
  }

  function renderError(error) {
    const list = listEl()
    if (!list) return
    list.textContent = ''
    const message = document.createElement('div')
    message.className = 'gpx-message'
    message.textContent =
      error && error.status === 403
        ? 'You need to log in to Gameplan to see discussions.'
        : 'Could not load discussions. ' + (error && error.message ? error.message : '')
    list.appendChild(message)
  }

  function renderFooter() {
    const footer = state.overlayEl && state.overlayEl.querySelector('.gpx-footer')
    if (!footer) return
    footer.textContent = ''
    if (state.loading) {
      const loading = document.createElement('div')
      loading.className = 'gpx-message'
      loading.textContent = 'Loading…'
      footer.appendChild(loading)
    } else if (state.hasNext) {
      const button = document.createElement('button')
      button.className = 'gpx-load-more'
      button.textContent = 'Load more'
      button.addEventListener('click', () => loadMore())
      footer.appendChild(button)
    }
  }

  // ---------- Overlay ----------

  function buildOverlay() {
    const overlay = document.createElement('div')
    overlay.className = 'gpx-overlay'

    const main = document.createElement('main')
    main.className = 'gpx-main'

    const header = document.createElement('header')
    header.className = 'gpx-header'
    const title = document.createElement('div')
    title.className = 'gpx-crumb-current'
    title.appendChild(svgSpan('space', 'gpx-crumb-icon'))
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

  function positionOverlay() {
    if (!state.overlayEl) return
    let left = 50
    const rail = state.railItemEl && state.railItemEl.closest('[class*="w-\\[50px\\]"]')
    const railRoot = findRailRoot()
    if (railRoot) {
      left = Math.round(railRoot.getBoundingClientRect().right)
    } else if (rail) {
      left = Math.round(rail.getBoundingClientRect().right)
    }
    state.overlayEl.style.left = left + 'px'
  }

  function onDocumentClick(event) {
    if (!state.open) return
    const target = event.target
    if (state.overlayEl && state.overlayEl.contains(target)) return
    if (state.railItemEl && state.railItemEl.contains(target)) return
    // A click on the native rail (or anything else outside) dismisses the
    // overlay but must not block native navigation.
    closeOverlay()
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && state.open) {
      closeOverlay()
    }
  }

  function openOverlay() {
    if (state.open) return
    state.open = true
    state.overlayEl = buildOverlay()
    document.body.appendChild(state.overlayEl)
    positionOverlay()
    if (state.railItemEl) state.railItemEl.classList.add('gpx-active')

    document.addEventListener('click', onDocumentClick, true)
    document.addEventListener('keydown', onKeydown, true)
    window.addEventListener('popstate', closeOverlay)
    window.addEventListener('resize', positionOverlay)

    const restore = state.pendingRestore
    state.pendingRestore = null
    if (restore && restore.loaded > 0) {
      state.rows = []
      state.start = 0
      loadMore(Math.max(restore.loaded, PAGE_SIZE)).then(() => {
        const scroll = state.overlayEl && state.overlayEl.querySelector('.gpx-scroll')
        if (scroll) scroll.scrollTop = restore.scrollTop || 0
      })
    } else if (!state.rows.length) {
      state.start = 0
      loadMore()
    } else {
      renderRows()
      renderFooter()
    }
  }

  function closeOverlay() {
    if (!state.open) return
    state.open = false
    if (state.overlayEl) {
      state.overlayEl.remove()
      state.overlayEl = null
    }
    if (state.railItemEl) state.railItemEl.classList.remove('gpx-active')
    document.removeEventListener('click', onDocumentClick, true)
    document.removeEventListener('keydown', onKeydown, true)
    window.removeEventListener('popstate', closeOverlay)
    window.removeEventListener('resize', positionOverlay)
  }

  function toggleOverlay() {
    if (state.open) {
      closeOverlay()
    } else {
      openOverlay()
    }
  }

  // ---------- Rail injection ----------

  function findRailList() {
    // AppRail.vue: <div class="flex w-[50px] flex-col items-center gap-3"> holding
    // the community RailItem buttons.
    for (const el of document.querySelectorAll('.w-\\[50px\\].flex-col.gap-3')) {
      if (el.querySelector('button')) return el
    }
    return null
  }

  function findRailRoot() {
    // Geometry fallback: leftmost narrow full-height column.
    for (const el of document.querySelectorAll('body div, body nav, body aside')) {
      if (el.closest('.gpx-overlay')) continue
      const rect = el.getBoundingClientRect()
      if (
        rect.left >= 0 &&
        rect.left < 20 &&
        rect.width >= 40 &&
        rect.width <= 70 &&
        rect.height > window.innerHeight * 0.5
      ) {
        return el
      }
    }
    return null
  }

  function buildRailItem() {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'gpx-rail-item'
    button.title = 'All Discussions'
    button.setAttribute('aria-label', 'All Discussions')
    button.appendChild(svgSpan('rail', 'gpx-rail-icon'))
    button.addEventListener('click', toggleOverlay)
    return button
  }

  function ensureInjected() {
    if (!onGameplanRoute()) {
      if (state.railItemEl) {
        state.railItemEl.remove()
        state.railItemEl = null
      }
      closeOverlay()
      return
    }
    if (state.railItemEl && document.contains(state.railItemEl)) return

    const target = findRailList() || findRailRoot()
    if (!target) return

    state.railItemEl = buildRailItem()
    target.appendChild(state.railItemEl)
    if (state.open) {
      state.railItemEl.classList.add('gpx-active')
      positionOverlay()
    }
  }

  // ---------- Observe SPA renders ----------

  let rafPending = false
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) => {
      const target = m.target
      return !(target instanceof Element && target.closest('.gpx-overlay'))
    })
    if (!relevant || rafPending) return
    rafPending = true
    requestAnimationFrame(() => {
      rafPending = false
      ensureInjected()
    })
  })

  observer.observe(document.body, { childList: true, subtree: true })
  ensureInjected()
  setupReturnFlow()

  // Fired by the background script (same isolated world) right after a
  // toolbar-click activation, so the panel opens without a second click.
  window.addEventListener('gpx-open', () => {
    ensureInjected()
    openOverlay()
  })
})()
