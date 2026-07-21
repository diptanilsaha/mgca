// Boot: verify this is a Gameplan frontend, wire the pieces, start observing.
// Must be the last content file loaded — the others populate window.__gpx.
;(() => {
  if (window.__gpxInjected) return
  window.__gpxInjected = true

  const gpx = window.__gpx
  if (!gpx || !gpx.hasGameplanMarkers()) return

  const panel = new gpx.Panel(new gpx.GameplanApi())
  panel.returnFlow = new gpx.ReturnFlow(panel)
  const rail = new gpx.Rail(panel)

  rail.observe()
  rail.ensureInjected()
  panel.returnFlow.start()
})()
