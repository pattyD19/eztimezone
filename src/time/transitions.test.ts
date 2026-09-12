import { describe, expect, it } from 'vitest';
import { DAY, HOUR, MINUTE } from './format';
import {
  formatShift,
  formatSignedShift,
  shiftDirection,
  summarise,
  transitionsAcross,
  transitionsOf,
} from './transitions';

const SPRING_FORWARD = Date.UTC(2026, 2, 8, 7); // 02:00 local in New York
const FALL_BACK = Date.UTC(2026, 10, 1, 6);
const YEAR_START = Date.UTC(2026, 0, 1);
const YEAR_END = Date.UTC(2027, 0, 1);

describe('transitionsOf', () => {
  it('finds a spring-forward and reports the direction and size', () => {
    const [t] = transitionsOf('America/New_York', Date.UTC(2026, 2, 1), Date.UTC(2026, 2, 15));
    expect(t).toMatchObject({ at: SPRING_FORWARD, shift: HOUR });
    expect(shiftDirection(t!.shift)).toBe('forward');
  });

  it('finds a fall-back', () => {
    const [t] = transitionsOf('America/New_York', Date.UTC(2026, 9, 25), Date.UTC(2026, 10, 8));
    expect(t).toMatchObject({ at: FALL_BACK, shift: -HOUR });
    expect(shiftDirection(t!.shift)).toBe('back');
  });

  it('reports exactly two transitions a year where DST is observed', () => {
    expect(transitionsOf('America/New_York', YEAR_START, YEAR_END)).toHaveLength(2);
    expect(transitionsOf('Europe/London', YEAR_START, YEAR_END)).toHaveLength(2);
  });

  it('reports none at all where it is not', () => {
    for (const tz of ['Asia/Kolkata', 'Asia/Tokyo', 'UTC', 'America/Phoenix']) {
      expect(transitionsOf(tz, YEAR_START, YEAR_END)).toEqual([]);
    }
  });

  it('handles a zone whose shift is not a whole hour', () => {
    // Lord Howe Island moves by thirty minutes, not sixty.
    const shifts = transitionsOf('Australia/Lord_Howe', YEAR_START, YEAR_END).map((t) => t.shift);
    expect(shifts).toHaveLength(2);
    for (const shift of shifts) expect(Math.abs(shift)).toBe(30 * MINUTE);
  });

  it('reports nothing for a quiet span', () => {
    expect(transitionsOf('America/New_York', Date.UTC(2026, 5, 1), Date.UTC(2026, 5, 20))).toEqual([]);
  });

  it('agrees with the offsets either side of the instant it reports', () => {
    const [t] = transitionsOf('America/New_York', Date.UTC(2026, 2, 1), Date.UTC(2026, 2, 15));
    expect(t!.offsetBefore).toBe(-5 * HOUR);
    expect(t!.offsetAfter).toBe(-4 * HOUR);
  });
});

describe('transitionsAcross', () => {
  it('gathers every zone and orders them soonest first', () => {
    // The US moves on 8 March, the EU not until 29 March.
    const all = transitionsAcross(
      ['America/New_York', 'Europe/London', 'Asia/Kolkata'],
      Date.UTC(2026, 2, 1),
      Date.UTC(2026, 3, 5),
    );
    expect(all.map((t) => t.tz)).toEqual(['America/New_York', 'Europe/London']);
    expect(all[0]!.at).toBeLessThan(all[1]!.at);
  });

  it('returns nothing when no zone changes', () => {
    expect(
      transitionsAcross(['Asia/Kolkata', 'Asia/Tokyo'], YEAR_START, YEAR_END),
    ).toEqual([]);
  });
});

describe('summarise', () => {
  const home = 'Europe/London';

  it('reports the gap either side of a change in another zone', () => {
    // Between 8 and 29 March, New York is 4h behind London rather than 5h.
    const [t] = transitionsOf('America/New_York', Date.UTC(2026, 2, 1), Date.UTC(2026, 2, 15));
    const s = summarise(t!, home);
    expect(s.isHome).toBe(false);
    expect(s.deltaBefore).toBe(-5 * HOUR);
    expect(s.deltaAfter).toBe(-4 * HOUR);
  });

  it('declines to name a single gap when it is the home zone that moves', () => {
    const [t] = transitionsOf(home, Date.UTC(2026, 2, 20), Date.UTC(2026, 3, 5));
    const s = summarise(t!, home);
    expect(s.isHome).toBe(true);
    expect(s.deltaAfter).toBeNull();
    expect(s.deltaBefore).toBeNull();
  });

  it('measures against home as it actually is, even mid-change', () => {
    // Both zones move on the same date in autumn 2026 (25 Oct for the EU),
    // so the gap is unchanged across London's own transition.
    const [t] = transitionsOf('Europe/Paris', Date.UTC(2026, 9, 20), Date.UTC(2026, 9, 30));
    const s = summarise(t!, home);
    expect(s.deltaBefore).toBe(HOUR);
    expect(s.deltaAfter).toBe(HOUR);
  });
});

describe('formatting', () => {
  it('says an hour, or half of one', () => {
    expect(formatShift(HOUR)).toBe('1h');
    expect(formatShift(-HOUR)).toBe('1h');
    expect(formatShift(30 * MINUTE)).toBe('30m');
    expect(formatShift(90 * MINUTE)).toBe('1h 30m');
  });

  it('signs the shift for the strip marker', () => {
    expect(formatSignedShift(HOUR)).toBe('+1h');
    expect(formatSignedShift(-HOUR)).toBe('−1h');
    expect(formatSignedShift(30 * MINUTE)).toBe('+30m');
  });
});

describe('the span the strips actually paint', () => {
  it('surfaces a transition inside a three-day buffer', () => {
    const around = SPRING_FORWARD - DAY;
    expect(transitionsOf('America/New_York', around, around + 3 * DAY)).toHaveLength(1);
  });
});
