import { useActiveRideState } from "~/providers/ActiveRideProvider";
import { RiderHomeScreen } from "~/ui/screens/RiderHomeScreen";

import { ActiveRideScreenV2 } from "./ActiveRideScreenV2";
import { usesActiveRideV2 } from "./flags";

/**
 * Home-tab root: the v2 ride screen for v2 rides, otherwise the existing
 * home screen (idle, searching, and every ride when the flag is off).
 */
export function ActiveRideGate(
  props: React.ComponentProps<typeof RiderHomeScreen>,
) {
  const { ride_status, rideData } = useActiveRideState();
  if (usesActiveRideV2(rideData?.id, ride_status)) {
    return <ActiveRideScreenV2 />;
  }
  return <RiderHomeScreen {...props} />;
}
