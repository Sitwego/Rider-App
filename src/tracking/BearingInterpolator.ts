// ----------------------------------------------------------------
// Bearing interpolation.
//
// Rotates the vehicle icon smoothly toward a target heading using the
// same time-scaled exponential smoothing as position correction, but
// applied to the SHORTEST rotation path: the delta is normalized to
// [−180°, +180°] first, so 350° → 10° rotates 20° clockwise rather
// than 340° counterclockwise, and 0°/360° wrap-around never snaps.
// ----------------------------------------------------------------

import { smoothingAlpha } from "./CorrectionEngine";
import { normalizeHeading, shortestHeadingDelta } from "./geo";

/**
 * One frame of heading smoothing.
 *
 * @returns The new displayed heading, normalized to [0, 360).
 */
export function stepHeading(
  displayedHeading: number,
  targetHeading: number,
  dtSeconds: number,
  rate: number,
): number {
  const delta = shortestHeadingDelta(displayedHeading, targetHeading);
  return normalizeHeading(
    displayedHeading + delta * smoothingAlpha(rate, dtSeconds),
  );
}
