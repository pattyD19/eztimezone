import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { HOUR, deltaLabel, formatClock, formatDate, hourLabel, offsetAt, offsetLabel, wallFromOffset } from '../time/format';
import { buildStrip, labelInterval } from '../time/ticks';
import { formatSignedShift } from '../time/transitions';
import { zoneLabel } from '../time/zones';
import { useFrame, useTimelineWindow } from '../state/hooks';
import { useStripTransform } from '../state/useStripTransform';
import { useTimeline } from '../state/timelineContext';

interface StripProps {
  tz: string;
  anchor: number;
  end: number;
  pxPerHour: number;
  use24Hour: boolean;
}

/**
 * The painted contents of one strip. Memoised because this is the expensive
 * render in the app -- a few hundred nodes -- and it only needs to change when
 * the painted window moves, never on the frames in between.
 */
const Strip = memo(function Strip({ tz, anchor, end, pxPerHour, use24Hour }: StripProps) {
  const { ticks, bands, segments } = useMemo(
    () => buildStrip(tz, anchor, end),
    [tz, anchor, end],
  );
  const interval = labelInterval(pxPerHour);
  const scale = pxPerHour / HOUR;
  const x = (t: number): number => (t - anchor) * scale;

  return (
    <>
      {bands.map((band) => (
        <span
          key={`${band.kind}-${band.start}`}
          className={`band band--${band.kind}`}
          style={{ left: x(band.start), width: (band.end - band.start) * scale }}
        />
      ))}
      {/* Boundaries between constant-offset segments are daylight-saving changes.
          Usually there are none, so this renders nothing at all. */}
      {segments.slice(1).map((segment, i) => {
        const shift = segment.offset - segments[i]!.offset;
        return (
          <span key={`dst-${segment.start}`} className="dstmark" style={{ left: x(segment.start) }}>
            <span className="dstmark-chip">{formatSignedShift(shift)}</span>
          </span>
        );
      })}
      {ticks.map((tick) => {
        const left = x(tick.t);
        if (tick.dayStart) {
          return (
            <span key={tick.t}>
              <span className="dayline" style={{ left }} />
              <span className="daylabel" style={{ left }}>
                {formatDate(tick.wall)}
              </span>
            </span>
          );
        }
        const labelled = tick.hour % interval === 0;
        return (
          <span key={tick.t}>
            <span className={labelled ? 'tick tick--major' : 'tick'} style={{ left }} />
            {labelled && (
              <span className={`hourlabel hourlabel--${tick.hour < 12 ? 'am' : 'pm'}`} style={{ left }}>
                {hourLabel(tick.hour, use24Hour)}
              </span>
            )}
          </span>
        );
      })}
    </>
  );
});

export interface ZoneRowProps {
  tz: string;
  home: string;
  isHome: boolean;
  use24Hour: boolean;
  onRemove: (tz: string) => void;
  /** Set on one row only; its track is what the store measures against. */
  trackRef?: React.RefObject<HTMLDivElement | null>;
}

export function ZoneRow({ tz, home, isHome, use24Hour, onRemove, trackRef }: ZoneRowProps) {
  const store = useTimeline();
  const win = useTimelineWindow();

  const contentRef = useStripTransform(win.anchor);
  const trackEl = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const meridiemRef = useRef<HTMLSpanElement>(null);
  const dateRef = useRef<HTMLSpanElement>(null);
  const metaRef = useRef<HTMLSpanElement>(null);

  const paint = useCallback(() => {
    const instant = store.getCentre();
    const offset = offsetAt(tz, instant);
    const wall = wallFromOffset(instant, offset);
    const clock = formatClock(wall, use24Hour);

    if (timeRef.current) timeRef.current.textContent = clock.time;
    if (meridiemRef.current) {
      meridiemRef.current.textContent = clock.meridiem ?? '';
      meridiemRef.current.className = `meridiem meridiem--${clock.period}`;
      meridiemRef.current.style.display = clock.meridiem ? '' : 'none';
    }
    if (dateRef.current) dateRef.current.textContent = formatDate(wall, store.getWidth() < 360);
    if (metaRef.current) {
      const home_ = offsetAt(home, instant);
      metaRef.current.textContent = isHome
        ? offsetLabel(offset)
        : `${offsetLabel(offset)} · ${deltaLabel(offset, home_)}`;
    }
    if (trackEl.current) {
      trackEl.current.setAttribute(
        'aria-valuenow',
        String(Math.round(instant / 60_000)),
      );
      trackEl.current.setAttribute(
        'aria-valuetext',
        `${zoneLabel(tz)} ${clock.time.trim()}${clock.meridiem ? ` ${clock.meridiem}` : ''} on ${formatDate(wall)}`,
      );
    }
  }, [store, tz, home, isHome, use24Hour]);

  // Readouts are painted on every render as well as every frame, so a newly
  // added row is never blank for a beat.
  useLayoutEffect(paint);

  useFrame(paint);

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const step = e.shiftKey ? 24 * HOUR : HOUR;
    if (e.key === 'ArrowLeft') store.nudge(-step);
    else if (e.key === 'ArrowRight') store.nudge(step);
    else if (e.key === 'Home') store.goNow();
    else return;
    e.preventDefault();
  };

  const name = zoneLabel(tz);

  return (
    <div className={isHome ? 'row row--home' : 'row'}>
      <div className="rowhead">
        <span className="rowname">
          <span className="city">{name}</span>
          {isHome && <span className="youtag">you</span>}
          <span className="meta" ref={metaRef} />
        </span>
        <span className="readout">
          <span className="clock">
            <span className="time" ref={timeRef} />
            <span className="meridiem" ref={meridiemRef} />
          </span>
          <span className="date" ref={dateRef} />
        </span>
        {!isHome && (
          <button className="remove" onClick={() => onRemove(tz)} aria-label={`Remove ${name}`}>
            &times;
          </button>
        )}
      </div>
      <div
        className="track"
        ref={(node) => {
          trackEl.current = node;
          if (trackRef) trackRef.current = node;
        }}
        tabIndex={0}
        role="slider"
        aria-label={`${name} timeline`}
        aria-valuemin={Math.round((Date.now() - 14 * 86_400_000) / 60_000)}
        aria-valuemax={Math.round((Date.now() + 14 * 86_400_000) / 60_000)}
        onKeyDown={onKeyDown}
      >
        <div
          className="content"
          ref={contentRef}
          style={{ width: ((win.end - win.anchor) * win.pxPerHour) / HOUR }}
        >
          <Strip
            tz={tz}
            anchor={win.anchor}
            end={win.end}
            pxPerHour={win.pxPerHour}
            use24Hour={use24Hour}
          />
        </div>
      </div>
    </div>
  );
}
