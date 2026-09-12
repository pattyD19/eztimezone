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
npm run build      # typecheck + production bundle, including the service worker
npm run preview    # serve the build; the service worker only runs here, not in dev
npm run icons      # regenerate the PWA icons (they are committed)
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

## Offline and installability

The app is installable and works fully offline. `build/pwa.ts` runs at build
time and emits `dist/sw.js` with a precache list baked in, because Vite
content-hashes asset names and because `public/` is copied verbatim rather than
bundled. The cache version is a hash of that list, so it changes exactly when
the cached file set does.

Caching strategy:

- **Navigations** go network-first, falling back to the precached shell. A
  deploy is therefore picked up on the next load, and the app still opens with
  no network.
- **Own-origin assets** are cache-first, which is always correct because their
  filenames are content-hashed.
- **Google Fonts** are stale-while-revalidate in a separate cache, so type
  renders offline. Cross-origin font responses are opaque and cannot be
  inspected; that is the accepted trade. Self-hosting the two families would
  remove the third-party dependency entirely if that ever matters.

The worker calls `skipWaiting()` and takes over immediately. That is safe *only*
because the app builds to a single bundle with no lazily-imported chunks, so a
running page can never request a file the new version has renamed. **If code
splitting is introduced, switch to the wait-for-reload pattern** or a page held
open across a deploy will start 404ing on chunks.

The worker is not registered in development, and `registerSW.ts` actively
unregisters any worker it finds there, so a stale one from a preview build
cannot end up serving the dev server.

## Not done yet

- DST-change warnings (deferred deliberately).
- iOS home-screen widget. Note that WidgetKit renders static snapshots — iOS 17+
  allows `Button`/`Toggle` via AppIntent but has no drag or scroll gesture, so
  the scrubbing interaction cannot ship as a widget. The widget would be a
  static multi-zone readout that deep-links into the app.
- City search covers ~420 IANA zones plus a hand-written alias table, so
  mid-size cities are not found. Expanding it means either more aliases or
  bundling a real city dataset.
