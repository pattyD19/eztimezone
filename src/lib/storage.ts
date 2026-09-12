/**
 * localStorage that cannot throw.
 *
 * Reading `localStorage` is not merely nullable, it can raise: Safari in
 * private mode, browsers set to block site data, and any page served from a
 * `data:` URL all throw on property access rather than returning null. An
 * unguarded read blanks the app on load, so every access goes through here.
 */

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readString(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    /* quota, private mode, blocked storage: the app works without persistence */
  }
}

export function readJson<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  const raw = readString(key);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeString(key, JSON.stringify(value));
  } catch {
    /* unserialisable value; nothing useful to do */
  }
}
