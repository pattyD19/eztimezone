# EzTimeZone

**Live: https://eztimezone.netlify.app**

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
    overlap.ts   interval arithmetic for the meeting ribbon
  state/
    TimelineStore.ts      the shared instant and scale; a plain observable
    useTimelineGestures.ts  pointer, wheel and pinch handling
    useZones.ts, usePrefs.ts, hooks.ts
  ui/        Timeline, ZoneRow, Toolbar, ZonePicker
  lib/       storage and share-link helpers
```

## The meeting ribbon

The green band above the strips is every span where *all* your zones are inside
working hours. It is the answer to the question people actually open a timezone
tool to ask, and it is plain interval arithmetic over the same bands the strips
are drawn from, so the two can never disagree.

Weekends are excluded, per zone and per local day — when Sydney is in Monday's
working hours, London is still on Sunday evening and no meeting is happening.
Windows shorter than thirty minutes are dropped.

Two details carry most of the value:

- **Merging touches, not just overlaps.** A working day containing a DST change
  is emitted as two abutting bands, one per constant-offset segment. Unmerged,
  they intersect into two windows with a zero-width seam, and the ribbon shows a
  hairline gap on exactly the day people most need to get right.
- **"None" is never the answer.** When nothing is in view the ribbon offers the
  next window as a button that scrolls you to it, and when two weeks of
  lookahead find nothing it says so plainly — Los Angeles and London genuinely
  never share a nine-to-five, and the app should say that rather than shrug.

Note that what is *counted* is measured against the visible span, while what is
*drawn* covers the whole painted buffer. Counting the buffer would announce
"1 window" over an empty ribbon whenever the nearest one sat just off screen.

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

## Daylight saving

Two separate jobs, and it is worth keeping them apart.

**Being correct** is handled in `ticks.ts`. The visible span is cut into
constant-offset segments — a coarse scan brackets each change, then a binary
search narrows it to the millisecond — and grids are laid inside each segment.
So a spring-forward never invents a 2am tick, a fall-back draws 1am twice, and
each is one real hour of screen either way. Zones transition independently, so
the three weeks each spring when New York is 4h from London rather than 5h just
fall out of the offsets.

**Being noticed** is `transitions.ts` plus `DstNotice`. Correct is not the same
as noticed: the mistake people make is agreeing a recurring time and not
spotting that the gap moves an hour in three weeks. Every boundary between the
segments already computed *is* such a change, so surfacing it costs nothing new.

- A banner warns about changes within a fortnight of the playhead. Shorter and
  it would be useless — at the default scale the visible span is about a day, so
  you would only learn of a change by scrolling onto it.
- A `+1h` marker sits on the strip at the exact instant, on the row that moves.
- When the *home* zone is the one changing, the banner says every gap shifts
  rather than naming one, because they all move together.
- Dates are given in the zone that is changing, not the reader's. A transition
  at 01:00 UTC on Sunday is still Saturday evening in New York, and telling a
  New Yorker that "London changes on Saturday" names a date no Londoner would
  recognise for their own clocks.

Shifts are not assumed to be whole hours — Lord Howe Island moves by thirty
minutes, and the tests pin that.

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

## Deploying

Hosted on Netlify at https://eztimezone.netlify.app. The build is a static
directory with no server component, and share links keep their state in the URL
hash, so no redirect or rewrite rules are needed.

```bash
npm run build
npx netlify deploy --prod --dir=dist
```

Or drag `dist/` onto https://app.netlify.com/drop.

`netlify.toml` holds the settings for git-based deploys: Netlify runs
`npm test && npm run build` and publishes `dist`, so a failing test blocks the
deploy rather than shipping past it. Node is pinned there so a change to
Netlify's default cannot alter a build. Deploy previews for pull requests build
the same way.

The HTTP headers deliberately do **not** live in `netlify.toml` — see below.

`public/_headers` carries the two header overrides the deploy needs. It lives in
`public/` rather than the repo root so Vite copies it into `dist/`, which means
it applies to a drag-and-drop deploy of that folder and not only to a git-based
build:

- **`manifest.webmanifest` gets `application/manifest+json`.** Netlify does not
  recognise the extension and otherwise serves it as `application/octet-stream`.
  Browsers are lenient enough to parse it anyway, so the symptom is not a broken
  page — it is an audit failure and an install prompt you cannot rely on.
- **`/assets/*` gets a year and `immutable`.** Those filenames are
  content-hashed, so the bytes behind a URL can never change; Netlify's default
  spends a revalidation round trip on every visit for nothing.

Netlify's defaults are already right for `index.html` and `sw.js`
(`max-age=0, must-revalidate`), which is what lets a new deploy be picked up
promptly, so neither is overridden.

The foot of the page carries a build stamp — `v0.1.0 · 332ff9d` — which is the
package version plus the commit it was built from. After a deploy, that is how
you tell whether a browser is showing the build you just shipped or one the
service worker still has cached. A trailing `+` on the commit means the build
was made from a tree with uncommitted changes, so the stamp can never quietly
claim to be a commit it is not.

On CI the commit comes from the platform — `COMMIT_REF` on Netlify, `GITHUB_SHA`
on GitHub Actions — rather than from shelling out to git, because those
checkouts are often shallow and are never a tree anyone has edited.

A clean build is reproducible: its timestamp comes from the commit rather than
the clock, so building the same commit twice produces byte-identical output.
Stamping the wall clock instead changes the content hash on every build, which
makes every client re-download JS that did not change, and means two builds of
one commit cannot be compared to confirm what is deployed. A dirty tree gets the
wall clock, since such a build is not reproducible whatever timestamp it
carries.

**Deploying to a subpath needs more than this.** GitHub Pages project sites
serve from `/<repo>/`, and while the manifest uses relative URLs, the service
worker's precache paths and the script tags come from Vite's `base`. Without
setting it you get a worker that 404s on every precached file.

## Not done yet

- DST-change warnings (deferred deliberately).
- iOS home-screen widget. Note that WidgetKit renders static snapshots — iOS 17+
  allows `Button`/`Toggle` via AppIntent but has no drag or scroll gesture, so
  the scrubbing interaction cannot ship as a widget. The widget would be a
  static multi-zone readout that deep-links into the app.
- City search covers ~420 IANA zones plus a hand-written alias table, so
  mid-size cities are not found. Expanding it means either more aliases or
  bundling a real city dataset.
- Working hours are 09:00-17:00 everywhere. `StripOptions` and `MeetingOptions`
  both already take `workStart`/`workEnd`, so making them per-zone and editable
  is a UI job, not an engine one.
- `state/`, `ui/` and `lib/` have no tests. `TimelineStore` is the obvious gap:
  it is pure arithmetic with an injectable clock, and two of the bugs found so
  far lived in it.

## Tests

```bash
npm test        # 169 tests
npm run coverage
```

Coverage is deliberately uneven, and the headline number is not the point:

| | |
|---|---|
| `src/time/` | ~99% — the timezone and interval maths |
| `src/state/TimelineStore.ts` | ~93% |
| `src/lib/share.ts`, `storage.ts` | 100% |
| `src/ui/`, the React hooks | 0% |

The rule is to test where a mistake is both likely and invisible. Timezone
arithmetic qualifies twice over: an off-by-an-hour in a DST edge case looks
entirely plausible on screen. `TimelineStore` qualifies because two real bugs
have already lived there — inertia held in the wrong units, and a method passed
unbound to React — and neither was the sort of thing reading the code caught.

The UI is left to browser verification instead. Its components are mostly
rendering, and DOM tests would cost a jsdom setup to assert things a screenshot
settles faster. That is a trade, not an oversight: it means a regression in
layout or gesture handling will not be caught by CI.

`TimelineStore` is tested against a hand-driven frame queue and fake clock
rather than a DOM, which makes inertia and easing deterministic instead of
dependent on how fast the suite happens to run.

## CI

`.github/workflows/ci.yml` runs typecheck, tests and build on pushes to `main`
and on every pull request. The steps are kept separate so a failure names what
broke rather than reporting "the build failed", and `npm ci` is used rather than
`npm install` so a lockfile that has drifted from `package.json` fails the run.

This overlaps with Netlify, which runs `npm test && npm run build` before it
deploys — deliberately. They answer different questions: the Netlify gate
decides whether to publish, while the Action gives a status check on commits and
pull requests, including from forks, where nothing is being deployed at all.

Node is pinned in `.nvmrc`, which both Netlify and the workflow read, so the two
cannot disagree about it.

## License

MIT — see [LICENSE](LICENSE).
