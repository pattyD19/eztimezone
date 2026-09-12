/**
 * When can everyone actually meet?
 *
 * The strips answer "what time is it there". This answers the question people
 * actually open a timezone tool to ask, by intersecting each zone's working
 * hours and returning the spans that survive.
 *
 * Pure interval arithmetic over what `bandsOf` already produces, so the two
 * can never disagree about where a working day falls.
 */

import { MINUTE } from './format';
import { bandsOf, type StripOptions } from './ticks';

export interface Interval {
  start: number;
  end: number;
}

/**
 * Sort and coalesce, joining intervals that merely touch.
 *
 * Touching matters: a working day containing a DST transition is emitted as
 * two abutting bands, one per constant-offset segment. Left unmerged they
 * would intersect into two windows with a zero-width seam between them, and
 * the ribbon would show a hairline gap on exactly the day people most need to
 * get right.
 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [{ start: sorted[0]!.start, end: sorted[0]!.end }];

  for (const next of sorted.slice(1)) {
    const last = out[out.length - 1]!;
    if (next.start <= last.end) last.end = Math.max(last.end, next.end);
    else out.push({ start: next.start, end: next.end });
  }
  return out;
}

/**
 * Intersect two sorted, disjoint interval lists.
 * Advancing whichever ends first is what keeps this linear.
 */
export function intersectIntervals(
  a: readonly Interval[],
  b: readonly Interval[],
): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    const left = a[i]!;
    const right = b[j]!;
    const start = Math.max(left.start, right.start);
    const end = Math.min(left.end, right.end);
    if (end > start) out.push({ start, end });
    if (left.end < right.end) i += 1;
    else j += 1;
  }
  return out;
}

export interface MeetingOptions extends StripOptions {
  /** Saturdays and Sundays are excluded by default. */
  includeWeekends?: boolean;
  /** Windows shorter than this are dropped; a ten-minute overlap is not a meeting. */
  minimumMinutes?: number;
}

const WEEKEND = new Set([0, 6]);

/** One zone's working hours across a span, as merged intervals. */
export function workingIntervals(
  tz: string,
  start: number,
  end: number,
  options: MeetingOptions = {},
): Interval[] {
  const includeWeekends = options.includeWeekends ?? false;

  const working = bandsOf(tz, start, end, options).filter(
    (band) => band.kind === 'work' && (includeWeekends || !WEEKEND.has(band.weekday)),
  );

  return mergeIntervals(working);
}

/**
 * Spans where every one of `zones` is inside working hours.
 *
 * Note that the weekend test is per zone and per *local* day, which is the
 * only correct reading: when Sydney is in Monday's working hours, London is
 * still on Sunday evening, and no meeting is happening.
 */
export function meetingWindows(
  zones: readonly string[],
  start: number,
  end: number,
  options: MeetingOptions = {},
): Interval[] {
  if (zones.length === 0) return [];

  const minimum = (options.minimumMinutes ?? 30) * MINUTE;

  let shared = workingIntervals(zones[0]!, start, end, options);
  for (const tz of zones.slice(1)) {
    if (shared.length === 0) return [];
    shared = intersectIntervals(shared, workingIntervals(tz, start, end, options));
  }

  return shared.filter((window) => window.end - window.start >= minimum);
}

/**
 * How far ahead to look for the next window. Working hours repeat weekly, so
 * two weeks is conclusive: finding nothing here means these zones never share
 * working hours at all, which is a real answer and worth saying plainly.
 */
const LOOKAHEAD_DAYS = 14;

export interface NextWindow {
  window: Interval | null;
  /** True when no window exists within the lookahead, i.e. these zones never overlap. */
  never: boolean;
}

/**
 * The first shared window at or after `from`.
 *
 * Distinguishes "not in the span you are looking at" from "not ever", because
 * those call for completely different reactions from the user: scroll, versus
 * pick different zones.
 */
export function nextMeetingWindow(
  zones: readonly string[],
  from: number,
  options: MeetingOptions = {},
): NextWindow {
  if (zones.length < 2) return { window: null, never: false };

  const day = 24 * 60 * MINUTE;
  // Start a day early so a window already in progress is found whole. Scanning
  // from `from` would clip it, and the caller would report a three-hour window
  // as the one hour of it that happens to be left.
  const horizon = from + LOOKAHEAD_DAYS * day;
  const found = meetingWindows(zones, from - day, horizon, options).find((w) => w.end > from);

  return { window: found ?? null, never: found === undefined };
}

/** `"3h"`, `"2h 30m"`, `"45m"`. */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
