import { describe, expect, it } from 'vitest';
import { DAY, HOUR, MINUTE, offsetAt } from './format';
import { buildStrip, findTransition, labelInterval, segmentsOf } from './ticks';

// US DST in 2026: forward on 8 March at 02:00 local (07:00 UTC),
// back on 1 November at 02:00 local (06:00 UTC).
const SPRING_FORWARD = Date.UTC(2026, 2, 8, 7);
const FALL_BACK = Date.UTC(2026, 10, 1, 6);

describe('findTransition', () => {
  it('lands on the exact instant the offset changes', () => {
    const lo = Date.UTC(2026, 2, 8, 0);
    const hi = Date.UTC(2026, 2, 9, 0);
    expect(findTransition('America/New_York', lo, hi, -5 * HOUR)).toBe(SPRING_FORWARD);
  });

  it('works in the autumn direction too', () => {
    const lo = Date.UTC(2026, 9, 31, 12);
    const hi = Date.UTC(2026, 10, 2, 0);
    expect(findTransition('America/New_York', lo, hi, -4 * HOUR)).toBe(FALL_BACK);
  });
});

describe('segmentsOf', () => {
  it('returns a single segment when no transition is in the window', () => {
    const segs = segmentsOf('America/New_York', Date.UTC(2026, 5, 1), Date.UTC(2026, 5, 8));
    expect(segs).toHaveLength(1);
    expect(segs[0]?.offset).toBe(-4 * HOUR);
  });

  it('splits at a spring-forward and abuts exactly', () => {
    const start = Date.UTC(2026, 2, 5);
    const end = Date.UTC(2026, 2, 12);
    const segs = segmentsOf('America/New_York', start, end);

    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ start, end: SPRING_FORWARD, offset: -5 * HOUR });
    expect(segs[1]).toMatchObject({ start: SPRING_FORWARD, end, offset: -4 * HOUR });
  });

  it('splits at a fall-back', () => {
    const segs = segmentsOf('America/New_York', Date.UTC(2026, 9, 29), Date.UTC(2026, 10, 4));
    expect(segs.map((s) => s.offset)).toEqual([-4 * HOUR, -5 * HOUR]);
    expect(segs[1]?.start).toBe(FALL_BACK);
  });

  it('covers the window with no gaps or overlaps, whatever the zone', () => {
    const start = Date.UTC(2026, 2, 1);
    const end = Date.UTC(2026, 2, 22);
    for (const tz of ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'Australia/Sydney']) {
      const segs = segmentsOf(tz, start, end);
      expect(segs[0]?.start).toBe(start);
      expect(segs[segs.length - 1]?.end).toBe(end);
      for (let i = 1; i < segs.length; i += 1) {
        expect(segs[i]?.start).toBe(segs[i - 1]?.end);
      }
    }
  });

  it('reports the offset each segment actually has', () => {
    const segs = segmentsOf('America/New_York', Date.UTC(2026, 2, 5), Date.UTC(2026, 2, 12));
    for (const seg of segs) {
      expect(offsetAt('America/New_York', seg.start)).toBe(seg.offset);
      expect(offsetAt('America/New_York', seg.end - 1)).toBe(seg.offset);
    }
  });
});

