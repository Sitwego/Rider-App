// ----------------------------------------------------------------
// Smooth error-correction engine.
//
// The displayed position chases the authoritative estimate (the
// interpolated/predicted progress) with TIME-SCALED exponential
// smoothing instead of snapping. Deriving alpha from delta time is
// what makes correction frame-rate independent: a fixed per-frame
// factor would correct twice as fast on a 120 Hz display as on 60 Hz.
//
//   alpha = 1 − e^(−rate·dt)
//   displayed += (target − displayed) · alpha
//
// With rate = 2.0, ~86% of the remaining error is corrected per second.
// ----------------------------------------------------------------

/** Frame-rate-independent smoothing factor for one frame of `dtSeconds`. */
export function smoothingAlpha(rate: number, dtSeconds: number): number {
  if (dtSeconds <= 0 || rate <= 0) return 0;
  return 1 - Math.exp(-rate * dtSeconds);
}

/** Moves `displayed` toward `target` by one frame of exponential smoothing. */
export function correctTowards(
  displayed: number,
  target: number,
  dtSeconds: number,
  rate: number,
): number {
  return displayed + (target - displayed) * smoothingAlpha(rate, dtSeconds);
}

/**
 * Large-error check. When prediction drift exceeds the threshold the
 * tracker performs a hard reset (single discrete jump) — preferable to a
 * long, visibly wrong correction glide across hundreds of meters.
 */
export function exceedsMaxError(
  displayedProgress: number,
  actualProgress: number,
  maxAllowedErrorMeters: number,
): boolean {
  return Math.abs(actualProgress - displayedProgress) > maxAllowedErrorMeters;
}
