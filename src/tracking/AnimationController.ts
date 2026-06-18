// ----------------------------------------------------------------
// Shared animation controller.
//
// ONE requestAnimationFrame chain drives every tracked vehicle —
// per-vehicle loops would multiply scheduler overhead and drift out
// of phase. Subscribers receive (deltaTimeSeconds, nowMs) each frame.
//
// Properties:
//   • Delta-time based: movement is frame-rate independent (60/90/120 Hz).
//   • Self-managing: the loop starts with the first subscriber and stops
//     with the last — no idle rAF churn.
//   • Pausable: the React layer pauses it when the app is backgrounded
//     (AppState — React Native's equivalent of `visibilitychange`) and
//     the first resumed frame re-bases its clock so a multi-second gap
//     never lands in one giant delta-time spike.
//   • Spike-clamped: deltas are capped at MAX_FRAME_DELTA_S as a second
//     line of defense (GC pauses, JS-thread stalls).
//
// setInterval() is deliberately not used: it is not synchronized with
// the display refresh and produces visible beat-frequency stutter.
// ----------------------------------------------------------------

export type FrameCallback = (deltaTimeSeconds: number, nowMs: number) => void;

/** Largest delta time a single frame may report, in seconds. */
const MAX_FRAME_DELTA_S = 0.25;

type RafFn = (cb: (time: number) => void) => number;
type CancelRafFn = (handle: number) => void;

/** Monotonic clock shared by the controller and the trackers. */
export function monotonicNow(): number {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

export class AnimationController {
  private readonly callbacks = new Set<FrameCallback>();
  private readonly raf: RafFn;
  private readonly cancelRaf: CancelRafFn;

  private rafHandle: number | null = null;
  private lastFrameTime: number | null = null;
  private paused = false;

  /** rAF is injectable so the controller can be driven manually in tests. */
  constructor(raf?: RafFn, cancelRaf?: CancelRafFn) {
    this.raf = raf ?? ((cb) => requestAnimationFrame(cb));
    this.cancelRaf = cancelRaf ?? ((handle) => cancelAnimationFrame(handle));
  }

  /**
   * Registers a per-frame callback; starts the loop if it was idle.
   * @returns An unsubscribe function.
   */
  add(callback: FrameCallback): () => void {
    this.callbacks.add(callback);
    this.startIfNeeded();
    return () => this.remove(callback);
  }

  remove(callback: FrameCallback): void {
    this.callbacks.delete(callback);
    if (this.callbacks.size === 0) this.stop();
  }

  /** Suspends the loop (app backgrounded). Subscriptions are kept. */
  pause(): void {
    this.paused = true;
    this.stop();
  }

  /** Resumes after pause(); the clock is re-based to avoid a delta spike. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.startIfNeeded();
  }

  get isRunning(): boolean {
    return this.rafHandle !== null;
  }

  get subscriberCount(): number {
    return this.callbacks.size;
  }

  private startIfNeeded(): void {
    if (this.rafHandle !== null || this.paused || this.callbacks.size === 0)
      return;
    this.lastFrameTime = null; // re-base the clock on the next frame
    this.rafHandle = this.raf(this.tick);
  }

  private stop(): void {
    if (this.rafHandle !== null) {
      this.cancelRaf(this.rafHandle);
      this.rafHandle = null;
    }
    this.lastFrameTime = null;
  }

  private tick = (frameTime: number): void => {
    this.rafHandle = null;

    // First frame after (re)start: establish the clock, emit a zero delta.
    const last = this.lastFrameTime;
    this.lastFrameTime = frameTime;
    const deltaSeconds =
      last === null
        ? 0
        : Math.min((frameTime - last) / 1000, MAX_FRAME_DELTA_S);

    for (const callback of this.callbacks) {
      callback(deltaSeconds, frameTime);
    }

    if (this.callbacks.size > 0 && !this.paused) {
      this.rafHandle = this.raf(this.tick);
    }
  };
}

/** The app-wide shared controller — all vehicles ride this one loop. */
export const sharedAnimationController = new AnimationController();
