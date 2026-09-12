/**
 * Zone list and selected instant, encoded in the URL hash.
 *
 * The hash rather than the query string, so the page stays a static asset with
 * no server involvement, and so changing it never reloads.
 */

import { normalizeZone } from '../time/zones';

export interface ShareState {
  zones: string[] | null;
  instant: number | null;
}

export function buildShareUrl(zones: readonly string[], instant: number): string {
  const base = window.location.href.split('#')[0] ?? window.location.href;
  const tz = encodeURIComponent(zones.join(','));
  return `${base}#tz=${tz}&t=${Math.round(instant)}`;
}

export function readShareState(hash: string = window.location.hash): ShareState {
  const raw = hash.replace(/^#/, '');
  if (!raw) return { zones: null, instant: null };

  const params = new URLSearchParams(raw);
  const tz = params.get('tz');
  const t = params.get('t');

  // Normalise incoming ids: a link built where ICU prefers `Asia/Kolkata`
  // must still open where it prefers `Asia/Calcutta`.
  let zones: string[] | null = null;
  if (tz) {
    const resolved = tz
      .split(',')
      .map((id) => normalizeZone(id.trim()))
      .filter((id): id is string => id !== null);
    if (resolved.length) zones = [...new Set(resolved)];
  }

  const instant = t && /^\d+$/.test(t) ? Number(t) : null;
  return { zones, instant: Number.isFinite(instant) ? instant : null };
}
