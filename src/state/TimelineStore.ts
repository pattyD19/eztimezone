/**
 * The one piece of shared state: which instant is under the playhead, and how
 * many pixels an hour is worth.
 *
 * There is deliberately no per-row scroll position. Every strip renders the
 * same absolute time axis labelled in its own zone, so "all five move together"
 * is not a feature to implement -- it is what falls out of five views sharing
 * one number.
 *
 * This is a plain observable rather than React state because it changes on
 * every animation frame of a drag. Re-rendering five rows of ~200 ticks at
 * 60fps is not viable; instead React owns the structure and subscribers write
 * `transform` and `textContent` directly. Rebuilds of the tick geometry are
 * rare, and those *do* go through React.
 */

import { HOUR, MINUTE } from '../time/format';

type Listener = () => void;

/** The span of time currently painted into each strip, wider than the viewport. */
export interface TimelineWindow {
  /** Instant sitting at x = 0 of the strip content. */
  anchor: number;
  end: number;
  pxPerHour: number;
}

/** Narrowest and widest views, in hours across the screen. */
const MIN_HOURS_ACROSS = 6;
const MAX_HOURS_ACROSS = 168;

/** Strips are painted this many screens wide so panning rarely repaints. */
const BUFFER_SCREENS = 3;

/** Repaint once the centre has drifted this fraction of a screen from the last paint. */
const REBUILD_DRIFT = 0.6;

/** Settle onto a clean quarter-hour, because the use case is scheduling. */
const SNAP_TO = 15 * MINUTE;
const SNAP_MS = 180;

/**
 * Inertia is tracked in **pixels** per millisecond, not milliseconds of
 * timeline per millisecond. Timeline units scale with zoom, so an absolute
 * floor expressed in them means a fling decays in a fraction of a second when
 * zoomed in and runs for five seconds when zoomed out -- long enough that the
 * quarter-hour snap looks like it simply never happens. In pixels the feel is
 * the same at every scale: a flick travels the same distance on screen.
 */
const INERTIA_FLOOR_PX_PER_MS = 0.02;
const INERTIA_DECAY = 0.94;

