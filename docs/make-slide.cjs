/**
 * Builds docs/EzTimeZone-highlights.pptx — a single summary slide.
 *
 * .cjs because the package is type: module and pptxgenjs is CommonJS.
 *
 * pptxgenjs is deliberately not a devDependency: CI installs the lockfile on
 * every run and would be carrying a couple of megabytes it never uses, for an
 * artefact that changes about once a release. Install it just for this:
 *
 *   npm i --no-save pptxgenjs && node docs/make-slide.cjs
 *
 * The numbers are measured, not estimated — line counts from git ls-files
 * excluding blanks, coverage from the v8 report, bundle size gzipped from
 * dist/. Re-measure before changing them.
 */
const path = require('node:path');
const pptxgen = require('pptxgenjs');

const ICON = path.join(__dirname, '..', 'public', 'icons', 'icon-512.png');

// The app's own dark palette, so the slide and the product look like one thing.
const BG='141820', CARD='1E2430', BAR='2B3240', DAY='49536B', EDGE='2E3646';
const INK='E9ECF3', MUTED='98A2B6', DIM='6E778A';
const AMBER='EE9245', TEAL='7CC4DA', GREEN='74CF9E', ROSE='EF9098';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';           // 13.3 x 7.5
const s = pres.addSlide();
s.background = { color: BG };

/* ---------------------------------------------------------------- header */
s.addImage({ path: ICON, x: 0.55, y: 0.34, w: 1.02, h: 1.02 });
s.addText('EzTimeZone', {
  x: 1.78, y: 0.34, w: 6.5, h: 0.58, isTextBox: true, margin: 0,
  fontFace: 'Arial', fontSize: 34, bold: true, color: INK, charSpacing: -0.5,
});
s.addText('Compare five time zones on one shared, scrollable timeline', {
  x: 1.80, y: 0.93, w: 7.4, h: 0.4, isTextBox: true, margin: 0,
  fontFace: 'Calibri', fontSize: 13.5, color: MUTED,
});
s.addText('v0.4.0  ·  MIT  ·  installable, works offline', {
  x: 8.6, y: 0.52, w: 4.15, h: 0.3, isTextBox: true, margin: 0, align: 'right',
  fontFace: 'Courier New', fontSize: 10.5, color: DIM,
});

/* ------------------------------------------------------------ what it does */
s.addText('WHAT IT DOES', {
  x: 0.55, y: 1.58, w: 3, h: 0.24, isTextBox: true, margin: 0,
  fontFace: 'Arial', fontSize: 10.5, bold: true, color: DIM, charSpacing: 1.4,
});

// One rendered line each: at two lines the body ran into the next title.
const features = [
  [AMBER, 'One shared instant',    'Drag any strip; all five move together, each on its own hour grid.'],
  [GREEN, 'Finds the meeting',     'A ribbon marks every span where all zones are inside working hours.'],
  [ROSE,  'Daylight-saving aware', 'Warns a fortnight ahead when a zone shifts, and how your gap changes.'],
  [TEAL,  'Yours, offline',        'Installs to the home screen and runs with no network. Links share a moment.'],
];
let y = 1.94;
for (const [dot, title, body] of features) {
  s.addShape(pres.ShapeType.ellipse, { x: 0.58, y: y + 0.055, w: 0.135, h: 0.135, fill: { color: dot } });
  s.addText(title, {
    x: 0.85, y: y - 0.03, w: 5.9, h: 0.26, isTextBox: true, margin: 0,
    fontFace: 'Arial', fontSize: 13, bold: true, color: INK,
  });
  s.addText(body, {
    x: 0.85, y: y + 0.22, w: 6.2, h: 0.25, isTextBox: true, margin: 0,
    fontFace: 'Calibri', fontSize: 11, color: MUTED,
  });
  y += 0.56;
}

/* ------------------------------------------- the product's own signature */
s.addShape(pres.ShapeType.roundRect, {
  x: 7.35, y: 1.58, w: 5.4, h: 2.52, rectRadius: 0.08,
  fill: { color: CARD }, line: { color: EDGE, width: 1 },
});
s.addText('GOOD TO MEET', {
  x: 7.62, y: 1.74, w: 2.5, h: 0.22, isTextBox: true, margin: 0,
  fontFace: 'Arial', fontSize: 8.5, bold: true, color: GREEN, charSpacing: 1.2,
});
s.addText('1 window', {
  x: 10.3, y: 1.74, w: 2.2, h: 0.22, isTextBox: true, margin: 0, align: 'right',
  fontFace: 'Courier New', fontSize: 8.5, color: DIM,
});
s.addShape(pres.ShapeType.roundRect, {
  x: 9.32, y: 2.04, w: 1.15, h: 0.22, rectRadius: 0.04,
  fill: { color: GREEN, transparency: 55 }, line: { color: GREEN, width: 1 },
});
s.addText('3h', {
  x: 9.32, y: 2.04, w: 1.15, h: 0.22, isTextBox: true, margin: 0, align: 'center',
  fontFace: 'Arial', fontSize: 8.5, bold: true, color: 'C6EFDA',
});

