# EzTimeZone

Compare the time across up to five timezones on one shared, scrollable timeline.
Drag any strip and all of them move together; the playhead marks the moment
you have picked, and each row reads it in its own local time.

React + TypeScript + Vite. No backend, no accounts, no runtime dependencies
beyond React — the IANA timezone database comes from `Intl` in the browser.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # the time engine
npm run build      # typecheck + production bundle
```

## Layout

```
src/
  time/      pure, dependency-free, and the only part with tests
    format.ts    UTC offsets and wall-clock formatting
    ticks.ts     tick grids and shading bands, DST-aware
    zones.ts     the zone catalogue and its search
  state/
    TimelineStore.ts      the shared instant and scale; a plain observable
    useTimelineGestures.ts  pointer, wheel and pinch handling
    useZones.ts, usePrefs.ts, hooks.ts
  ui/        Timeline, ZoneRow, Toolbar, ZonePicker
  lib/       storage and share-link helpers
```

## Three things worth knowing before changing this

**There is no per-row scroll position.** One `centre` instant and one
`pxPerHour` drive every strip; each renders the same absolute axis labelled in
its own zone. "All five move together" is not a feature that was implemented,
it is what falls out of five views sharing one number. Adding per-row state
would break that invariant.

**The 60fps path deliberately bypasses React.** `TimelineStore` is an
observable, not state. Dragging writes `transform` and `textContent` directly
through refs; React only re-renders when the *painted window* moves, which is
rare. Re-rendering five rows of a few hundred ticks per frame is not viable, so
`useFrame` callbacks must never call `setState`.

**Local time is not a continuous function of the instant.** Offsets are not
whole hours (Kolkata +05:30, Kathmandu +05:45, Chatham +12:45), so each row's
hour boundaries land at different x positions and the grid cannot be shared.
And DST means adding an hour repeatedly to a local time invents an hour each
spring and drops one each autumn. `ticks.ts` cuts the window into
constant-offset segments first, and lays a uniform grid inside each. The tests
in `ticks.test.ts` pin this down; keep them passing.

## Not done yet

- PWA manifest and service worker.
- DST-change warnings (deferred deliberately).
- iOS home-screen widget. Note that WidgetKit renders static snapshots — iOS 17+
  allows `Button`/`Toggle` via AppIntent but has no drag or scroll gesture, so
  the scrubbing interaction cannot ship as a widget. The widget would be a
  static multi-zone readout that deep-links into the app.
- City search covers ~420 IANA zones plus a hand-written alias table, so
  mid-size cities are not found. Expanding it means either more aliases or
  bundling a real city dataset.
