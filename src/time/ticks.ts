/**
 * Tick and band geometry for one timezone strip.
 *
 * Two things make this harder than stepping an hour at a time:
 *
 *  1. Offsets are not whole hours. Kolkata is +05:30, Kathmandu +05:45,
 *     Chatham +12:45. Each strip's hour boundaries therefore land at different
 *     x positions, so the grid cannot be computed once and reused across rows.
 *
 *  2. DST means local time is not a continuous function of the instant. Adding
 *     3_600_000 repeatedly to a local time invents an hour that never happened
 *     each spring and drops a repeated one each autumn.
 *
 * So the window is first cut into constant-offset segments, and a uniform grid
 * is laid inside each segment, where the arithmetic is safe again.
 */

import { DAY, HOUR, offsetAt, wallFromOffset, type Wall } from './format';

/** A span of the timeline over which the zone's offset does not change. */
export interface Segment {
  start: number;
  end: number;
  offset: number;
}

/**
 * Narrow a known offset change within `(lo, hi]` to the exact instant.
 * Returns the first instant that carries the new offset.
 */
export function findTransition(tz: string, lo: number, hi: number, offsetLo: number): number {
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (offsetAt(tz, mid) === offsetLo) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * How often to sample when hunting for transitions. Six hours is comfortably
 * finer than any real DST rule, and cheap: a three-week buffer costs ~84
 * `formatToParts` calls, paid once per repaint rather than per frame.
 */
const SCAN_STEP = 6 * HOUR;

export function segmentsOf(tz: string, start: number, end: number): Segment[] {
  const out: Segment[] = [];
  let segStart = start;
  let offset = offsetAt(tz, start);
  let prev = start;

  // The endpoint is always sampled, not just the interior. Sampling only
  // `t < end` on a fixed stride misses any transition in the final partial
  // step -- and misses every transition outright in a window shorter than one
  // step, which is exactly what a zoomed-in view is.
  for (let t = start; t < end; ) {
    t = Math.min(t + SCAN_STEP, end);
    const next = offsetAt(tz, t);
    if (next !== offset) {
      const at = findTransition(tz, prev, t, offset);
      out.push({ start: segStart, end: at, offset });
      segStart = at;
      offset = next;
    }
    prev = t;
  }

  // A transition landing exactly on `end` would otherwise leave an empty tail.
  if (segStart < end || out.length === 0) out.push({ start: segStart, end, offset });
  return out;
}

export interface Tick {
  /** The instant this hour boundary falls on. */
  t: number;
  /** Local hour, 0-23. */
  hour: number;
  /** True at local midnight, where the strip shows a date instead of an hour. */
  dayStart: boolean;
  wall: Wall;
}

export type BandKind = 'night' | 'work';

export interface Band {
  start: number;
  end: number;
  kind: BandKind;
  /** Local weekday (0 = Sunday) of the day this band belongs to. */
  weekday: number;
}

export interface Strip {
  ticks: Tick[];
  bands: Band[];
  segments: Segment[];
}

export interface StripOptions {
  /** Local hour the working day starts. */
  workStart?: number;
  /** Local hour the working day ends. */
  workEnd?: number;
  /** Local hour night shading lifts in the morning. */
  nightEnd?: number;
  /** Local hour night shading returns in the evening. */
  nightStart?: number;
}

const DEFAULTS: Required<StripOptions> = {
  workStart: 9,
  workEnd: 17,
  nightEnd: 7,
  nightStart: 22,
};

function clampBand(
  localStart: number,
  localEnd: number,
  seg: Segment,
  kind: BandKind,
  weekday: number,
  out: Band[],
): void {
  const start = Math.max(localStart - seg.offset, seg.start);
  const end = Math.min(localEnd - seg.offset, seg.end);
  if (end > start) out.push({ start, end, kind, weekday });
}

/**
 * Day and night shading for a set of constant-offset segments.
 *
 * Split out from `buildStrip` because the meeting-overlap calculation needs
 * exactly these intervals and must not get them from a second, drifting
 * implementation.
 */
export function bandsFromSegments(
  segments: readonly Segment[],
  options: StripOptions = {},
): Band[] {
  const opts = { ...DEFAULTS, ...options };
  const bands: Band[] = [];

  for (const seg of segments) {
    // Walked in local days so the bands follow the wall clock across a
    // transition rather than drifting by an hour.
    const firstMidnight = Math.floor((seg.start + seg.offset) / DAY) * DAY;
    for (let local = firstMidnight; local - seg.offset < seg.end; local += DAY) {
      const weekday = new Date(local).getUTCDay();
      clampBand(local, local + opts.nightEnd * HOUR, seg, 'night', weekday, bands);
      clampBand(local + opts.nightStart * HOUR, local + DAY, seg, 'night', weekday, bands);
      clampBand(
        local + opts.workStart * HOUR,
        local + opts.workEnd * HOUR,
        seg,
        'work',
        weekday,
        bands,
      );
    }
  }
  return bands;
}

/** Shading bands for a zone across a span. */
export function bandsOf(
  tz: string,
  start: number,
  end: number,
  options: StripOptions = {},
): Band[] {
  return bandsFromSegments(segmentsOf(tz, start, end), options);
}

/**
 * Build every tick and shading band for `tz` across `[start, end]`.
 * Pure: given the same window it returns the same geometry, which is what
 * makes the repaint cache in `TimelineStore` safe.
 */
export function buildStrip(
  tz: string,
  start: number,
  end: number,
  options: StripOptions = {},
): Strip {
  const segments = segmentsOf(tz, start, end);
  const bands = bandsFromSegments(segments, options);
  const ticks: Tick[] = [];

  for (const seg of segments) {
    // Hour ticks at local boundaries.
    const firstHour = Math.ceil((seg.start + seg.offset) / HOUR) * HOUR;
    for (let local = firstHour; local - seg.offset < seg.end; local += HOUR) {
      const wall = wallFromOffset(local - seg.offset, seg.offset);
      ticks.push({
        t: local - seg.offset,
        hour: wall.hour,
        dayStart: wall.hour === 0,
        wall,
      });
    }
  }

  return { ticks, bands, segments };
}

/**
 * How many hours apart labelled ticks should be at a given scale, so labels
 * never collide. Thresholds assume the ~3-character 12-hour labels (`12p`),
 * which are the widest case.
 */
export function labelInterval(pxPerHour: number): number {
  if (pxPerHour >= 46) return 1;
  if (pxPerHour >= 22) return 3;
  if (pxPerHour >= 11) return 6;
  return 12;
}
