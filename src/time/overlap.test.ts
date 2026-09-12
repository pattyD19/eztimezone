import { describe, expect, it } from 'vitest';
import { DAY, HOUR, MINUTE } from './format';
import {
  formatDuration,
  intersectIntervals,
  meetingWindows,
  mergeIntervals,
  workingIntervals,
  nextMeetingWindow,
} from './overlap';

// 14 September 2026 is a Monday; the 12th and 13th are the weekend before it.
const MONDAY = Date.UTC(2026, 8, 14);
const SATURDAY = Date.UTC(2026, 8, 12);
const hours = (n: number) => n * HOUR;

describe('mergeIntervals', () => {
  it('sorts and coalesces overlapping spans', () => {
    expect(
      mergeIntervals([
        { start: 30, end: 40 },
        { start: 0, end: 10 },
        { start: 5, end: 20 },
      ]),
    ).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 40 },
    ]);
  });

  it('joins spans that merely touch, so a DST-split day has no seam', () => {
    expect(
      mergeIntervals([
        { start: 0, end: 10 },
        { start: 10, end: 25 },
      ]),
    ).toEqual([{ start: 0, end: 25 }]);
  });

  it('leaves a real gap alone', () => {
    const input = [
      { start: 0, end: 10 },
      { start: 11, end: 20 },
    ];
    expect(mergeIntervals(input)).toEqual(input);
  });

  it('does not mutate its input', () => {
    const input = [{ start: 0, end: 10 }, { start: 5, end: 20 }];
    const copy = structuredClone(input);
    mergeIntervals(input);
    expect(input).toEqual(copy);
  });

  it('handles the empty case', () => {
    expect(mergeIntervals([])).toEqual([]);
  });
});

describe('intersectIntervals', () => {
  it('keeps only the shared part', () => {
    expect(
      intersectIntervals([{ start: 0, end: 10 }], [{ start: 4, end: 20 }]),
    ).toEqual([{ start: 4, end: 10 }]);
  });

  it('finds every shared part across many spans', () => {
    expect(
      intersectIntervals(
        [{ start: 0, end: 10 }, { start: 20, end: 30 }],
        [{ start: 5, end: 25 }],
      ),
    ).toEqual([
      { start: 5, end: 10 },
      { start: 20, end: 25 },
    ]);
  });

  it('returns nothing when spans only touch', () => {
    expect(intersectIntervals([{ start: 0, end: 10 }], [{ start: 10, end: 20 }])).toEqual([]);
  });

  it('returns nothing when either side is empty', () => {
    expect(intersectIntervals([], [{ start: 0, end: 10 }])).toEqual([]);
    expect(intersectIntervals([{ start: 0, end: 10 }], [])).toEqual([]);
  });
});

describe('workingIntervals', () => {
  it('reports one working day per weekday in the span', () => {
    const monday = workingIntervals('UTC', MONDAY, MONDAY + DAY);
    expect(monday).toEqual([{ start: MONDAY + hours(9), end: MONDAY + hours(17) }]);
  });

  it('skips weekends by default', () => {
    expect(workingIntervals('UTC', SATURDAY, SATURDAY + 2 * DAY)).toEqual([]);
  });

  it('includes weekends when asked', () => {
    const weekend = workingIntervals('UTC', SATURDAY, SATURDAY + 2 * DAY, {
      includeWeekends: true,
    });
    expect(weekend).toHaveLength(2);
  });

  it('honours custom working hours', () => {
    expect(
      workingIntervals('UTC', MONDAY, MONDAY + DAY, { workStart: 10, workEnd: 16 }),
    ).toEqual([{ start: MONDAY + hours(10), end: MONDAY + hours(16) }]);
  });

  it('places the day by local time, not UTC', () => {
    // 09:00 in Tokyo (UTC+9) on Monday is 00:00 UTC on Monday.
    const [first] = workingIntervals('Asia/Tokyo', MONDAY - DAY, MONDAY + DAY);
    expect(first?.start).toBe(MONDAY);
  });
});