describe('buildStrip', () => {
  const start = Date.UTC(2026, 8, 12);
  const end = start + 2 * DAY;

  it('emits ticks in strictly increasing order', () => {
    const { ticks } = buildStrip('Europe/London', start, end);
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i]!.t).toBeGreaterThan(ticks[i - 1]!.t);
    }
  });

  it('places one tick per hour of the window', () => {
    const { ticks } = buildStrip('Europe/London', start, end);
    expect(ticks).toHaveLength(48);
  });

  it('offsets half-hour zones off the UTC hour grid', () => {
    const { ticks } = buildStrip('Asia/Kolkata', start, end);
    // Every Kolkata hour boundary sits 30 minutes off a UTC hour boundary.
    for (const tick of ticks) {
      expect(Math.abs(tick.t % HOUR)).toBe(30 * MINUTE);
      expect(tick.wall.minute).toBe(0);
    }
  });

  it('keeps quarter-hour zones on their own grid', () => {
    const { ticks } = buildStrip('Asia/Kathmandu', start, end);
    for (const tick of ticks) expect(Math.abs(tick.t % HOUR)).toBe(15 * MINUTE);
  });

  it('marks local midnight as a day start', () => {
    const { ticks } = buildStrip('Asia/Tokyo', start, end);
    const dayStarts = ticks.filter((t) => t.dayStart);
    expect(dayStarts).toHaveLength(2);
    for (const tick of dayStarts) expect(tick.hour).toBe(0);
  });

  it('does not invent the hour that never happened at a spring-forward', () => {
    const { ticks } = buildStrip('America/New_York', Date.UTC(2026, 2, 8, 4), Date.UTC(2026, 2, 8, 12));
    const hours = ticks.map((t) => t.hour);
    // Local clocks jump 01:59 -> 03:00, so there is no 2am tick that day.
    expect(hours).not.toContain(2);
    expect(hours).toContain(1);
    expect(hours).toContain(3);
  });

  it('still advances by one real hour across the transition', () => {
    const { ticks } = buildStrip('America/New_York', Date.UTC(2026, 2, 8, 4), Date.UTC(2026, 2, 8, 12));
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i]!.t - ticks[i - 1]!.t).toBe(HOUR);
    }
  });

  it('repeats the hour that happens twice at a fall-back', () => {
    const { ticks } = buildStrip('America/New_York', Date.UTC(2026, 10, 1, 4), Date.UTC(2026, 10, 1, 8));
    const ones = ticks.filter((t) => t.hour === 1);
    expect(ones).toHaveLength(2);
    expect(ones[1]!.t - ones[0]!.t).toBe(HOUR);
  });

  it('shades working hours and nights without overlap within a kind', () => {
    const { bands } = buildStrip('Europe/London', start, end);
    const work = bands.filter((b) => b.kind === 'work');
    const night = bands.filter((b) => b.kind === 'night');
    expect(work).toHaveLength(2);
    expect(work[0]!.end - work[0]!.start).toBe(8 * HOUR);
    for (const band of [...work, ...night]) {
      expect(band.end).toBeGreaterThan(band.start);
      expect(band.start).toBeGreaterThanOrEqual(start);
      expect(band.end).toBeLessThanOrEqual(end);
    }
  });

  it('honours custom working hours', () => {
    // UTC, so band instants and local hours coincide and the assertion is legible.
    const { bands } = buildStrip('UTC', start, end, { workStart: 8, workEnd: 16 });
    const work = bands.filter((b) => b.kind === 'work');
    expect(work[0]!.start).toBe(start + 8 * HOUR);
    expect(work[0]!.end).toBe(start + 16 * HOUR);
  });

  it('places bands by local time, not by UTC', () => {
    // 09:00 BST is 08:00 UTC, so London's working band starts an hour earlier
    // in absolute terms than a UTC zone's does.
    const { bands } = buildStrip('Europe/London', start, end);
    const work = bands.filter((b) => b.kind === 'work');
    expect(work[0]!.start).toBe(start + 8 * HOUR);
  });

  it('finds a transition in a window shorter than the scan step', () => {
    // Four hours wide, straddling the autumn change: a fixed-stride scan that
    // only samples the interior sees no sample at all here.
    const segs = segmentsOf('America/New_York', Date.UTC(2026, 10, 1, 4), Date.UTC(2026, 10, 1, 8));
    expect(segs).toHaveLength(2);
    expect(segs[1]?.start).toBe(FALL_BACK);
  });

  it('clips bands to the requested window rather than spilling past it', () => {
    const narrow = buildStrip('Europe/London', start + 10 * HOUR, start + 12 * HOUR);
    for (const band of narrow.bands) {
      expect(band.start).toBeGreaterThanOrEqual(start + 10 * HOUR);
      expect(band.end).toBeLessThanOrEqual(start + 12 * HOUR);
    }
  });

  it('is pure: the same window yields the same geometry', () => {
    const a = buildStrip('Asia/Kolkata', start, end);
    const b = buildStrip('Asia/Kolkata', start, end);
    expect(a).toEqual(b);
  });
});

describe('labelInterval', () => {
  it('labels fewer hours as the scale shrinks', () => {
    expect(labelInterval(60)).toBe(1);
    expect(labelInterval(30)).toBe(3);
    expect(labelInterval(15)).toBe(6);
    expect(labelInterval(5)).toBe(12);
  });

  it('never returns an interval that would crowd labels', () => {
    for (let px = 4; px < 120; px += 1) {
      expect(labelInterval(px) * px).toBeGreaterThanOrEqual(40);
    }
  });
});
