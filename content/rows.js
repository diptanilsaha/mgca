// Discussion row rendering — DOM built with createElement/textContent only;
// titles and previews are user content, never innerHTML.
;(() => {
  const gpx = (window.__gpx = window.__gpx || {})

  // deps: { userMap: Map|null, onNavigate(row, href) }
  gpx.buildDiscussionRow = function buildDiscussionRow(row, deps) {
    const link = document.createElement('a')
    link.className = 'gpx-row'
    link.href = discussionUrl(row)
    link.addEventListener('click', (event) => {
      // Only same-tab navigations should arm the back-from-post flow.
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        deps.onNavigate(row, link.href)
      }
    })

    link.appendChild(buildAvatar(row.owner, deps.userMap))
    link.appendChild(buildMain(row, deps.userMap))
    link.appendChild(buildMeta(row))
    return link
  }

  function buildMain(row, userMap) {
    const main = document.createElement('div')
    main.className = 'gpx-row-main'

    const title = document.createElement('div')
    title.className = 'gpx-row-title' + (row.unread ? ' gpx-unread' : '')
    title.textContent = row.title || 'Untitled'
    main.appendChild(title)

    const sub = document.createElement('div')
    sub.className = 'gpx-row-sub'
    if (row.closed_at) {
      sub.appendChild(gpx.svgSpan('lock', 'gpx-sub-icon'))
    } else if (row.last_post_type === 'GP Comment') {
      sub.appendChild(gpx.svgSpan('reply', 'gpx-sub-icon'))
    } else if (row.last_post_type === 'GP Poll') {
      sub.appendChild(gpx.svgSpan('poll', 'gpx-sub-icon'))
    }
    const subText = document.createElement('span')
    subText.className = 'gpx-sub-text'
    const preview = row.last_comment_content || row.last_poll_title || ''
    subText.textContent = `${fullNameOf(row.last_post_by || row.owner, userMap)} in ${
      row.project_title || 'Unknown space'
    }: ${preview}`
    sub.appendChild(subText)
    main.appendChild(sub)
    return main
  }

  function buildMeta(row) {
    const meta = document.createElement('div')
    meta.className = 'gpx-row-meta'

    const time = document.createElement('div')
    time.className = 'gpx-time'
    time.textContent = gpx.relativeTimestamp(row.last_post_at || row.creation)
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
    return meta
  }

  function buildAvatar(email, userMap) {
    const user = userMap && userMap.get(email)
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

  function fullNameOf(email, userMap) {
    const user = userMap && userMap.get(email)
    return ((user && user.full_name) || email || '').trim()
  }

  function discussionUrl(row) {
    const slug = row.slug ? `/${encodeURIComponent(row.slug)}` : ''
    if (row.team) {
      return `${location.origin}/g/community/${encodeURIComponent(row.team)}/space/${encodeURIComponent(
        row.project,
      )}/discussion/${encodeURIComponent(row.name)}${slug}`
    }
    // Legacy rows without a team — the app redirects /g/space/... itself.
    return `${location.origin}/g/space/${encodeURIComponent(row.project)}/discussion/${encodeURIComponent(
      row.name,
    )}${slug}`
  }
})()
