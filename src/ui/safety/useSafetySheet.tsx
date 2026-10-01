import { useCallback } from "react";
import { Share } from "react-native";

import { useActiveRideState } from "~/providers/ActiveRideProvider";
import { useBottomSheet } from "~/ui/BottomSheet";
import { deriveRideDetails } from "~/ui/activeRideV2/rideViewModel";
import { useAppTheme } from "~/ui/theme";
import { height } from "~/utils/dimensions";

import { SafetySheetContent } from "./SafetySheetContent";
import { buildTripShareMessage, type RideSnapshot } from "./safetyMessages";
import { useSafetyIncident } from "./useSafetyIncident";

import type { RideRequestData } from "~/types/rideRequestTypes";

function toSnapshot(rideId: string, rideData: RideRequestData): RideSnapshot {
  const d = deriveRideDetails(rideData);
  const fix = rideData.driver_location;
  return {
    rideId,
    driverName: d.driverName,
    plate: d.plate,
    vehicleLine: [d.vehicleColor, d.vehicleType].filter(Boolean).join(" "),
    pickupName: d.from ? (d.from.street ?? d.from.city ?? null) : null,
    destinationName: d.destinationName,
    carLocation: fix ? { lat: fix.latitude, lng: fix.longitude } : null,
  };
}

/** Shares the trip status (driver, car, route, car location) via the OS. */
export function useShareTrip(): () => void {
  const { rideData } = useActiveRideState();
  return useCallback(() => {
    if (!rideData?.id) return;
    const ride = toSnapshot(rideData.id, rideData);
    void Share.share({ message: buildTripShareMessage(ride, null) }).catch(
      () => {},
    );
  }, [rideData]);
}

/**
 * Opens the safety sheet for the active ride. Called from inside the app
 * tree: the sheet host sits above the auth and ride providers, so the ride
 * snapshot and the authenticated incident call are captured here.
 */
export function useSafetySheet(): () => void {
  const sheet = useBottomSheet();
  const { colors } = useAppTheme();
  const { rideData } = useActiveRideState();
  const incident = useSafetyIncident();

  return useCallback(() => {
    if (!rideData?.id) return;
    const ride = toSnapshot(rideData.id, rideData);
    // Recorded as soon as the sheet opens, even if the rider only calls
    // 999 — ops would rather see a cancelled alert than miss a real one.
    void incident.report({
      ride_id: ride.rideId,
      source: "sheet_opened",
      rider_location: null,
      car_location: ride.carLocation,
    });
    sheet.present(
      ({ dismiss }) => (
        <SafetySheetContent
          ride={ride}
          alertsEnabled={incident.enabled}
          onAlertSafety={(riderLocation) =>
            incident.report({
              ride_id: ride.rideId,
              source: "alert_safety_team",
              rider_location: riderLocation,
              car_location: ride.carLocation,
            })
          }
          onClose={dismiss}
        />
      ),
      {
        detents: [0, height],
        // Also opened from the old layout's map, under its native TrueSheet.
        nativeOverlay: true,
        surface: { backgroundColor: colors.background },
        accessibilityLabel: "Sitwego Safety",
        testID: "safety-sheet",
      },
    );
  }, [colors.background, incident, rideData, sheet]);
}
