// ----------------------------------------------------------------
// Prediction (dead-reckoning) engine.
//
// When the interpolation segment is exhausted and the next GPS update
// has not arrived yet, the vehicle keeps moving along the route at its
// last known speed — markers must never freeze on a 2-3 s late packet.
//
// Two safety properties:
//   1. Predicted speed DECAYS linearly to zero across the decay window
//      instead of extrapolating at full speed forever.
//   2. Prediction stops entirely after PREDICTION_TIMEOUT_MS (handled
//      by the tracker via isTimedOut) — beyond that, showing a vehicle
//      confidently driving a route it may have left is worse than
//      holding still and dimming the marker.
// ----------------------------------------------------------------

import { clamp } from "./geo";

/**
 * Distance traveled (meters) after `overshootSeconds` of dead reckoning,
 * with speed decaying linearly from `speedMps` to 0 over `decayWindowSeconds`.
 *
 * Closed form of ∫ max(0, v·(1 − t/T)) dt:
 *   t < T:  v·(t − t²/2T)
 *   t ≥ T:  v·T/2   (decay complete — no further movement)
 */
export function predictDistance(
  speedMps: number,
  overshootSeconds: number,
  decayWindowSeconds: number,
): number {
  if (speedMps <= 0 || overshootSeconds <= 0) return 0;
  if (decayWindowSeconds <= 0) return 0;

  const t = Math.min(overshootSeconds, decayWindowSeconds);
  return speedMps * (t - (t * t) / (2 * decayWindowSeconds));
}

/**
 * Predicted route progress, clamped to [0, routeLength] so dead reckoning
 * can never overshoot the route end or underflow the start.
 */
export function predictProgress(
  baseProgress: number,
  speedMps: number,
  overshootSeconds: number,
  decayWindowSeconds: number,
  routeLength: number,
): number {
  return clamp(
    baseProgress +
      predictDistance(speedMps, overshootSeconds, decayWindowSeconds),
    0,
    routeLength,
  );
}

/** True once the gap since the last accepted update exceeds the timeout. */
export function isTimedOut(
  msSinceLastUpdate: number,
  timeoutMs: number,
): boolean {
  return msSinceLastUpdate > timeoutMs;
}
