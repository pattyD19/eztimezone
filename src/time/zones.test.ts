import { describe, expect, it } from 'vitest';
import { ZONE_IDS, detectHomeZone, normalizeZone, searchZones, zoneLabel, zoneRegion } from './zones';
import { isValidZone } from './format';

describe('ZONE_IDS', () => {
  it('comes from the platform and covers the common zones', () => {
    expect(ZONE_IDS.length).toBeGreaterThan(100);
    for (const tz of ['UTC', 'Europe/London', 'Asia/Tokyo', 'America/New_York']) {
      expect(ZONE_IDS).toContain(normalizeZone(tz));
    }
  });

  it('includes UTC even where the platform list omits it', () => {
    expect(ZONE_IDS).toContain('UTC');
  });

  it('holds no duplicates', () => {
    expect(new Set(ZONE_IDS).size).toBe(ZONE_IDS.length);
  });

  it('contains only zones the runtime can actually resolve', () => {
    for (const tz of ZONE_IDS.slice(0, 40)) expect(isValidZone(tz)).toBe(true);
  });
});

describe('zoneLabel', () => {
  it('takes the city from the id and un-escapes underscores', () => {
    expect(zoneLabel('America/New_York')).toBe('New York');
    expect(zoneLabel('UTC')).toBe('UTC');
  });

  it('shows the modern city name even on runtimes that prefer legacy ids', () => {
    expect(zoneLabel(normalizeZone('Asia/Kolkata')!)).toBe('Kolkata');
    expect(zoneLabel(normalizeZone('Europe/Kyiv')!)).toBe('Kyiv');
    expect(zoneLabel(normalizeZone('America/Argentina/Buenos_Aires')!)).toBe('Buenos Aires');
  });
});

describe('zoneRegion', () => {
  it('reports the leading region, or Universal for bare ids', () => {
    expect(zoneRegion('Asia/Kolkata')).toBe('Asia');
    expect(zoneRegion('UTC')).toBe('Universal');
  });
});

describe('searchZones', () => {
  it('finds cities the zone id does not mention', () => {
    expect(searchZones('bangalore')[0]).toBe(normalizeZone('Asia/Kolkata'));
    expect(searchZones('nyc')[0]).toBe(normalizeZone('America/New_York'));
    expect(searchZones('bay area')[0]).toBe(normalizeZone('America/Los_Angeles'));
  });

  it('finds a zone by a legacy spelling the user might remember', () => {
    expect(searchZones('calcutta')).toContain(normalizeZone('Asia/Kolkata'));
    expect(searchZones('kolkata')).toContain(normalizeZone('Asia/Kolkata'));
  });

  it('ranks an exact city name first', () => {
    expect(searchZones('paris')[0]).toBe(normalizeZone('Europe/Paris'));
    expect(searchZones('tokyo')[0]).toBe(normalizeZone('Asia/Tokyo'));
  });

  it('matches on the raw id as a fallback', () => {
    expect(searchZones('Pacific/Auck')).toContain('Pacific/Auckland');
  });

  it('is case-insensitive and ignores surrounding space', () => {
    expect(searchZones('  ToKyO  ')[0]).toBe(normalizeZone('Asia/Tokyo'));
  });

  it('returns nothing for an empty query', () => {
    expect(searchZones('')).toEqual([]);
    expect(searchZones('   ')).toEqual([]);
  });

  it('respects the result limit', () => {
    expect(searchZones('a', 5)).toHaveLength(5);
  });

  it('never returns a zone the runtime cannot resolve', () => {
    for (const id of searchZones('america', 20)) expect(isValidZone(id)).toBe(true);
  });
});

describe('normalizeZone', () => {
  it('maps both spellings of a renamed zone onto one id', () => {
    expect(normalizeZone('Asia/Kolkata')).toBe(normalizeZone('Asia/Calcutta'));
    expect(normalizeZone('Europe/Kyiv')).toBe(normalizeZone('Europe/Kiev'));
  });

  it('resolves deprecated aliases onto a real zone', () => {
    expect(normalizeZone('US/Pacific')).toBe(normalizeZone('America/Los_Angeles'));
  });

  it('returns null for junk rather than throwing', () => {
    expect(normalizeZone('Middle/Earth')).toBeNull();
    expect(normalizeZone('')).toBeNull();
  });
});

describe('detectHomeZone', () => {
  it('returns a usable zone', () => {
    expect(isValidZone(detectHomeZone())).toBe(true);
  });
});
