/**
 * The zone catalogue and its search.
 *
 * `Intl.supportedValuesOf('timeZone')` gives the full IANA list from the
 * browser's own ICU data, so this ships no zone data of its own. Two wrinkles
 * make that list harder to use than it looks:
 *
 *  1. **Spelling drifts between runtimes.** Older ICU treats the legacy names
 *     as canonical (`Asia/Calcutta`, `Europe/Kiev`) and newer ICU the modern
 *     ones (`Asia/Kolkata`, `Europe/Kyiv`). Both accept either spelling as
 *     *input*, so a lookup table keyed on one vintage silently matches nothing
 *     on the other. `resolvedOptions().timeZone` normalises any accepted
 *     spelling onto whichever form the current runtime prefers, which makes it
 *     a stable key on both -- so the tables below are written in the modern
 *     spelling and indexed through the runtime's own answer.
 *
 *  2. **`UTC` is missing** from the list on some runtimes even though it is
 *     perfectly valid to format with, so it is added back explicitly.
 *
 * The alias table exists because zone ids are not what people type: nobody
 * searches for "Asia/Kolkata" when they mean Bangalore.
 */

import { offsetAt } from './format';

const FALLBACK_ZONES = [
  'UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Africa/Lagos', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata',
  'Asia/Kathmandu', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo',
  'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland',
];

/**
 * Map any spelling this runtime accepts onto the one it considers canonical,
 * or `null` if it will not accept the zone at all. Use this on anything
 * arriving from outside the app -- a saved list, a shared link -- so a link
 * built on one runtime still opens on another.
 */
export function normalizeZone(id: string): string | null {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: id }).resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function loadZoneIds(): string[] {
  let ids: string[];
  try {
    const supported = Intl.supportedValuesOf?.('timeZone');
    ids = supported && supported.length ? [...supported] : [...FALLBACK_ZONES];
  } catch {
    ids = [...FALLBACK_ZONES];
  }
  if (!ids.includes('UTC') && normalizeZone('UTC')) ids.push('UTC');
  return [...new Set(ids)].sort();
}

export const ZONE_IDS: readonly string[] = loadZoneIds();

/**
 * Extra search terms per zone: city names the id does not contain, common
 * abbreviations, and alternate spellings.
 */