describe('meetingWindows', () => {
  const span = [MONDAY, MONDAY + DAY] as const;

  it('finds the classic New York / London overlap', () => {
    // London 09:00-17:00 BST is 08:00-16:00 UTC; New York 09:00-17:00 EDT is
    // 13:00-21:00 UTC. Three hours in common, every weekday.
    const windows = meetingWindows(['America/New_York', 'Europe/London'], ...span);
    expect(windows).toEqual([{ start: MONDAY + hours(13), end: MONDAY + hours(16) }]);
    expect(formatDuration(windows[0]!.end - windows[0]!.start)).toBe('3h');
  });

  it('reports no window for New York and Bangalore, because there is none', () => {
    expect(meetingWindows(['America/New_York', 'Asia/Kolkata'], ...span)).toEqual([]);
  });

  it('narrows as zones are added, never widens', () => {
    const two = meetingWindows(['Europe/London', 'Europe/Berlin'], ...span);
    const three = meetingWindows(['Europe/London', 'Europe/Berlin', 'America/New_York'], ...span);
    const total = (w: { start: number; end: number }[]) =>
      w.reduce((n, i) => n + (i.end - i.start), 0);
    expect(total(three)).toBeLessThan(total(two));
  });

  it('gives a single zone its own working hours', () => {
    expect(meetingWindows(['UTC'], ...span)).toEqual([
      { start: MONDAY + hours(9), end: MONDAY + hours(17) },
    ]);
  });

  it('returns nothing for no zones at all', () => {
    expect(meetingWindows([], ...span)).toEqual([]);
  });

  it('drops slivers too short to be a meeting', () => {
    // Adelaide is +09:30, so a half-hour offset can leave a thin sliver.
    const windows = meetingWindows(['UTC', 'Europe/Athens'], MONDAY, MONDAY + DAY, {
      minimumMinutes: 30,
    });
    for (const w of windows) expect(w.end - w.start).toBeGreaterThanOrEqual(30 * MINUTE);
  });

  it('respects a higher minimum', () => {
    const relaxed = meetingWindows(['America/New_York', 'Europe/London'], ...span);
    const strict = meetingWindows(['America/New_York', 'Europe/London'], ...span, {
      minimumMinutes: 4 * 60,
    });
    expect(relaxed).toHaveLength(1);
    expect(strict).toEqual([]); // the window is only three hours
  });

  it('finds nothing over a weekend', () => {
    expect(
      meetingWindows(['America/New_York', 'Europe/London'], SATURDAY, SATURDAY + 2 * DAY),
    ).toEqual([]);
  });

  it('is order-independent', () => {
    const zones = ['America/New_York', 'Europe/London', 'Europe/Berlin'];
    const forward = meetingWindows(zones, ...span);
    const reversed = meetingWindows([...zones].reverse(), ...span);
    expect(forward).toEqual(reversed);
  });

  it('returns windows that are sorted and disjoint', () => {
    const windows = meetingWindows(
      ['Europe/London', 'Europe/Berlin'],
      MONDAY,
      MONDAY + 5 * DAY,
    );
    expect(windows.length).toBeGreaterThan(1);
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i]!.start).toBeGreaterThan(windows[i - 1]!.end);
    }
  });

  it('survives a span containing a daylight-saving change', () => {
    // Europe and the US shift on different dates, so late October is the week
    // the London/New York gap changes from 5 hours to 4.
    const week = Date.UTC(2026, 9, 24);
    const windows = meetingWindows(['America/New_York', 'Europe/London'], week, week + 7 * DAY);
    expect(windows.length).toBeGreaterThan(0);
    // No hairline seams: every window is a real, meeting-sized block.
    for (const w of windows) expect(w.end - w.start).toBeGreaterThanOrEqual(30 * MINUTE);
  });
});

describe('formatDuration', () => {
  it('reads the way a person would say it', () => {
    expect(formatDuration(3 * HOUR)).toBe('3h');
    expect(formatDuration(2.5 * HOUR)).toBe('2h 30m');
    expect(formatDuration(45 * MINUTE)).toBe('45m');
  });
});

describe('nextMeetingWindow', () => {
  const SATURDAY_MORNING = Date.UTC(2026, 8, 12, 9);

  it('looks past a weekend to the next working window', () => {
    const { window, never } = nextMeetingWindow(
      ['America/New_York', 'Europe/London'],
      SATURDAY_MORNING,
    );
    expect(never).toBe(false);
    // The next shared window is Monday 13:00-16:00 UTC.
    expect(window).toEqual({ start: Date.UTC(2026, 8, 14, 13), end: Date.UTC(2026, 8, 14, 16) });
  });

  it('reports "never" for zones that genuinely never overlap', () => {
    // Los Angeles 09:00-17:00 is 16:00-24:00 UTC; Tokyo's is 00:00-08:00 UTC.
    // There is no hour of any week when both are at work.
    const { window, never } = nextMeetingWindow(
      ['America/Los_Angeles', 'Asia/Tokyo'],
      SATURDAY_MORNING,
    );
    expect(window).toBeNull();
    expect(never).toBe(true);
  });

  it('returns the window currently in progress rather than skipping it', () => {
    const midWindow = Date.UTC(2026, 8, 14, 14); // inside Monday's 13:00-16:00
    const { window } = nextMeetingWindow(['America/New_York', 'Europe/London'], midWindow);
    expect(window?.start).toBe(Date.UTC(2026, 8, 14, 13));
  });

  it('says nothing either way for fewer than two zones', () => {
    expect(nextMeetingWindow(['UTC'], SATURDAY_MORNING)).toEqual({ window: null, never: false });
  });
});
