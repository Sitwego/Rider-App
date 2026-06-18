// ----------------------------------------------------------------
// Interpolation engine.
//
// Computes displayed route progress between two GPS updates as a
// CONTINUOUS function of time — evaluated fresh every animation
// frame, never pre-generated as a queue of fixed-step positions
// (a queue would assume a fixed frame rate and break delta-time
// animation on 90/120 Hz displays).
//
// The output is 1-D progress (meters); converting it back through
// progressToLatLng() is what makes the marker follow curved road
// geometry instead of cutting straight lines between fixes.
// ----------------------------------------------------------------

import { clamp } from "./geo";

export type EasingFn = (t: number) => number;

export const Easing = {
  /**
   * Default. Constant velocity within a segment — segments chain every
   * ~2 s, and easing at every joint reads as pulsing speed changes.
   */
  linear: ((t) => t) as EasingFn,
  /** Gentle ease-out; useful for one-shot moves (e.g. initial placement). */
  easeOutQuad: ((t) => t * (2 - t)) as EasingFn,
  /** Symmetric ease; useful for camera-style glides, not chained segments. */
  easeInOutQuad: ((t) =>
    t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t) as EasingFn,
} as const;

/**
 * Displayed progress at `elapsedMs` into a segment animating
 * startProgress → targetProgress over durationMs.
 *
 * Clamps to the target once elapsed ≥ duration (the caller switches to
 * prediction at that point).
 */
export function getDisplayedProgress(
  startProgress: number,
  targetProgress: number,
  elapsedMs: number,
  durationMs: number,
  easing: EasingFn = Easing.linear,
): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return targetProgress;
  const fraction = clamp(elapsedMs / durationMs, 0, 1);
  return startProgress + (targetProgress - startProgress) * easing(fraction);
}