export const ALIASES: Readonly<Record<string, string>> = {
  'America/New_York': 'nyc new york manhattan boston miami atlanta east coast et est edt',
  'America/Chicago': 'chicago dallas houston austin texas central ct cst',
  'America/Denver': 'denver colorado salt lake mountain mt mst',
  'America/Phoenix': 'phoenix arizona',
  'America/Los_Angeles':
    'la los angeles san francisco sf bay area seattle portland san diego pacific pt pst pdt west coast',
  'America/Toronto': 'toronto ottawa canada',
  'America/Vancouver': 'vancouver',
  'America/Mexico_City': 'mexico cdmx',
  'America/Sao_Paulo': 'sao paulo brazil rio brasilia',
  'America/Bogota': 'bogota colombia',
  'America/Argentina/Buenos_Aires': 'buenos aires argentina',
  'Europe/London': 'london uk britain england gmt bst edinburgh manchester',
  'Europe/Dublin': 'dublin ireland',
  'Europe/Lisbon': 'lisbon portugal',
  'Europe/Madrid': 'madrid spain barcelona',
  'Europe/Paris': 'paris france',
  'Europe/Berlin': 'berlin germany munich frankfurt',
  'Europe/Amsterdam': 'amsterdam netherlands holland',
  'Europe/Zurich': 'zurich switzerland geneva',
  'Europe/Stockholm': 'stockholm sweden',
  'Europe/Warsaw': 'warsaw poland krakow',
  'Europe/Rome': 'rome italy milan',
  'Europe/Athens': 'athens greece',
  'Europe/Istanbul': 'istanbul turkey',
  'Europe/Moscow': 'moscow russia',
  'Europe/Kyiv': 'kyiv kiev ukraine',
  'Africa/Cairo': 'cairo egypt',
  'Africa/Lagos': 'lagos nigeria',
  'Africa/Nairobi': 'nairobi kenya',
  'Africa/Johannesburg': 'johannesburg south africa cape town jhb',
  'Asia/Jerusalem': 'tel aviv israel jerusalem',
  'Asia/Dubai': 'dubai uae abu dhabi emirates',
  'Asia/Riyadh': 'riyadh saudi',
  'Asia/Karachi': 'karachi pakistan lahore islamabad',
  'Asia/Kolkata': 'india mumbai bombay delhi bangalore bengaluru hyderabad chennai pune calcutta ist',
  'Asia/Kathmandu': 'kathmandu nepal',
  'Asia/Dhaka': 'dhaka bangladesh',
  'Asia/Bangkok': 'bangkok thailand vietnam hanoi jakarta',
  'Asia/Singapore': 'singapore malaysia kuala lumpur',
  'Asia/Hong_Kong': 'hong kong hk',
  'Asia/Shanghai': 'china beijing shanghai shenzhen guangzhou',
  'Asia/Taipei': 'taipei taiwan',
  'Asia/Manila': 'manila philippines',
  'Asia/Seoul': 'seoul korea',
  'Asia/Tokyo': 'tokyo japan osaka kyoto jst',
  'Australia/Perth': 'perth western australia',
  'Australia/Brisbane': 'brisbane queensland',
  'Australia/Adelaide': 'adelaide',
  'Australia/Sydney': 'sydney melbourne australia canberra aest',
  'Pacific/Auckland': 'auckland new zealand nz wellington',
  'Pacific/Honolulu': 'honolulu hawaii',
  UTC: 'utc gmt zulu universal',
};

/**
 * Search terms and preferred display names, both indexed by the id spelling
 * this runtime actually uses. Built once at load from the modern-spelling
 * tables above.
 */
const searchTerms = new Map<string, string>();
const displayNames = new Map<string, string>();

function labelFromId(id: string): string {
  const parts = id.split('/');
  return (parts[parts.length - 1] ?? id).replace(/_/g, ' ');
}

for (const [modernId, terms] of Object.entries(ALIASES)) {
  const key = normalizeZone(modernId);
  if (!key) continue;
  searchTerms.set(key, terms);
  // Where the runtime prefers the legacy spelling, still show the modern city
  // name -- nobody wants to read "Calcutta" or "Kiev" in 2026.
  if (key !== modernId) displayNames.set(key, labelFromId(modernId));
}

/** `"America/Argentina/Buenos_Aires"` -> `"Buenos Aires"`. */
export function zoneLabel(id: string): string {
  return displayNames.get(id) ?? labelFromId(id);
}

export function zoneRegion(id: string): string {
  const parts = id.split('/');
  return parts.length > 1 ? (parts[0] ?? '').replace(/_/g, ' ') : 'Universal';
}

/**
 * Rank matches so the obvious answer wins: exact city name, then names and
 * aliases that start with the query, then anything containing it. The raw id
 * is searched too, so a legacy spelling the user remembers still finds its
 * zone.
 */
export function searchZones(query: string, limit = 40): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exact: string[] = [];
  const prefix: string[] = [];
  const contains: string[] = [];

  for (const id of ZONE_IDS) {
    const name = zoneLabel(id).toLowerCase();
    const alias = searchTerms.get(id) ?? '';
    if (name === q) exact.push(id);
    else if (name.startsWith(q) || ` ${alias}`.startsWith(` ${q}`)) prefix.push(id);
    else if (name.includes(q) || alias.includes(q) || id.toLowerCase().includes(q)) {
      contains.push(id);
    }
  }
  return [...exact, ...prefix, ...contains].slice(0, limit);
}

export function detectHomeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      offsetAt(tz, Date.now());
      return tz;
    }
  } catch {
    /* fall through */
  }
  return 'UTC';
}
