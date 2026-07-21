// The injected rail button: placement in Gameplan's community rail, the
// native-style tooltip, and the MutationObserver that keeps exactly one
// button alive across Vue re-renders and SPA navigations.
;(() => {
  const gpx = (window.__gpx = window.__gpx || {})

  class Rail {
    constructor(panel) {
      this.panel = panel
      panel.rail = this
      this.buttonEl = null
      this.tooltipEl = null
      this.rafPending = false
    }

    observe() {
      const observer = new MutationObserver((mutations) => {
        const relevant = mutations.some((m) => {
          const target = m.target
          return !(target instanceof Element && target.closest('.gpx-overlay'))
        })
        if (!relevant || this.rafPending) return
        this.rafPending = true
        requestAnimationFrame(() => {
          this.rafPending = false
          this.ensureInjected()
        })
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    ensureInjected() {
      if (!gpx.onGameplanRoute()) {
        if (this.buttonEl) {
          this.buttonEl.remove()
          this.buttonEl = null
        }
        this.panel.close()
        return
      }
      // Vue re-renders can resurrect a previously-injected button inside a
      // reused subtree — keep exactly one, the tracked element.
      for (const el of document.querySelectorAll('.gpx-rail-item')) {
        if (el !== this.buttonEl) el.remove()
      }

      if (this.buttonEl && document.contains(this.buttonEl)) {
        // The preferred anchor can render after we first injected (Vue mounts
        // the rail in stages) — move above it as soon as it appears.
        const customize = findCustomizeAnchor()
        if (customize && this.buttonEl.nextElementSibling !== customize) {
          customize.parentElement.insertBefore(this.buttonEl, customize)
        }
        return
      }

      const target = this.findInjectionPoint()
      if (!target) return

      this.hideTooltip() // a Vue re-render can remove the button mid-hover
      this.buttonEl = this.buildButton()
      target.parent.insertBefore(this.buttonEl, target.before)
      if (this.panel.isOpen) {
        this.setActive(true)
        this.panel.position()
      }
    }

    setActive(on) {
      if (!this.buttonEl) return
      if (on) {
        this.buttonEl.classList.add('gpx-active')
      } else {
        this.buttonEl.classList.remove('gpx-active')
        // Clicking the button leaves it focused; drop that so no highlight
        // lingers after dismissing via Search, Escape, or another rail item.
        this.buttonEl.blur()
      }
    }

    buildButton() {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'gpx-rail-item'
      button.setAttribute('aria-label', 'All Discussions')
      button.appendChild(gpx.svgSpan('space', 'gpx-rail-icon'))
      button.addEventListener('click', () => {
        this.hideTooltip()
        this.panel.toggle()
      })
      button.addEventListener('mouseenter', () => this.showTooltip(button, 'All Discussions'))
      button.addEventListener('mouseleave', () => this.hideTooltip())
      button.addEventListener('blur', () => this.hideTooltip())
      return button
    }

    findInjectionPoint() {
      // Preferred: directly above the "Customize sidebar" ghost rail item.
      const customize = findCustomizeAnchor()
      if (customize && customize.parentElement) {
        return { parent: customize.parentElement, before: customize }
      }
      const list = findRailList()
      if (list) return { parent: list, before: null }
      const root = this.findRailRoot()
      if (root) return { parent: root, before: null }
      return null
    }

    findRailRoot() {
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

    // Tooltip mimicking the native RailItem one: dark bubble to the right,
    // portaled to <body> so the rail's narrow column can't clip it.
    showTooltip(target, text) {
      this.hideTooltip()
      this.tooltipEl = document.createElement('div')
      this.tooltipEl.className = 'gpx-tooltip'
      this.tooltipEl.textContent = text
      document.body.appendChild(this.tooltipEl)
      const rect = target.getBoundingClientRect()
      this.tooltipEl.style.left = Math.round(rect.right + 10) + 'px'
      this.tooltipEl.style.top =
        Math.round(rect.top + rect.height / 2 - this.tooltipEl.offsetHeight / 2) + 'px'
    }

    hideTooltip() {
      if (this.tooltipEl) {
        this.tooltipEl.remove()
        this.tooltipEl = null
      }
    }
  }

  function findCustomizeAnchor() {
    return document.querySelector('[data-slot="rail-item"][aria-label="Customize sidebar"]')
  }

  function findRailList() {
    // AppRail.vue: <div class="flex w-[50px] flex-col items-center gap-3">
    // holding the community RailItem buttons.
    for (const el of document.querySelectorAll('.w-\\[50px\\].flex-col.gap-3')) {
      if (el.querySelector('button')) return el
    }
    return null
  }

  gpx.Rail = Rail
})()
