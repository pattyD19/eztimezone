/**
 * Daylight-saving changes, surfaced.
 *
 * The strips already render correctly across a transition — grids are laid
 * inside constant-offset segments, so no hour is invented or silently doubled.
 * But being correct is not the same as being useful: the mistake people
 * actually make is agreeing a recurring time and not noticing that in three
 * weeks the gap between two zones changes by an hour.
 *
 * Every boundary between the segments `segmentsOf` already produces is exactly
 * such a change, so this costs nothing new to compute.
 */

import { MINUTE, offsetAt } from './format';
import { segmentsOf } from './ticks';

export interface Transition {
  tz: string;
  /** The first instant on the new offset. */
  at: number;
  offsetBefore: number;
  offsetAfter: number;
  /** Positive when clocks go forward. */
  shift: number;
}

export function transitionsOf(tz: string, start: number, end: number): Transition[] {
  const segments = segmentsOf(tz, start, end);
  const out: Transition[] = [];

  for (let i = 1; i < segments.length; i += 1) {
    const before = segments[i - 1]!;
    const after = segments[i]!;
    out.push({
      tz,
      at: after.start,
      offsetBefore: before.offset,
      offsetAfter: after.offset,
      shift: after.offset - before.offset,
    });
  }
  return out;
}

/** Every zone's transitions across a span, soonest first. */
export function transitionsAcross(
  zones: readonly string[],
  start: number,
  end: number,
): Transition[] {
  return zones
    .flatMap((tz) => transitionsOf(tz, start, end))
    .sort((a, b) => a.at - b.at);
}

export type ShiftDirection = 'forward' | 'back';

export function shiftDirection(shift: number): ShiftDirection {
  return shift > 0 ? 'forward' : 'back';
}

/** `"1h"`, `"30m"` — Lord Howe shifts by half an hour, so this cannot assume hours. */
export function formatShift(shift: number): string {
  const minutes = Math.abs(shift) / MINUTE;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** `"+1h"` / `"-1h"`, for the marker drawn on the strip itself. */
export function formatSignedShift(shift: number): string {
  return `${shift > 0 ? '+' : '−'}${formatShift(shift)}`;
}

export interface TransitionSummary extends Transition {
  isHome: boolean;
  /**
   * The zone's offset from home once the change has taken effect, or null when
   * the changing zone *is* home — in which case every gap on screen moves and
   * naming one of them would be misleading.
   */
  deltaAfter: number | null;
  /** The offset from home immediately before the change. */
  deltaBefore: number | null;
}

export function summarise(transition: Transition, home: string): TransitionSummary {
  const isHome = transition.tz === home;
  if (isHome) {
    return { ...transition, isHome, deltaAfter: null, deltaBefore: null };
  }
  // Home may be mid-change at the same instant, so both sides are measured
  // against home as it actually is at that moment rather than assumed fixed.
  return {
    ...transition,
    isHome,
    deltaBefore: transition.offsetBefore - offsetAt(home, transition.at - 1),
    deltaAfter: transition.offsetAfter - offsetAt(home, transition.at),
  };
}
