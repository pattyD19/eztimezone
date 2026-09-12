// This file lives outside src/ on purpose. It reads the stylesheet from disk —
// vitest disables CSS processing, so even a ?raw import comes back empty — and
// pulling Node's types into the app's tsconfig to allow that is not free: it
// re-types setTimeout and breaks TimelineStore's timer field. Here it compiles
// under tsconfig.node.json instead, and application code stays browser-only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/**
 * Contrast is checked here rather than by eye because it is a numeric property
 * that a palette change can quietly break: nudging one token a few points is
 * invisible in review and can drop a label below the readable threshold.
 *
 * WCAG 2.2 AA asks for 4.5:1 on body text, 3:1 on large text (>=18.66px bold or
 * >=24px) and on the boundaries of controls (1.4.11). Purely decorative marks —
 * the hour ticks, the dividers between rows — carry no information on their own
 * and are exempt.
 */

type Rgb = [number, number, number];
interface Colour {
  c: Rgb;
  a: number;
}

function parseColour(value: string): Colour {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) {
    const h = trimmed.slice(1);
    const full = h.length === 3 ? [...h].map((ch) => ch + ch).join('') : h;
    return {
      c: [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb,
      a: 1,
    };
  }
  const parts = trimmed
    .replace(/rgba?\(|\)/g, '')
    .split(',')
    .map((p) => Number.parseFloat(p.trim()));
  return { c: [parts[0]!, parts[1]!, parts[2]!], a: parts[3] ?? 1 };
}

/** The tokens declared in one `:root` block, keyed without the leading dashes. */
function paletteFrom(selector: RegExp): Record<string, string> {
  const block = css.match(selector);
  if (!block) throw new Error(`no :root block matched ${selector}`);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block[1]!.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens[name!] = value!.trim();
  }
  return tokens;
}

const light = paletteFrom(/:root\s*\{([^}]*)\}/);
const dark = paletteFrom(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/);

function composite(over: Colour, under: Rgb): Rgb {
  return over.c.map((v, i) => v * over.a + under[i]! * (1 - over.a)) as Rgb;
}

function relativeLuminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/**
 * @param layers background tokens, outermost first; later ones are tinted over
 *   earlier ones, which is how the soft chip fills actually render.
 */
function ratioOf(palette: Record<string, string>, fg: string, layers: string[]): number {
  let background = parseColour(palette[layers[0]!]!).c;
  for (const token of layers.slice(1)) {
    background = composite(parseColour(palette[token]!), background);
  }
  const foreground = composite(parseColour(palette[fg]!), background);
  return contrast(foreground, background);
}

/** [what it is, foreground token, background layers, required ratio] */
const TEXT: [string, string, string[], number][] = [
  ['body text', 'ink', ['ground'], 4.5],
  ['the hint line', 'ink-2', ['ground'], 4.5],
  ['a city name', 'ink', ['surface'], 4.5],
  ['the zone offset and delta', 'ink-2', ['surface'], 4.5],
  ['the row date', 'ink-2', ['surface'], 4.5],
  ['the big time readout', 'ink', ['surface'], 3],
  ['an AM hour label', 'am', ['sunk'], 4.5],
  ['a PM hour label', 'pm', ['sunk'], 4.5],
  ['an AM label over the working band', 'am', ['sunk', 'work'], 4.5],
  ['a PM label over the night band', 'pm', ['sunk', 'night'], 4.5],
  ['the AM chip', 'am', ['surface', 'am-soft'], 4.5],
  ['the PM chip', 'pm', ['surface', 'pm-soft'], 4.5],
  ['a day-boundary chip', 'ink', ['surface'], 4.5],
  ['the ribbon title', 'go', ['surface'], 4.5],
  ['a meeting window label', 'go', ['sunk', 'go-soft'], 4.5],
  ['the ribbon note', 'ink-2', ['surface'], 4.5],
  ['the jump-to-next button', 'go', ['surface', 'go-soft'], 4.5],
  ['the daylight-saving banner', 'ink', ['ground', 'warn-soft'], 4.5],
  ['the daylight-saving badge', 'warn', ['ground', 'warn-soft'], 4.5],
  ['a daylight-saving strip chip', 'warn', ['surface'], 4.5],
  ['the Now button label', 'accent-ink', ['accent'], 4.5],
  ['a toolbar button label', 'ink', ['surface'], 4.5],
  ['a pressed segmented button', 'ink', ['surface', 'accent-soft'], 4.5],
  ['the version stamp', 'ink-2', ['ground'], 4.5],
  ['the search placeholder', 'ink-2', ['surface'], 4.5],
  ['the "you" tag', 'accent', ['surface'], 4.5],
  ['a search result region', 'ink-2', ['surface'], 4.5],
];

/** Boundaries of things you operate. WCAG 1.4.11 asks 3:1 of these. */
const CONTROLS: [string, string, string[], number][] = [
  ['a button border', 'control-border', ['surface'], 3],
  ['a button border on the page ground', 'control-border', ['ground'], 3],
  ['the search field border', 'control-border', ['surface'], 3],
  ['the playhead', 'accent', ['surface'], 3],
];

for (const [name, palette] of [
  ['light', light],
  ['dark', dark],
] as const) {
  describe(`${name} theme`, () => {
    it.each(TEXT)('%s is readable', (_label, fg, layers, need) => {
      expect(ratioOf(palette, fg, layers)).toBeGreaterThanOrEqual(need);
    });

    it.each(CONTROLS)('%s is distinguishable', (_label, fg, layers, need) => {
      expect(ratioOf(palette, fg, layers)).toBeGreaterThanOrEqual(need);
    });

    it('declares every token the other theme declares', () => {
      const other = name === 'light' ? dark : light;
      expect(Object.keys(palette).sort()).toEqual(Object.keys(other).sort());
    });
  });
}

describe('the muted mark colour', () => {
  it('is never used for text', () => {
    // --ink-3 is too light to carry text at AA, so it is reserved for hour
    // ticks and dividers. Anything that must be *read* uses --ink-2.
    const textUses = [...css.matchAll(/([a-z-]+)\s*:\s*var\(--ink-3\)/g)].map((m) => m[1]!);
    expect(textUses.filter((prop) => prop === 'color')).toEqual([]);
  });
});
