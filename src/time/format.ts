/**
 * Wall-clock formatting for IANA zones.
 *
 * Everything here derives from one primitive: the UTC offset of a zone at an
 * instant. Once the offset is known, the local wall clock is just
 * `new Date(instant + offset)` read through its UTC getters — which keeps the
 * readouts and the tick grid guaranteed consistent, because both come from the
 * same number. No date library is involved: `Intl.DateTimeFormat` already ships
 * the full IANA database in every browser.
 */

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** U+2007 FIGURE SPACE: one digit wide, so `9:05` lines up under `12:05`. */
export const FIGURE_SPACE = ' ';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/**
 * Offset east of UTC, in milliseconds, for `tz` at `instant`.
 * Always a whole number of minutes — every real zone offset is.
 */
export function offsetAt(tz: string, instant: number): number {
  const parts = partsFormatter(tz).formatToParts(new Date(instant));
  const g: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') g[p.type] = p.value;

  // `hourCycle: 'h23'` should never yield 24, but some engines have historically
  // emitted it for midnight; normalising costs nothing and avoids a silent
  // one-day error.
  const hour = Number(g['hour']) % 24;
  const asUTC = Date.UTC(
    Number(g['year']),
    Number(g['month']) - 1,
    Number(g['day']),
    hour,
    Number(g['minute']),
    Number(g['second']),
  );
  return Math.round((asUTC - instant) / MINUTE) * MINUTE;
}

export function isValidZone(tz: string): boolean {
  try {
    offsetAt(tz, Date.now());
    return true;
  } catch {
    return false;
  }
}

/** A local wall-clock reading. `month` is 0-indexed, matching `Date`. */
export interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  offset: number;
}

/** Wall clock for an instant, given an already-known offset. */
export function wallFromOffset(instant: number, offset: number): Wall {
  const d = new Date(instant + offset);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
    offset,
  };
}

export function wallAt(tz: string, instant: number): Wall {
  return wallFromOffset(instant, offsetAt(tz, instant));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function to12Hour(hour24: number): number {
  return hour24 % 12 === 0 ? 12 : hour24 % 12;
}

export type Meridiem = 'am' | 'pm';

export function meridiemOf(hour24: number): Meridiem {
  return hour24 < 12 ? 'am' : 'pm';
}

export interface Clock {
  /** Digits only, e.g. `"9:24"` or `"09:24"`. */
  time: string;
  /** `"AM"` / `"PM"` in 12-hour mode, `null` in 24-hour mode. */
  meridiem: string | null;
  period: Meridiem;
}

export function formatClock(wall: Wall, use24Hour: boolean): Clock {
  const period = meridiemOf(wall.hour);
  if (use24Hour) {
    return { time: `${pad2(wall.hour)}:${pad2(wall.minute)}`, meridiem: null, period };
  }
  const h = to12Hour(wall.hour);
  // Pad single-digit hours so the colons stay in a column down the stack.
  const lead = h < 10 ? FIGURE_SPACE : '';
  return {
    time: `${lead}${h}:${pad2(wall.minute)}`,
    meridiem: period === 'am' ? 'AM' : 'PM',
    period,
  };
}

/** `"Sat 12 Sep"`, or `"Sat 12"` when there is no room for the month. */
export function formatDate(wall: Wall, terse = false): string {
  const head = `${WEEKDAYS[wall.weekday]} ${wall.day}`;
  return terse ? head : `${head} ${MONTHS[wall.month]}`;
}

/** Compact strip label: `12a 3a 12p 9p`, or `00 03 12 21` in 24-hour mode. */
export function hourLabel(hour24: number, use24Hour: boolean): string {
  if (use24Hour) return pad2(hour24);
  if (hour24 === 0) return '12a';
  if (hour24 === 12) return '12p';
  return hour24 < 12 ? `${hour24}a` : `${hour24 - 12}p`;
}

/** `"GMT+5:30"`, `"GMT-4"`, `"GMT+0"`. */
export function offsetLabel(offset: number): string {
  const sign = offset < 0 ? '-' : '+';
  const total = Math.abs(offset) / MINUTE;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `GMT${sign}${h}${m ? `:${pad2(m)}` : ''}`;
}

/** `"9h 30m ahead"`, `"3h behind"`, `"same time as you"`. */
export function deltaLabel(offset: number, homeOffset: number): string {
  const diff = (offset - homeOffset) / MINUTE;
  if (diff === 0) return 'same time as you';
  const direction = diff < 0 ? 'behind' : 'ahead';
  const total = Math.abs(diff);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return `${parts.join(' ')} ${direction}`;
}
