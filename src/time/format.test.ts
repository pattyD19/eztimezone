import { describe, expect, it } from 'vitest';
import {
  FIGURE_SPACE,
  HOUR,
  MINUTE,
  deltaLabel,
  formatClock,
  formatDate,
  hourLabel,
  isValidZone,
  offsetAt,
  offsetLabel,
  to12Hour,
  wallAt,
} from './format';

describe('offsetAt', () => {
  it('tracks US daylight saving across the year', () => {
    expect(offsetAt('America/New_York', Date.UTC(2026, 0, 15))).toBe(-5 * HOUR);
    expect(offsetAt('America/New_York', Date.UTC(2026, 6, 15))).toBe(-4 * HOUR);
  });

  it('handles the half- and quarter-hour zones that break naive grids', () => {
    expect(offsetAt('Asia/Kolkata', Date.UTC(2026, 0, 15))).toBe(5 * HOUR + 30 * MINUTE);
    expect(offsetAt('Asia/Kathmandu', Date.UTC(2026, 0, 15))).toBe(5 * HOUR + 45 * MINUTE);
    expect(offsetAt('Pacific/Chatham', Date.UTC(2026, 6, 15))).toBe(12 * HOUR + 45 * MINUTE);
  });

  it('handles southern-hemisphere DST running the other way', () => {
    expect(offsetAt('Australia/Sydney', Date.UTC(2026, 0, 15))).toBe(11 * HOUR);
    expect(offsetAt('Australia/Sydney', Date.UTC(2026, 6, 15))).toBe(10 * HOUR);
  });

  it('is unaffected by sub-second precision in the instant', () => {
    const t = Date.UTC(2026, 0, 15, 12, 0, 0);
    expect(offsetAt('Asia/Kolkata', t + 743)).toBe(offsetAt('Asia/Kolkata', t));
  });

  it('returns a whole number of minutes for every zone it knows', () => {
    for (const tz of ['UTC', 'Asia/Tokyo', 'America/St_Johns', 'Pacific/Marquesas']) {
      // Math.abs, because a negative offset divides to -0 and Object.is(-0, 0) is false.
      expect(Math.abs(offsetAt(tz, Date.now()) % MINUTE)).toBe(0);
    }
  });
});

describe('isValidZone', () => {
  it('accepts real zones and rejects junk', () => {
    expect(isValidZone('Europe/London')).toBe(true);
    expect(isValidZone('Middle/Earth')).toBe(false);
    expect(isValidZone('')).toBe(false);
  });
});

describe('wallAt', () => {
  it('reads the local wall clock, not UTC', () => {
    // 2026-01-15 12:00 UTC is 17:30 the same day in Kolkata.
    const w = wallAt('Asia/Kolkata', Date.UTC(2026, 0, 15, 12));
    expect([w.year, w.month, w.day, w.hour, w.minute]).toEqual([2026, 0, 15, 17, 30]);
  });

  it('rolls the date backwards where the zone is behind UTC', () => {
    // 2026-01-15 02:00 UTC is still the 14th in Los Angeles.
    const w = wallAt('America/Los_Angeles', Date.UTC(2026, 0, 15, 2));
    expect([w.day, w.hour]).toEqual([14, 18]);
  });
});

describe('formatClock', () => {
  const wall = (hour: number, minute = 24) =>
    wallAt('UTC', Date.UTC(2026, 8, 12, hour, minute));

  it('formats 24-hour with zero padding', () => {
    expect(formatClock(wall(9), true)).toMatchObject({ time: '09:24', meridiem: null });
    expect(formatClock(wall(17), true)).toMatchObject({ time: '17:24', meridiem: null });
    expect(formatClock(wall(0), true)).toMatchObject({ time: '00:24', meridiem: null });
  });

  it('formats 12-hour with AM/PM', () => {
    expect(formatClock(wall(9), false)).toMatchObject({ meridiem: 'AM', period: 'am' });
    expect(formatClock(wall(17), false)).toMatchObject({
      time: `${FIGURE_SPACE}5:24`,
      meridiem: 'PM',
    });
  });

  it('calls midnight 12 AM and noon 12 PM', () => {
    expect(formatClock(wall(0), false)).toMatchObject({ time: '12:24', meridiem: 'AM' });
    expect(formatClock(wall(12), false)).toMatchObject({ time: '12:24', meridiem: 'PM' });
  });

  it('pads single-digit hours to keep colons aligned', () => {
    const nine = formatClock(wall(9), false).time;
    const twelve = formatClock(wall(12), false).time;
    expect(nine).toHaveLength(twelve.length);
    expect(nine.startsWith(' ')).toBe(true);
    expect(twelve.startsWith(' ')).toBe(false);
  });
});

describe('to12Hour', () => {
  it('maps the 24-hour clock onto the 12-hour dial', () => {
    expect([0, 1, 11, 12, 13, 23].map(to12Hour)).toEqual([12, 1, 11, 12, 1, 11]);
  });
});

describe('hourLabel', () => {
  it('uses compact meridiem suffixes in 12-hour mode', () => {
    expect([0, 3, 12, 15, 21].map((h) => hourLabel(h, false))).toEqual([
      '12a', '3a', '12p', '3p', '9p',
    ]);
  });

  it('zero-pads in 24-hour mode', () => {
    expect([0, 3, 12, 21].map((h) => hourLabel(h, true))).toEqual(['00', '03', '12', '21']);
  });
});

describe('formatDate', () => {
  it('drops the month when terse', () => {
    const w = wallAt('UTC', Date.UTC(2026, 8, 12));
    expect(formatDate(w)).toBe('Sat 12 Sep');
    expect(formatDate(w, true)).toBe('Sat 12');
  });
});

describe('offsetLabel', () => {
  it('renders whole and fractional offsets', () => {
    expect(offsetLabel(-4 * HOUR)).toBe('GMT-4');
    expect(offsetLabel(0)).toBe('GMT+0');
    expect(offsetLabel(5 * HOUR + 30 * MINUTE)).toBe('GMT+5:30');
    expect(offsetLabel(5 * HOUR + 45 * MINUTE)).toBe('GMT+5:45');
    expect(offsetLabel(-(3 * HOUR + 30 * MINUTE))).toBe('GMT-3:30');
  });
});

describe('deltaLabel', () => {
  const home = -4 * HOUR;
  it('describes the gap from the home zone', () => {
    expect(deltaLabel(-4 * HOUR, home)).toBe('same time as you');
    expect(deltaLabel(-7 * HOUR, home)).toBe('3h behind');
    expect(deltaLabel(9 * HOUR, home)).toBe('13h ahead');
    expect(deltaLabel(5 * HOUR + 30 * MINUTE, home)).toBe('9h 30m ahead');
  });

  it('handles a sub-hour gap with no hour component', () => {
    expect(deltaLabel(home + 45 * MINUTE, home)).toBe('45m ahead');
  });
});
