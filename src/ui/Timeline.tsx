import { useCallback, useEffect, useRef } from 'react';
import { useFrame } from '../state/hooks';
import { useTimeline } from '../state/timelineContext';
import { useTimelineGestures } from '../state/useTimelineGestures';
import { OverlapRibbon } from './OverlapRibbon';
import { ZoneRow } from './ZoneRow';

export interface TimelineProps {
  zones: string[];
  home: string;
  use24Hour: boolean;
  onRemove: (tz: string) => void;
}

export function Timeline({ zones, home, use24Hour, onRemove }: TimelineProps) {
  const store = useTimeline();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const metricRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLDivElement>(null);

  useTimelineGestures({ surface: surfaceRef, metric: metricRef });

  // The strip width is the unit everything is measured in, so the store learns
  // it from the DOM rather than assuming a viewport.
  useEffect(() => {
    const el = rowsRef.current;
    if (!el) return;

    let first = true;
    const measure = (): void => {
      const width = el.clientWidth;
      if (!width) return;
      store.setWidth(width);
      if (first) {
        store.fitOneDay();
        first = false;
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [store]);

  const positionNow = useCallback(() => {
    const el = nowRef.current;
    if (!el) return;
    const x = store.xOf(Date.now());
    el.style.transform = `translateX(${x.toFixed(1)}px)`;
    // Hidden while the playhead is live, because the two would coincide.
    el.style.visibility =
      store.getFollowing() || x < -20 || x > store.getWidth() + 20 ? 'hidden' : '';
  }, [store]);

  useFrame(positionNow);
  useEffect(positionNow, [positionNow, zones]);

  return (
    <div className="stack" ref={surfaceRef}>
      <div className="rows" ref={rowsRef}>
        <OverlapRibbon zones={zones} home={home} use24Hour={use24Hour} />
        {zones.map((tz, i) => (
          <ZoneRow
            key={tz}
            tz={tz}
            home={home}
            isHome={i === 0}
            use24Hour={use24Hour}
            onRemove={onRemove}
            {...(i === 0 ? { trackRef: metricRef } : {})}
          />
        ))}
        <div className="nowline" ref={nowRef} aria-hidden="true" />
        <div className="playhead" aria-hidden="true" />
      </div>
    </div>
  );
}
