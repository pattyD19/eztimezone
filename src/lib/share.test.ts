import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildShareUrl, readShareState } from './share';
import { normalizeZone } from '../time/zones';

const AT = Date.UTC(2026, 8, 12, 16, 30);

afterEach(() => vi.unstubAllGlobals());

function atPage(href: string): void {
  vi.stubGlobal('window', { location: { href, hash: '' } });
}

describe('buildShareUrl', () => {
  it('encodes the zones and the instant', () => {
    atPage('https://eztimezone.netlify.app/');
    const url = buildShareUrl(['America/New_York', 'Europe/London'], AT);
    expect(url).toBe(
      `https://eztimezone.netlify.app/#tz=America%2FNew_York%2CEurope%2FLondon&t=${AT}`,
    );
  });

  it('replaces an existing hash rather than appending to it', () => {
    atPage('https://eztimezone.netlify.app/#tz=Asia%2FTokyo&t=1');
    expect(buildShareUrl(['UTC'], AT)).toBe(
      `https://eztimezone.netlify.app/#tz=UTC&t=${AT}`,
    );
  });

  it('rounds a fractional instant, since it goes in the URL', () => {
    atPage('https://x.test/');
    expect(buildShareUrl(['UTC'], AT + 0.6)).toContain(`t=${AT + 1}`);
  });
});

describe('readShareState', () => {
  it('reads back what buildShareUrl wrote', () => {
    atPage('https://x.test/');
    const zones = ['America/New_York', 'Europe/London'];
    const hash = buildShareUrl(zones, AT).split('#')[1]!;
    const state = readShareState(`#${hash}`);
    expect(state.instant).toBe(AT);
    expect(state.zones).toEqual(zones.map((z) => normalizeZone(z)));
  });

  it('normalises spellings, so a link built anywhere opens anywhere', () => {
    // One runtime's ICU prefers Asia/Kolkata, another's Asia/Calcutta. A link
    // from either must open on either.
    const state = readShareState('#tz=Asia%2FKolkata%2CAsia%2FCalcutta');
    expect(state.zones).toEqual([normalizeZone('Asia/Kolkata')]);
  });

  it('drops zones the runtime does not recognise', () => {
    const state = readShareState('#tz=Europe%2FLondon,Middle%2FEarth');
    expect(state.zones).toEqual([normalizeZone('Europe/London')]);
  });

  it('returns nothing for an empty or absent hash', () => {
    expect(readShareState('')).toEqual({ zones: null, instant: null });
    expect(readShareState('#')).toEqual({ zones: null, instant: null });
  });

  it('ignores an instant that is not a number', () => {
    expect(readShareState('#t=yesterday').instant).toBeNull();
    expect(readShareState('#t=-5').instant).toBeNull();
    expect(readShareState('#t=1e9').instant).toBeNull();
  });

  it('accepts one half of the pair without the other', () => {
    expect(readShareState('#tz=UTC').instant).toBeNull();
    expect(readShareState('#tz=UTC').zones).toEqual(['UTC']);
    expect(readShareState(`#t=${AT}`).zones).toBeNull();
    expect(readShareState(`#t=${AT}`).instant).toBe(AT);
  });

  it('does not choke on junk', () => {
    for (const hash of ['#&&&', '#tz=', '#tz=,,,', '#=x', '#tz=%E0%A4%A']) {
      expect(() => readShareState(hash)).not.toThrow();
    }
  });

  it('returns null zones rather than an empty list when none survive', () => {
    expect(readShareState('#tz=Middle%2FEarth').zones).toBeNull();
  });
});
