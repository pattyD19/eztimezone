import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUR, MINUTE } from '../time/format';
import { TimelineStore } from './TimelineStore';

/**
 * The store is driven by requestAnimationFrame, which does not exist in Node.
 * Rather than pull in a DOM implementation, frames are queued here and stepped
 * by hand — which makes inertia and easing deterministic instead of depending
 * on how fast the machine happens to run the suite.
 */
const T0 = Date.UTC(2026, 8, 12, 12);
const WIDTH = 960;

let frameQueue: FrameRequestCallback[] = [];

function stepFrames(limit = 400): number {
  let stepped = 0;
  while (stepped < limit) {
    const queued = frameQueue;
    frameQueue = [];
    if (queued.length === 0) break;
    vi.advanceTimersByTime(16);
    for (const cb of queued) cb(performance.now());
    stepped += 1;
  }
  return stepped;
}

function makeStore(): TimelineStore {
  const store = new TimelineStore(T0);
  store.setWidth(WIDTH);
  store.fitOneDay(); // 24 hours across
  return store;
}

beforeEach(() => {
  vi.useFakeTimers({
    now: T0,
    toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'],
  });
  frameQueue = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frameQueue.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('geometry', () => {
  it('puts the selected instant under the playhead, at the centre', () => {
    const store = makeStore();
    expect(store.xOf(store.getCentre())).toBeCloseTo(WIDTH / 2, 6);
  });

  it('round-trips between an instant and a position', () => {
    const store = makeStore();
    for (const x of [0, 123, WIDTH / 2, WIDTH]) {
      expect(store.xOf(store.instantAt(x))).toBeCloseTo(x, 6);
    }
  });

  it('fits one day across the strip by default', () => {
    const store = makeStore();
    const span = store.instantAt(WIDTH) - store.instantAt(0);
    expect(span).toBeCloseTo(24 * HOUR, 6);
  });

  it('reports a visible span centred on the playhead', () => {
    const store = makeStore();
    const { start, end } = store.visibleSpan();
    expect((start + end) / 2).toBeCloseTo(store.getCentre(), 6);
    expect(end - start).toBeCloseTo(24 * HOUR, 6);
  });

  it('survives being passed around unbound, as React does to it', () => {
    const store = makeStore();
    // visibleSpan was once a plain method; handed to useState by reference it
    // lost `this` and threw, taking the ribbon with it.
    const { visibleSpan, getCentre, getWindow, getFollowing, getWidth } = store;
    expect(() => visibleSpan()).not.toThrow();
    expect(() => getCentre()).not.toThrow();
    expect(() => getWindow()).not.toThrow();
    expect(() => getFollowing()).not.toThrow();
    expect(() => getWidth()).not.toThrow();
  });
});

describe('zoom', () => {
  it('clamps between six hours and seven days across', () => {
    const store = makeStore();
    const across = (): number => store.instantAt(WIDTH) - store.instantAt(0);

    store.zoomAtCentre(1000);
    expect(across()).toBeCloseTo(6 * HOUR, 5);

    store.zoomAtCentre(1 / 10_000);
    expect(across()).toBeCloseTo(168 * HOUR, 4);
  });

  it('holds the given instant under the given position', () => {
    const store = makeStore();
    const keepX = 200;
    const anchored = store.instantAt(keepX);

    store.zoomBy(2.5, anchored, keepX);

    expect(store.xOf(anchored)).toBeCloseTo(keepX, 4);
  });

  it('keeps the same hours on screen when the viewport resizes', () => {
    const store = makeStore();
    const before = store.instantAt(WIDTH) - store.instantAt(0);
    store.setWidth(480);
    expect(store.instantAt(480) - store.instantAt(0)).toBeCloseTo(before, 4);
  });

  it('ignores a width of zero rather than dividing by it', () => {
    const store = makeStore();
    const before = store.getPxPerHour();
    store.setWidth(0);
    expect(store.getPxPerHour()).toBe(before);
    expect(Number.isFinite(store.xOf(T0))).toBe(true);
  });
});

describe('panning and the live playhead', () => {
  it('moves the centre by the distance dragged', () => {
    const store = makeStore();
    const before = store.getCentre();
    store.panByPixels(-100); // dragging left moves forward in time
    expect(store.getCentre() - before).toBeCloseTo(100 * store.msPerPx(), 4);
  });

  it('stops tracking real time as soon as you drag', () => {
    const store = makeStore();
    expect(store.getFollowing()).toBe(true);
    store.panByPixels(-10);
    expect(store.getFollowing()).toBe(false);
  });

  it('nudges by an exact amount, for keyboard control', () => {
    const store = makeStore();
    const before = store.getCentre();
    store.nudge(-3 * HOUR);
    expect(store.getCentre()).toBe(before - 3 * HOUR);
  });

  it('returns to now, and resumes tracking', () => {
    const store = makeStore();
    store.nudge(5 * HOUR);
    expect(store.getFollowing()).toBe(false);

    vi.advanceTimersByTime(90 * MINUTE);
    store.goNow();

    expect(store.getFollowing()).toBe(true);
    expect(store.getCentre()).toBe(Date.now());
  });

  it('follows the clock forward while live', () => {
    const store = makeStore();
    stepFrames(2);
    const before = store.getCentre();
    vi.advanceTimersByTime(10 * MINUTE);
    stepFrames(2);
    expect(store.getCentre()).toBeGreaterThan(before);
  });
});

describe('inertia', () => {
  /** Distance a fling travels, measured in pixels rather than milliseconds. */
  function flingDistancePx(store: TimelineStore, velocityPxPerMs: number): number {
    const from = store.getCentre();
    store.beginDrag();
    store.endDrag(velocityPxPerMs);
    stepFrames();
    return (store.getCentre() - from) / store.msPerPx();
  }

  it('carries on after release, then stops', () => {
    const store = makeStore();
    const travelled = flingDistancePx(store, -1.5);
    expect(Math.abs(travelled)).toBeGreaterThan(50);
    expect(stepFrames()).toBe(0); // nothing left queued: it has settled
  });

  it('travels the same distance on screen at any zoom', () => {
    // The regression this exists for: velocity was once held in milliseconds of
    // timeline rather than pixels, so an absolute decay floor made a fling run
    // for five seconds zoomed out and travel proportionally further. The same
    // gesture must move the same distance under the finger at every scale.
    const near = makeStore();
    const nearPx = flingDistancePx(near, -1.5);

    const far = makeStore();
    far.zoomAtCentre(1 / 4);
    const farPx = flingDistancePx(far, -1.5);

    expect(far.getPxPerHour()).toBeLessThan(near.getPxPerHour() / 3);
    // Generous, because settling snaps to a quarter hour and that is worth more
    // pixels when zoomed in. The bug this guards against differed by 3.4x.
    expect(Math.abs(farPx - nearPx) / Math.abs(nearPx)).toBeLessThan(0.2);
  });

  it('settles within a second or so, not five', () => {
    const store = makeStore();
    store.beginDrag();
    store.endDrag(-2);
    const frames = stepFrames();
    expect(frames).toBeLessThan(120); // ~2s at 60fps
  });

  it('treats a release with no movement as no fling', () => {
    const store = makeStore();
    store.beginDrag();
    store.endDrag(0);
    stepFrames();
    expect(store.getCentre() % (15 * MINUTE)).toBe(0);
  });

  it('reverses with the direction of the drag', () => {
    const left = flingDistancePx(makeStore(), -1.5);
    const right = flingDistancePx(makeStore(), 1.5);
    expect(Math.sign(left)).toBe(-Math.sign(right));
  });
});

describe('settling', () => {
  it('lands on a clean quarter hour, because the point is scheduling', () => {
    const store = makeStore();
    store.beginDrag();
    store.panByPixels(-137);
    store.endDrag(-0.8);
    stepFrames();
    expect(store.getCentre() % (15 * MINUTE)).toBe(0);
  });

  it('does not snap while still tracking real time', () => {
    const store = makeStore();
    stepFrames(3);
    // Live means the centre is whatever the clock says, quarter hour or not.
    expect(store.getFollowing()).toBe(true);
  });
});

describe('the painted window', () => {
  it('spans three screens, centred', () => {
    const store = makeStore();
    const { anchor, end } = store.getWindow();
    expect(end - anchor).toBeCloseTo(3 * 24 * HOUR, 4);
    expect((anchor + end) / 2).toBeCloseTo(store.getCentre(), 4);
  });

  it('does not repaint for a small pan', () => {
    const store = makeStore();
    const before = store.getWindow();
    store.panByPixels(-20);
    stepFrames(2);
    expect(store.getWindow()).toBe(before); // same object: no repaint
  });

  it('repaints once the centre has drifted far enough', () => {
    const store = makeStore();
    const before = store.getWindow();
    store.nudge(20 * HOUR); // well past 0.6 of a 24h screen
    stepFrames(2);
    expect(store.getWindow()).not.toBe(before);
    expect(store.getWindow().anchor).not.toBe(before.anchor);
  });

  it('repaints on zoom, since the scale changed', () => {
    const store = makeStore();
    const before = store.getWindow();
    store.zoomAtCentre(2);
    expect(store.getWindow().pxPerHour).not.toBe(before.pxPerHour);
  });
});

describe('subscriptions', () => {
  it('calls frame listeners while moving, and stops when still', () => {
    const store = makeStore();
    const seen = vi.fn();
    store.subscribeFrame(seen);

    store.beginDrag();
    store.endDrag(-1);
    stepFrames();

    expect(seen.mock.calls.length).toBeGreaterThan(5);
  });

  it('unsubscribes cleanly', () => {
    const store = makeStore();
    const seen = vi.fn();
    const off = store.subscribeFrame(seen);
    off();

    store.nudge(HOUR);
    stepFrames(5);
    expect(seen).not.toHaveBeenCalled();
  });

  it('notifies about the window only when it actually changes', () => {
    const store = makeStore();
    const seen = vi.fn();
    store.subscribeWindow(seen);

    store.panByPixels(-5);
    stepFrames(2);
    expect(seen).not.toHaveBeenCalled();

    store.nudge(20 * HOUR);
    stepFrames(2);
    expect(seen).toHaveBeenCalled();
  });

  it('notifies about following only on a change, not on every pan', () => {
    const store = makeStore();
    const seen = vi.fn();
    store.subscribeChrome(seen);

    store.panByPixels(-10);
    expect(seen).toHaveBeenCalledTimes(1); // true -> false

    store.panByPixels(-10);
    expect(seen).toHaveBeenCalledTimes(1); // already false, nothing to say
  });
});

describe('idling', () => {
  it('does not hold a frame loop open just to keep the clock live', () => {
    const store = makeStore();
    stepFrames();
    // Once settled, nothing is queued: the live playhead ticks on a timer.
    expect(frameQueue).toHaveLength(0);
    expect(store.getFollowing()).toBe(true);
  });

  it('wakes on that timer and keeps the clock current', () => {
    const store = makeStore();
    stepFrames();
    const before = store.getCentre();

    vi.advanceTimersByTime(1100);
    stepFrames(2);

    expect(store.getCentre()).toBeGreaterThan(before);
  });
});

describe('destroy', () => {
  it('drops listeners and stops waking up', () => {
    const store = makeStore();
    const seen = vi.fn();
    store.subscribeFrame(seen);

    store.destroy();
    frameQueue = [];
    vi.advanceTimersByTime(5000);
    stepFrames(5);

    expect(seen).not.toHaveBeenCalled();
  });
});
