import { describe, expect, it } from 'vitest';
import { MAX_ZONES, reconcile } from './useZones';
import { normalizeZone } from '../time/zones';

const HOME = normalizeZone('America/New_York')!;
const id = (tz: string): string => normalizeZone(tz)!;

describe('reconcile', () => {
  it('puts the home zone first, wherever it appeared', () => {
    const zones = reconcile(['Europe/London', HOME, 'Asia/Tokyo'], HOME);
    expect(zones[0]).toBe(HOME);
    expect(zones).toHaveLength(3);
  });

  it('adds the home zone when a list arrives without it', () => {
    // A shared link carries the sender's zones; the reader still needs their own.
    const zones = reconcile(['Europe/London', 'Asia/Tokyo'], HOME);
    expect(zones[0]).toBe(HOME);
    expect(zones).toEqual([HOME, id('Europe/London'), id('Asia/Tokyo')]);
  });

  it('de-duplicates', () => {
    const zones = reconcile(['Europe/London', 'Europe/London'], HOME);
    expect(zones).toEqual([HOME, id('Europe/London')]);
  });

  it('collapses two spellings of the same zone into one row', () => {
    // Kolkata and Calcutta are the same place; one runtime's ICU prefers each.
    const zones = reconcile(['Asia/Kolkata', 'Asia/Calcutta'], HOME);
    expect(zones).toEqual([HOME, id('Asia/Kolkata')]);
  });

  it('drops zones the runtime cannot resolve', () => {
    const zones = reconcile(['Europe/London', 'Middle/Earth', ''], HOME);
    expect(zones).toEqual([HOME, id('Europe/London')]);
  });

  it('never exceeds the maximum, and keeps home when trimming', () => {
    const zones = reconcile(
      ['Europe/London', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney', 'Europe/Paris', 'UTC'],
      HOME,
    );
    expect(zones).toHaveLength(MAX_ZONES);
    expect(zones[0]).toBe(HOME);
  });

  it('returns just the home zone for an empty list', () => {
    expect(reconcile([], HOME)).toEqual([HOME]);
  });

  it('does not mutate what it was given', () => {
    const input = ['Europe/London', 'Asia/Tokyo'];
    const copy = [...input];
    reconcile(input, HOME);
    expect(input).toEqual(copy);
  });

  it('is idempotent', () => {
    const once = reconcile(['Europe/London', 'Asia/Tokyo'], HOME);
    expect(reconcile(once, HOME)).toEqual(once);
  });
});
