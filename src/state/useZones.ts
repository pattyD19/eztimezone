import { useCallback, useEffect, useMemo, useState } from 'react';
import { readJson, writeJson } from '../lib/storage';
import { readShareState } from '../lib/share';
import { detectHomeZone, normalizeZone } from '../time/zones';

export const MAX_ZONES = 5;
const STORAGE_KEY = 'eztz.zones';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** Drop unknown zones, de-duplicate, and pin the home zone to the top. */
function reconcile(candidates: readonly string[], home: string): string[] {
  const valid = candidates
    .map((id) => normalizeZone(id))
    .filter((id): id is string => id !== null);
  const unique = [...new Set(valid)].filter((id) => id !== home);
  return [home, ...unique].slice(0, MAX_ZONES);
}

function initialZones(home: string): string[] {
  const shared = readShareState().zones;
  if (shared) return reconcile(shared, home);

  const saved = readJson(STORAGE_KEY, isStringArray);
  if (saved?.length) return reconcile(saved, home);

  // A first-run set that shows the point immediately: Kolkata's +05:30 puts its
  // hour ticks visibly off the grid of every row above it.
  return reconcile(
    ['America/Los_Angeles', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo'],
    home,
  );
}

export interface ZonesApi {
  zones: string[];
  home: string;
  add: (id: string) => void;
  remove: (id: string) => void;
  canAdd: boolean;
}

export function useZones(): ZonesApi {
  const home = useMemo(() => normalizeZone(detectHomeZone()) ?? 'UTC', []);
  const [zones, setZones] = useState<string[]>(() => initialZones(home));

  useEffect(() => {
    writeJson(STORAGE_KEY, zones);
  }, [zones]);

  const add = useCallback((id: string) => {
    const resolved = normalizeZone(id);
    if (!resolved) return;
    setZones((current) =>
      current.includes(resolved) || current.length >= MAX_ZONES
        ? current
        : [...current, resolved],
    );
  }, []);

  // The home zone is the frame of reference for every delta, so it stays.
  const remove = useCallback(
    (id: string) => {
      if (id === home) return;
      setZones((current) => current.filter((z) => z !== id));
    },
    [home],
  );

  return { zones, home, add, remove, canAdd: zones.length < MAX_ZONES };
}
