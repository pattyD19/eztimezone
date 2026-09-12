import { useCallback, useLayoutEffect, useRef } from 'react';
import { useFrame } from './hooks';
import { useTimeline } from './timelineContext';

/**
 * Keeps a strip's content positioned against the shared instant.
 *
 * The subtlety is which anchor to measure from. When the painted window moves,
 * the store's anchor changes one frame before React commits the new contents,
 * so positioning against the store would briefly place fresh ticks at the old
 * offset. Positioning against the anchor the DOM currently *reflects* — and
 * updating that in a layout effect, synchronously after commit and before
 * paint — makes the seam impossible.
 *
 * Shared by the zone strips and the overlap ribbon so they cannot drift apart
 * by a pixel.
 */
export function useStripTransform(anchor: number) {
  const store = useTimeline();
  const ref = useRef<HTMLDivElement>(null);
  const renderedAnchor = useRef(anchor);

  const apply = useCallback(() => {
    const el = ref.current;
    if (el) {
      el.style.transform = `translate3d(${store.xOf(renderedAnchor.current).toFixed(2)}px, 0, 0)`;
    }
  }, [store]);

  useLayoutEffect(() => {
    renderedAnchor.current = anchor;
    apply();
  });

  useFrame(apply);

  return ref;
}