// Offsets measured from the bar's own origin. Absolute x values had to be
// clamped to the bar start, which collapsed the first row's stagger entirely.
const BAR_X = 8.55, BAR_W = 3.95;
const strips = [
  { label: 'New York', day: 0.20, work: 0.60 },
  { label: 'London',   day: 1.05, work: 1.45 },
  { label: 'Tokyo',    day: 1.90, work: 2.30 },
];
let sy = 2.46;
for (const strip of strips) {
  s.addText(strip.label, {
    x: 7.60, y: sy - 0.005, w: 0.85, h: 0.2, isTextBox: true, margin: 0, align: 'right',
    fontFace: 'Calibri', fontSize: 8.5, color: MUTED,
  });
  s.addShape(pres.ShapeType.roundRect, { x: BAR_X, y: sy, w: BAR_W, h: 0.2, rectRadius: 0.03, fill: { color: BAR } });
  s.addShape(pres.ShapeType.rect, { x: BAR_X + strip.day, y: sy, w: 1.25, h: 0.2, fill: { color: DAY } });
  s.addShape(pres.ShapeType.rect, { x: BAR_X + strip.work, y: sy, w: 0.62, h: 0.2, fill: { color: AMBER, transparency: 58 } });
  sy += 0.36;
}
// Stops at the last strip rather than trailing past it.
s.addShape(pres.ShapeType.rect, { x: 9.88, y: 1.99, w: 0.028, h: 1.45, fill: { color: AMBER } });

s.addText('Every row reads one instant. The playhead is the moment you picked.', {
  x: 7.62, y: 3.62, w: 4.9, h: 0.3, isTextBox: true, margin: 0,
  fontFace: 'Calibri', fontSize: 9.5, italic: true, color: DIM,
});

/* ------------------------------------------------------------------ stats */
const stats = [
  ['234',   'tests passing',        TEAL],
  ['3,199', 'lines of production',  INK],
  ['1,383', 'lines of tests',       INK],
  ['99%',   'time-engine coverage', GREEN],
  ['78 kB', 'gzipped, 2 deps',      AMBER],
];
const gap = 0.2, cw = (12.2 - gap * 4) / 5;
stats.forEach(([num, label, colour], i) => {
  const x = 0.55 + i * (cw + gap);
  s.addShape(pres.ShapeType.roundRect, {
    x, y: 4.38, w: cw, h: 1.02, rectRadius: 0.07,
    fill: { color: CARD }, line: { color: EDGE, width: 1 },
  });
  s.addText(num, {
    x, y: 4.49, w: cw, h: 0.46, isTextBox: true, margin: 0, align: 'center',
    fontFace: 'Arial', fontSize: 25, bold: true, color: colour,
  });
  s.addText(label, {
    x, y: 4.98, w: cw, h: 0.28, isTextBox: true, margin: 0, align: 'center',
    fontFace: 'Calibri', fontSize: 10, color: MUTED,
  });
});

/* ------------------------------------------------------------- tech stack */
s.addText('BUILT WITH', {
  x: 0.55, y: 5.62, w: 3, h: 0.24, isTextBox: true, margin: 0,
  fontFace: 'Arial', fontSize: 10.5, bold: true, color: DIM, charSpacing: 1.4,
});
const chips = ['React 19', 'TypeScript', 'Vite 8', 'Vitest', 'Intl API — no date library',
               'Service Worker', 'GitHub Actions', 'Netlify CD'];
let cx = 0.55;
for (const chip of chips) {
  const w = 0.26 + chip.length * 0.083;
  s.addShape(pres.ShapeType.roundRect, {
    x: cx, y: 5.92, w, h: 0.34, rectRadius: 0.17,
    fill: { color: CARD }, line: { color: '394254', width: 1 },
  });
  s.addText(chip, {
    x: cx, y: 5.92, w, h: 0.34, isTextBox: true, margin: 0, align: 'center',
    fontFace: 'Calibri', fontSize: 10.5, color: INK,
  });
  cx += w + 0.13;
}

/* ----------------------------------------------------------------- footer */
s.addText('eztimezone.netlify.app', {
  x: 0.55, y: 6.66, w: 7, h: 0.45, isTextBox: true, margin: 0,
  fontFace: 'Arial', fontSize: 19, bold: true, color: AMBER,
});
s.addText('github.com/pattyD19/eztimezone', {
  x: 7.0, y: 6.76, w: 5.75, h: 0.3, isTextBox: true, margin: 0, align: 'right',
  fontFace: 'Courier New', fontSize: 11.5, color: MUTED,
});

s.addNotes('EzTimeZone — single-slide summary. Live at eztimezone.netlify.app, source at github.com/pattyD19/eztimezone under MIT. 234 tests, 3,199 lines of production code, 1,383 of tests, 78 kB gzipped, two runtime dependencies.');

pres.writeFile({ fileName: path.join(__dirname, 'EzTimeZone-highlights.pptx') }).then(() => console.log('written'));
