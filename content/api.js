// Gameplan HTTP API — session-cookie GETs against whitelisted endpoints.
;(() => {
  const gpx = (window.__gpx = window.__gpx || {})

  class GameplanApi {
    constructor() {
      this.userMap = null
    }

    // No team/project filter — the server returns every discussion the
    // session can read, permission-filtered.
    async discussions(start, limit) {
      const json = await this.get('gameplan.gameplan.doctype.gp_discussion.api.get_discussions', {
        order_by: 'last_post_at desc',
        start: String(start),
        limit: String(limit),
      })
      return { rows: json.data ?? json.message ?? [], hasNext: !!json.has_next_page }
    }

    // Rows carry emails only; resolve names/avatars once and cache.
    async users() {
      if (this.userMap) return this.userMap
      try {
        const json = await this.get('gameplan.api.get_user_info')
        const users = json.data ?? json.message ?? []
        this.userMap = new Map(users.map((u) => [u.name, u]))
      } catch (e) {
        this.userMap = new Map()
      }
      return this.userMap
    }

    async get(methodPath, params) {
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
  }

  gpx.GameplanApi = GameplanApi
})()
