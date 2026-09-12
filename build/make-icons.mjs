/**
 * Generates the PWA icon set.
 *
 * Run with `npm run icons`; the PNGs are committed, so a normal build does not
 * depend on this script. It is written against `node:zlib` alone rather than an
 * image library, because the icon is four rectangles and a line -- not worth a
 * dependency, and this way the artwork is reviewable as source instead of
 * arriving as an opaque binary.
 *
 * The design is the app's own signature: staggered day/night bars with the
 * playhead running through them.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// ---------------------------------------------------------------- palette
const GROUND = [0x14, 0x18, 0x20];
const NIGHT = [0x2b, 0x32, 0x40];
const DAY = [0x49, 0x53, 0x66];
const WORK = [0x7d, 0x55, 0x33];
const PLAYHEAD = [0xee, 0x92, 0x45];

// ------------------------------------------------------------- rasteriser
/** Supersampling factor; the downsample at the end is what antialiases edges. */
const SS = 4;

function createSurface(size) {
  return { size, px: new Float64Array(size * size * 3) };
}

function fillAll(s, [r, g, b]) {
  for (let i = 0; i < s.px.length; i += 3) {
    s.px[i] = r;
    s.px[i + 1] = g;
    s.px[i + 2] = b;
  }
}

/** Signed-distance test for a rounded rectangle. */
function insideRound(x, y, rect, radius) {
  const [rx, ry, rw, rh] = rect;
  const cx = Math.min(Math.max(x, rx + radius), rx + rw - radius);
  const cy = Math.min(Math.max(y, ry + radius), ry + rh - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/**
 * Paint `colour` where the pixel is inside `rect` (rounded by `radius`) and,
 * when given, also inside `clip` (rounded by `clipRadius`). The clip is how
 * segments stay within their bar without overflowing its rounded corners.
 */
function paintRect(s, rect, radius, colour, clip = null, clipRadius = 0) {
  const [rx, ry, rw, rh] = rect;
  const x0 = Math.max(0, Math.floor(rx));
  const y0 = Math.max(0, Math.floor(ry));
  const x1 = Math.min(s.size, Math.ceil(rx + rw));
  const y1 = Math.min(s.size, Math.ceil(ry + rh));

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (!insideRound(px, py, rect, radius)) continue;
      if (clip && !insideRound(px, py, clip, clipRadius)) continue;
      const i = (y * s.size + x) * 3;
      s.px[i] = colour[0];
      s.px[i + 1] = colour[1];
      s.px[i + 2] = colour[2];
    }
  }
}

/** Box-filter the supersampled surface down to `target`, giving smooth edges. */
function downsample(s, target) {
  const factor = s.size / target;
  const out = Buffer.alloc(target * target * 4);
  for (let y = 0; y < target; y += 1) {
    for (let x = 0; x < target; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = Math.floor(y * factor); sy < Math.floor((y + 1) * factor); sy += 1) {
        for (let sx = Math.floor(x * factor); sx < Math.floor((x + 1) * factor); sx += 1) {
          const i = (sy * s.size + sx) * 3;
          r += s.px[i];
          g += s.px[i + 1];
          b += s.px[i + 2];
          n += 1;
        }
      }
      const o = (y * target + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = 255; // fully opaque: maskable icons must not be transparent
    }
  }
  return out;
}

// ------------------------------------------------------------ PNG encoder
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------- the icon
/**
 * @param scale fraction of the canvas the artwork occupies. Maskable icons are
 *   drawn small so nothing important falls outside the platform's safe zone.
 */
function drawIcon(target, scale) {
  const size = target * SS;
  const s = createSurface(size);
  fillAll(s, GROUND);

  const unit = size / 512; // design coordinates are 512-based
  const art = scale;
  const cx = size / 2;
  const cy = size / 2;
  const D = (v) => v * unit * art; // design units -> surface pixels, scaled

  const barW = D(384);
  const barH = D(46);
  const gap = D(30);
  const radius = barH / 2;
  const left = cx - barW / 2;
  const totalH = barH * 4 + gap * 3;
  const top = cy - totalH / 2;

  // Each row's day and working-hours segments sit further right than the row
  // above, which is what reads as "the same moment, different zones".
  const rows = [
    { day: [0.06, 0.52], work: [0.22, 0.42] },
    { day: [0.26, 0.72], work: [0.42, 0.62] },
    { day: [0.46, 0.92], work: [0.62, 0.82] },
    { day: [0.66, 1.0], work: [0.82, 1.0] },
  ];

  rows.forEach((row, i) => {
    const y = top + i * (barH + gap);
    const bar = [left, y, barW, barH];
    paintRect(s, bar, radius, NIGHT);
    const seg = ([a, b], colour) =>
      paintRect(s, [left + barW * a, y, barW * (b - a), barH], 0, colour, bar, radius);
    seg(row.day, DAY);
    seg(row.work, WORK);
  });

  const headW = D(15);
  const overhang = D(22);
  paintRect(
    s,
    [cx - headW / 2, top - overhang, headW, totalH + overhang * 2],
    headW / 2,
    PLAYHEAD,
  );

  return encodePng(target, downsample(s, target));
}

// ------------------------------------------------------------------- run
mkdirSync(OUT, { recursive: true });

const outputs = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  // The artwork's bounding diagonal is ~499 design units, and the maskable
  // safe zone is a circle of 80% of the canvas (409px at 512). 0.75 puts the
  // diagonal at 374px -- clear of the edge without wasting the whole icon.
  ['icon-maskable-512.png', 512, 0.75],
  ['apple-touch-icon.png', 180, 1],
];

for (const [name, size, scale] of outputs) {
  const png = drawIcon(size, scale);
  writeFileSync(join(OUT, name), png);
  console.log(`${name.padEnd(26)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}
