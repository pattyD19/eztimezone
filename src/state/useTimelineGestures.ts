import { useEffect, type RefObject } from 'react';
import { useTimeline } from './timelineContext';

export interface GestureTargets {
  /** Element the listeners attach to; a drag anywhere inside it pans. */
  surface: RefObject<HTMLElement | null>;
  /** Element whose box defines x = 0 and the usable width. */
  metric: RefObject<HTMLElement | null>;
}

/** Ignore the tail of a gesture that stalled before release. */
const VELOCITY_WINDOW_MS = 220;

/**
 * Pointer, wheel and pinch handling for the timeline.
 *
 * Native scrolling is deliberately not used: the five strips share one instant,
 * so there is no scroll container whose position could be the source of truth,
 * and inertia has to be ours to control so it can settle onto a quarter hour.
 */
export function useTimelineGestures({ surface, metric }: GestureTargets): void {
  const store = useTimeline();

  useEffect(() => {
    const el = surface.current;
    if (!el) return;

    const active = new Map<number, number>(); // pointerId -> clientX
    let samples: { x: number; at: number }[] = [];
    let lastX = 0;
    let pinchDistance = 0;
    let pinchInstant = 0;
    let dragging = false;

    const originX = (): number => metric.current?.getBoundingClientRect().left ?? 0;
    const localX = (clientX: number): number => clientX - originX();

    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null;
      // Buttons and the search field own their own clicks.
      if (target?.closest('button, input, a')) return;

      active.set(e.pointerId, e.clientX);

      if (active.size === 1) {
        dragging = true;
        lastX = e.clientX;
        samples = [{ x: e.clientX, at: performance.now() }];
        el.classList.add('is-dragging');
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* capture is an optimisation, not a requirement */
        }
        store.beginDrag();
      } else if (active.size === 2) {
        const [a, b] = [...active.values()];
        pinchDistance = Math.abs((a ?? 0) - (b ?? 0));
        pinchInstant = store.instantAt(localX(((a ?? 0) + (b ?? 0)) / 2));
      }
    };

    const onPointerMove = (e: PointerEvent): void => {
      if (!active.has(e.pointerId)) return;
      active.set(e.pointerId, e.clientX);

      if (active.size >= 2) {
        const [a, b] = [...active.values()];
        const distance = Math.abs((a ?? 0) - (b ?? 0));
        if (pinchDistance > 8 && distance > 8) {
          const midpoint = localX(((a ?? 0) + (b ?? 0)) / 2);
          store.zoomBy(distance / pinchDistance, pinchInstant, midpoint);
          pinchDistance = distance;
        }
        return;
      }

      if (!dragging) return;
      store.panByPixels(e.clientX - lastX);
      lastX = e.clientX;

      const at = performance.now();
      samples.push({ x: e.clientX, at });
      samples = samples.filter((s) => at - s.at <= VELOCITY_WINDOW_MS);
    };

    const onPointerUp = (e: PointerEvent): void => {
      active.delete(e.pointerId);
      if (active.size > 0) {
        pinchDistance = 0;
        return;
      }
      if (!dragging) return;

      dragging = false;
      el.classList.remove('is-dragging');

      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed = first && last ? last.at - first.at : 0;
      store.endDrag(elapsed > 0 ? (last!.x - first!.x) / elapsed : 0);
      samples = [];
    };

    const onWheel = (e: WheelEvent): void => {
      // Trackpad pinch arrives as ctrl + vertical wheel.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const x = localX(e.clientX);
        store.zoomBy(1.0035 ** -e.deltaY, store.instantAt(x), x);
        return;
      }
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      store.panByPixels(-e.deltaX);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [store, surface, metric]);
}
