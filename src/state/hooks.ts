import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTimeline } from './timelineContext';
import type { TimelineWindow } from './TimelineStore';

/** The painted window. Changes rarely, so re-rendering on it is cheap. */
export function useTimelineWindow(): TimelineWindow {
  const store = useTimeline();
  return useSyncExternalStore(store.subscribeWindow, store.getWindow, store.getWindow);
}

/** Whether the playhead is tracking real time. Drives the Now button. */
export function useFollowing(): boolean {
  const store = useTimeline();
  return useSyncExternalStore(store.subscribeChrome, store.getFollowing, store.getFollowing);
}

/**
 * The visible span, sampled rather than tracked continuously.
 *
 * Unlike the painted window this changes on every frame, so it is deliberately
 * coarse: updates are throttled, and ignored entirely until the span has moved
 * far enough to change anything a person would read. That keeps a component
 * which merely *describes* the view from re-rendering sixty times a second.
 */
export function useVisibleSpan(minimumShiftMs = 60_000): { start: number; end: number } {
  const store = useTimeline();
  const [span, setSpan] = useState(store.visibleSpan);

  useFrame(() => {
    const next = store.visibleSpan();
    setSpan((previous) => {
      const zoomed = next.end - next.start !== previous.end - previous.start;
      const moved = Math.abs(next.start - previous.start) >= minimumShiftMs;
      return zoomed || moved ? next : previous;
    });
  });

  return span;
}

/**
 * Run `callback` on every animation frame while the timeline is moving.
 *
 * The callback is held in a ref so that changing it does not resubscribe, and
 * so a stale closure never survives a re-render. It must only write to the DOM
 * -- calling setState here would defeat the entire point of the store.
 */
export function useFrame(callback: () => void): void {
  const store = useTimeline();
  const ref = useRef(callback);
  ref.current = callback;

  useEffect(() => store.subscribeFrame(() => ref.current()), [store]);
}