/** While the playhead is live but nothing is moving, tick at this interval. */
const IDLE_TICK_MS = 1000;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export class TimelineStore {
  private centre: number;
  private pxPerHour = 30;
  private width = 600;
  private live = true;
  private dragging = false;

  private window: TimelineWindow;
  private paintedCentre: number;

  /** Pixels per millisecond; positive means content moving rightward. */
  private velocity = 0;
  private snap: { from: number; to: number; startedAt: number } | null = null;

  private rafId = 0;
  private idleTimer = 0;
  private frameListeners = new Set<Listener>();
  private windowListeners = new Set<Listener>();
  private chromeListeners = new Set<Listener>();

  constructor(now: number = Date.now()) {
    this.centre = now;
    this.paintedCentre = now;
    this.window = this.computeWindow();
  }

  // ---- geometry -------------------------------------------------------

  /** Screen x for an instant, relative to the left edge of a strip. */
  xOf(instant: number): number {
    return ((instant - this.centre) * this.pxPerHour) / HOUR + this.width / 2;
  }

  /** The instant under a given x, relative to the left edge of a strip. */
  instantAt(x: number): number {
    return this.centre + (x - this.width / 2) * this.msPerPx();
  }

  msPerPx(): number {
    return HOUR / this.pxPerHour;
  }

  /**
   * The span actually on screen, as opposed to the wider span that is painted.
   * Anything reported to the user as "in view" has to be measured against this
   * one, or it will describe strips they cannot see.
   */
  visibleSpan = (): { start: number; end: number } => {
    const half = this.screenMs() / 2;
    return { start: this.centre - half, end: this.centre + half };
  };

  private screenMs(): number {
    return (this.width * HOUR) / this.pxPerHour;
  }

  private computeWindow(): TimelineWindow {
    const span = this.screenMs() * BUFFER_SCREENS;
    return {
      anchor: this.centre - span / 2,
      end: this.centre + span / 2,
      pxPerHour: this.pxPerHour,
    };
  }

  // ---- reads ----------------------------------------------------------

  getCentre = (): number => this.centre;
  getWindow = (): TimelineWindow => this.window;
  getFollowing = (): boolean => this.live;
  getPxPerHour = (): number => this.pxPerHour;
  getWidth = (): number => this.width;

  // ---- subscriptions --------------------------------------------------

  /** Runs every animation frame. For direct DOM writes only -- never setState. */
  subscribeFrame = (fn: Listener): (() => void) => {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  };

  /** Runs when the painted window changes, which is when React must re-render. */
  subscribeWindow = (fn: Listener): (() => void) => {
    this.windowListeners.add(fn);
    return () => this.windowListeners.delete(fn);
  };

  /** Runs when toolbar-visible state changes. */
  subscribeChrome = (fn: Listener): (() => void) => {
    this.chromeListeners.add(fn);
    return () => this.chromeListeners.delete(fn);
  };

  // ---- commands -------------------------------------------------------

  setWidth(width: number): void {
    if (width <= 0 || width === this.width) return;
    const previous = this.width;
    this.width = width;
    // Keep the same number of hours on screen when the viewport resizes.
    this.pxPerHour = this.clampZoom((this.pxPerHour * width) / previous);
    this.repaint();
    this.requestFrame();
  }

  /** Initial scale: one day across the strip. */
  fitOneDay(): void {
    this.pxPerHour = this.clampZoom(this.width / 24);
    this.repaint();
    this.requestFrame();
  }

  setCentre(instant: number, options: { follow?: boolean } = {}): void {
    this.centre = instant;
    this.setFollowing(options.follow ?? false);
    this.velocity = 0;
    this.snap = null;
    this.requestFrame();
  }

  /** Pan by a pixel delta, as produced by a drag or a horizontal wheel. */
  panByPixels(dx: number): void {
    this.centre -= dx * this.msPerPx();
    this.setFollowing(false);
    this.requestFrame();
  }

  /** Step the playhead by a fixed amount, for keyboard control. */
  nudge(ms: number): void {
    this.centre += ms;
    this.setFollowing(false);
    this.velocity = 0;
    this.snap = null;
    this.requestFrame();
  }

  goNow(): void {
    this.velocity = 0;
    this.snap = null;
    this.centre = Date.now();
    this.setFollowing(true);
    this.requestFrame();
  }

  /**
   * Scale by `factor`, holding `keepInstant` pinned at `keepX`. That is what
   * makes pinch feel anchored to the fingers rather than to the screen centre.
   */
  zoomBy(factor: number, keepInstant: number, keepX: number): void {
    const next = this.clampZoom(this.pxPerHour * factor);
    if (next === this.pxPerHour) return;
    this.pxPerHour = next;
    this.centre = keepInstant - (keepX - this.width / 2) * this.msPerPx();
    this.setFollowing(false);
    this.repaint();
    this.requestFrame();
  }

  zoomAtCentre(factor: number): void {
    this.zoomBy(factor, this.centre, this.width / 2);
  }

  private clampZoom(pxPerHour: number): number {
    const min = this.width / MAX_HOURS_ACROSS;
    const max = this.width / MIN_HOURS_ACROSS;
    return Math.max(min, Math.min(max, pxPerHour));
  }

  // ---- drag lifecycle -------------------------------------------------

  beginDrag(): void {
    this.dragging = true;
    this.velocity = 0;
    this.snap = null;
    this.setFollowing(false);
    this.requestFrame();
  }

  /** @param velocityPxPerMs pointer velocity at release; positive means rightward. */
  endDrag(velocityPxPerMs: number): void {
    this.dragging = false;
    this.velocity = velocityPxPerMs;
    if (Math.abs(this.velocity) < INERTIA_FLOOR_PX_PER_MS) {
      this.velocity = 0;
      this.beginSnap();
    }
    this.requestFrame();
  }

  private beginSnap(): void {
    const target = Math.round(this.centre / SNAP_TO) * SNAP_TO;
    if (target === this.centre) return;
    if (prefersReducedMotion()) {
      this.centre = target;
      return;
    }
    this.snap = { from: this.centre, to: target, startedAt: performance.now() };
  }

  // ---- the loop -------------------------------------------------------

  requestFrame(): void {
    if (!this.rafId) this.rafId = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    this.rafId = 0;

    if (this.live && !this.dragging) this.centre = Date.now();
    if (!this.dragging) this.advance();
    this.repaintIfDrifted();

    for (const fn of this.frameListeners) fn();

    if (this.isBusy()) this.requestFrame();
    else if (this.live) this.scheduleIdleTick();
  };

  private advance(): void {
    if (this.snap) {
      const k = Math.min(1, (performance.now() - this.snap.startedAt) / SNAP_MS);
      const eased = 1 - (1 - k) ** 3;
      this.centre = this.snap.from + (this.snap.to - this.snap.from) * eased;
      if (k >= 1) this.snap = null;
      return;
    }
    if (Math.abs(this.velocity) > INERTIA_FLOOR_PX_PER_MS) {
      this.centre -= this.velocity * 16 * this.msPerPx();
      this.velocity *= INERTIA_DECAY;
      if (Math.abs(this.velocity) <= INERTIA_FLOOR_PX_PER_MS) {
        this.velocity = 0;
        this.beginSnap();
      }
    }
  }

  /**
   * Whether anything is actually animating. Deliberately excludes `live`: a
   * playhead tracking real time needs one tick a second, not sixty, and an
   * rAF loop that never stops is a battery leak on a page people leave open.
   */
  private isBusy(): boolean {
    return (
      this.dragging || this.snap !== null || Math.abs(this.velocity) > INERTIA_FLOOR_PX_PER_MS
    );
  }

  private scheduleIdleTick(): void {
    if (this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = 0;
      this.requestFrame();
    }, IDLE_TICK_MS);
  }

  private repaintIfDrifted(): void {
    if (Math.abs(this.centre - this.paintedCentre) > this.screenMs() * REBUILD_DRIFT) {
      this.repaint();
    }
  }

  private repaint(): void {
    this.window = this.computeWindow();
    this.paintedCentre = this.centre;
    for (const fn of this.windowListeners) fn();
  }

  private setFollowing(live: boolean): void {
    if (this.live === live) return;
    this.live = live;
    for (const fn of this.chromeListeners) fn();
  }

  destroy(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.rafId = 0;
    this.idleTimer = 0;
    this.frameListeners.clear();
    this.windowListeners.clear();
    this.chromeListeners.clear();
  }
}
