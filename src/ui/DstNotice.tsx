import { useMemo } from 'react';
import { DAY, formatDate, gapLabel, wallAt } from '../time/format';
import {
  formatShift,
  shiftDirection,
  summarise,
  transitionsAcross,
  type TransitionSummary,
} from '../time/transitions';
import { zoneLabel } from '../time/zones';
import { useVisibleSpan } from '../state/hooks';

/**
 * How far ahead to warn.
 *
 * Warning only about what is on screen would be nearly useless: at the default
 * scale that is a single day, so you would learn about a change only by
 * happening to scroll onto it. A fortnight covers the horizon people actually
 * schedule over, at the cost of the notice being present for two weeks twice a
 * year — which is exactly when it is worth reading.
 */
const HORIZON_DAYS = 14;

export interface DstNoticeProps {
  zones: readonly string[];
  home: string;
}

/**
 * Warns that a daylight-saving change is coming.
 *
 * The strips are already correct across a transition. This exists because
 * correct is not the same as noticed: the mistake is agreeing a recurring time
 * and not spotting that the gap moves an hour in three weeks.
 */
export function DstNotice({ zones, home }: DstNoticeProps) {
  const visible = useVisibleSpan();

  const changes = useMemo(
    () =>
      transitionsAcross(zones, visible.start, visible.start + HORIZON_DAYS * DAY).map((t) =>
        summarise(t, home),
      ),
    [zones, home, visible.start],
  );

  if (changes.length === 0) return null;

  const [soonest, ...rest] = changes as [TransitionSummary, ...TransitionSummary[]];

  return (
    <p className="dst-notice" role="status">
      <span className="dst-badge">clock change</span>
      <span className="dst-text">{sentence(soonest)}</span>
      {rest.length > 0 && (
        <span className="dst-more" title={rest.map(sentence).join('\n')}>
          +{rest.length} more
        </span>
      )}
    </p>
  );
}

function sentence(change: TransitionSummary): string {
  // The date is the one in the zone that is changing, not the reader's. A
  // transition at 01:00 UTC on Sunday is still Saturday evening in New York,
  // and telling a New Yorker that "London changes on Saturday" is a date no
  // Londoner would recognise for their own clocks.
  const when = formatDate(wallAt(change.tz, change.at));
  const how = `${shiftDirection(change.shift)} ${formatShift(change.shift)}`;

  // When home itself moves, every gap on screen moves with it, so naming one
  // of them would be worse than naming none.
  if (change.isHome) {
    // change.tz === home here, so `when` is already the reader's own date.
    return `Your clocks go ${how} on ${when} — every gap below shifts.`;
  }

  return (
    `${zoneLabel(change.tz)} goes ${how} on ${when} — your gap changes from ` +
    `${gapLabel(change.deltaBefore ?? 0)} to ${gapLabel(change.deltaAfter ?? 0)}.`
  );
}
