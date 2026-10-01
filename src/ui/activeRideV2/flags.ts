import { useEffect, useState } from "react";

import { featureFlagStorage } from "~/storage";

import { toRidePhase } from "./rideViewModel";

import type { RideRequestStatus } from "~/types/rideRequestStatus";

// Local stand-in for the `active_ride_v2` Remote Config flag (not installed
// yet). Default on: unset means v2; only an explicit `false` (dev toggle)
// falls back to the old map + TrueSheet layout.

export function isActiveRideV2Enabled(): boolean {
  return featureFlagStorage.get(["active_ride_v2"]) !== false;
}

export function setActiveRideV2Enabled(enabled: boolean): void {
  featureFlagStorage.set(["active_ride_v2"], enabled);
}

export function useActiveRideV2Enabled(): boolean {
  const [enabled, setEnabled] = useState(isActiveRideV2Enabled);
  useEffect(() => {
    const listener = featureFlagStorage.addOnValueChangedListener(
      ["active_ride_v2"],
      (value) => setEnabled(value !== false),
    );
    return () => listener.remove();
  }, []);
  return enabled;
}

/**
 * Whether this ride uses the v2 layout. Decided once, when the ride is first
 * seen, and persisted, so flipping the flag mid-ride (or restarting the app)
 * never swaps layouts under the rider; the new value applies from the next
 * ride.
 */
export function latchV2ForRide(rideId: string): boolean {
  const latch = featureFlagStorage.get(["active_ride_v2_latch"]);
  if (latch?.rideId === rideId) return latch.v2;
  const v2 = isActiveRideV2Enabled();
  featureFlagStorage.set(["active_ride_v2_latch"], { rideId, v2 });
  return v2;
}

/** True when this ride, in this status, is rendered by the v2 layout. */
export function usesActiveRideV2(
  rideId: string | undefined,
  status: RideRequestStatus | null | undefined,
): boolean {
  return (
    !!rideId && toRidePhase(status, true) !== null && latchV2ForRide(rideId)
  );
}
