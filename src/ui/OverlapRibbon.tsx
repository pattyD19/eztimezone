import { useMemo } from 'react';
import { HOUR, formatClock, formatDate, wallAt } from '../time/format';
import { formatDuration, meetingWindows, nextMeetingWindow } from '../time/overlap';
import { useTimelineWindow, useVisibleSpan } from '../state/hooks';
import { useStripTransform } from '../state/useStripTransform';
import { useTimeline } from '../state/timelineContext';

export interface OverlapRibbonProps {
  zones: readonly string[];
  /** Window labels are written in the home zone, since that is the one you book in. */
  home: string;
  use24Hour: boolean;
}

/** Below this many pixels a window is too narrow to carry its own label. */
const LABEL_MIN_PX = 34;

export function OverlapRibbon({ zones, home, use24Hour }: OverlapRibbonProps) {
  const store = useTimeline();
  const win = useTimelineWindow();
  const contentRef = useStripTransform(win.anchor);

  const visible = useVisibleSpan();

  // Painted across the whole buffer so panning never reveals a bare ribbon...
  const windows = useMemo(
    () => meetingWindows(zones, win.anchor, win.end),
    [zones, win.anchor, win.end],
  );

  // ...but described against the visible span only. Counting the buffer would
  // announce "1 window" over an empty ribbon whenever the nearest one happens
  // to sit just off screen.
  const inView = useMemo(
    () => windows.filter((w) => w.end > visible.start && w.start < visible.end),
    [windows, visible.start, visible.end],
  );

  // Only consulted when nothing is in view, but computed alongside so the
  // ribbon never has to say something as unhelpful as "none".
  const upcoming = useMemo(
    () => (inView.length === 0 ? nextMeetingWindow(zones, visible.start) : null),
    [zones, inView.length, visible.start],
  );

  const scale = win.pxPerHour / HOUR;

  /** The full range in the home zone, for the hover title. */
  const describe = (start: number, end: number): string => {
    const from = formatClock(wallAt(home, start), use24Hour);
    const to = formatClock(wallAt(home, end), use24Hour);
    const day = formatDate(wallAt(home, start));
    const suffix = (c: typeof from): string => (c.meridiem ? ` ${c.meridiem}` : '');
    return `${day}, ${from.time.trim()}${suffix(from)} – ${to.time.trim()}${suffix(to)} your time`;
  };

  /**
   * The note carries the whole value of the feature when the ribbon is empty,
   * which on a weekend is most of the time. "None" is a dead end; the next
   * window, or an honest "never", is an answer.
   */
  function renderNote() {
    if (zones.length < 2) return <span className="ribbon-note">add a second zone</span>;

    if (inView.length > 0) {
      return (
        <span className="ribbon-note">
          {inView.length === 1 ? '1 window' : `${inView.length} windows`}
        </span>
      );
    }

    if (upcoming?.never) {
      return <span className="ribbon-note">these zones never overlap</span>;
    }

    if (upcoming?.window) {
      const { start, end } = upcoming.window;
      const wall = wallAt(home, start);
      const clock = formatClock(wall, use24Hour);
      return (
        <button
          className="ribbon-jump"
          onClick={() => store.setCentre(start + (end - start) / 2)}
          title={describe(start, end)}
        >
          next {formatDate(wall, true)} {clock.time.trim()}
          {clock.meridiem ? ` ${clock.meridiem}` : ''} &rarr;
        </button>
      );
    }

    return <span className="ribbon-note">none in this span</span>;
  }

  return (
    <div className="ribbon">
      <div className="ribbon-head">
        <span className="ribbon-title">Good to meet</span>
        {renderNote()}
      </div>
      <div className="ribbon-track">
        <div
          className="content"
          ref={contentRef}
          style={{ width: ((win.end - win.anchor) * win.pxPerHour) / HOUR }}
        >
          {windows.map((window) => {
            const width = (window.end - window.start) * scale;
            return (
              <span
                key={window.start}
                className="window"
                style={{ left: (window.start - win.anchor) * scale, width }}
                title={describe(window.start, window.end)}
              >
                {width >= LABEL_MIN_PX && (
                  <span className="window-label">
                    {formatDuration(window.end - window.start)}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
