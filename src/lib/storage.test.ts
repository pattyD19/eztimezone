import { afterEach, describe, expect, it, vi } from 'vitest';
import { readJson, readString, writeJson, writeString } from './storage';

afterEach(() => vi.unstubAllGlobals());

function withStorage(): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    },
  });
  return map;
}

/**
 * Reading `localStorage` does not merely return null when unavailable — it
 * throws. Safari in private mode, browsers set to block site data, and any page
 * served from a `data:` URL all do this, and an unguarded read blanks the app
 * on load. We hit exactly this when the preview pane served the build as a
 * `data:` URL.
 */
function withThrowingStorage(): void {
  vi.stubGlobal(
    'window',
    Object.defineProperty({}, 'localStorage', {
      get() {
        throw new Error('The operation is insecure.');
      },
    }),
  );
}

function withHostileStorage(): void {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    },
  });
}

describe('when storage works', () => {
  it('round-trips a string', () => {
    withStorage();
    writeString('k', 'v');
    expect(readString('k')).toBe('v');
  });

  it('returns null for a key that was never set', () => {
    withStorage();
    expect(readString('absent')).toBeNull();
  });

  it('round-trips JSON that passes its guard', () => {
    withStorage();
    const isStrings = (v: unknown): v is string[] =>
      Array.isArray(v) && v.every((x) => typeof x === 'string');

    writeJson('zones', ['UTC', 'Asia/Tokyo']);
    expect(readJson('zones', isStrings)).toEqual(['UTC', 'Asia/Tokyo']);
  });

  it('rejects stored JSON of the wrong shape rather than returning it', () => {
    const map = withStorage();
    const isStrings = (v: unknown): v is string[] =>
      Array.isArray(v) && v.every((x) => typeof x === 'string');

    map.set('zones', '{"not":"an array"}');
    expect(readJson('zones', isStrings)).toBeNull();
  });

  it('survives malformed JSON', () => {
    const map = withStorage();
    map.set('zones', '{oh no');
    expect(readJson('zones', (_v): _v is unknown => true)).toBeNull();
  });

  it('does not throw on a value that cannot be serialised', () => {
    withStorage();
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() => writeJson('bad', cyclic)).not.toThrow();
  });
});

describe('when touching storage throws', () => {
  it('reads as null instead of taking the app down', () => {
    withThrowingStorage();
    expect(readString('k')).toBeNull();
    expect(readJson('k', (_v): _v is unknown => true)).toBeNull();
  });

  it('swallows writes', () => {
    withThrowingStorage();
    expect(() => writeString('k', 'v')).not.toThrow();
    expect(() => writeJson('k', { a: 1 })).not.toThrow();
  });
});

describe('when storage exists but refuses', () => {
  it('treats a throwing read as absent', () => {
    withHostileStorage();
    expect(readString('k')).toBeNull();
  });

  it('treats a quota failure as a no-op', () => {
    withHostileStorage();
    expect(() => writeString('k', 'v')).not.toThrow();
  });
});

describe('when there is no window at all', () => {
  it('degrades rather than throwing', () => {
    vi.stubGlobal('window', undefined);
    expect(readString('k')).toBeNull();
    expect(() => writeString('k', 'v')).not.toThrow();
  });
});
