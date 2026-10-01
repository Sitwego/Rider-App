import { useMemo } from "react";

import { useActiveRideState } from "~/providers/ActiveRideProvider";
import { createProfileImageUrl } from "~/utils/url";

import {
  deriveRideDetails,
  formatRideHeadline,
  formatRideLabel,
  formatStatusMessage,
  headlineEtaSeconds,
  selectRoutePolyline,
  toRidePhase,
  type RideDetails,
  type RidePhase,
} from "./rideViewModel";

import type { Point } from "~/types/geoTypes";

export type ActiveRideView = {
  rideId: string;
  phase: RidePhase;
  label: string;
  headline: string;
  statusMessage: string;
  details: RideDetails;
  avatarUrl: string | null;
  route: Point[];
  driverPoint: Point | undefined;
  stops: Point[];
  /** ETA shown on the destination marker: pickup pre-trip, dropoff on trip. */
  markerEta: string;
};

function routeSignature(route: Point[]): string {
  if (route.length === 0) return "";
  const first = route[0];
  const last = route[route.length - 1];
  return `${route.length}:${first.latitude},${first.longitude}:${last.latitude},${last.longitude}`;
}

/**
 * View model for the v2 ride screen, composed from the existing active-ride
 * store. Every location tick replaces `rideData`, so the route, driver point
 * and stops keep their identity unless their content changes; cards take
 * primitive props and skip re-rendering on ticks.
 */
export function useActiveRideView(): ActiveRideView | null {
  const { ride_status, rideData } = useActiveRideState();

  const lat = rideData?.driver_location?.latitude;
  const lng = rideData?.driver_location?.longitude;
  const driverPoint = useMemo<Point | undefined>(
    () =>
      typeof lat === "number" && typeof lng === "number"
        ? { latitude: lat, longitude: lng }
        : undefined,
    [lat, lng],
  );

  const freshRoute = selectRoutePolyline(ride_status, rideData);
  const routeKey = routeSignature(freshRoute);
  // Keyed on content, not identity: p1 is re-decoded on every tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const route = useMemo(() => freshRoute, [routeKey]);

  const rawStops = rideData?.stops;
  const stops = useMemo<Point[]>(
    () =>
      Array.isArray(rawStops)
        ? rawStops
            .filter(
              (s) => typeof s?.lat === "number" && typeof s?.lon === "number",
            )
            .map((s) => ({ latitude: s.lat, longitude: s.lon }))
        : [],
    [rawStops],
  );

  const phase = toRidePhase(ride_status, driverPoint !== undefined);

  return useMemo(() => {
    if (!rideData?.id || !phase) return null;
    const details = deriveRideDetails(rideData);
    const avatarUrl =
      details.driverId && details.faceImageId
        ? createProfileImageUrl(
            details.driverId,
            details.faceImageId,
            "get-profile-image",
          )
        : null;
    return {
      rideId: rideData.id,
      phase,
      label: formatRideLabel(phase),
      headline: formatRideHeadline(
        phase,
        headlineEtaSeconds(phase, rideData),
        details.destinationName,
      ),
      statusMessage: formatStatusMessage(phase, details.pickupEta),
      details,
      avatarUrl,
      route,
      driverPoint,
      stops,
      markerEta: phase === "on_trip" ? details.tripDuration : details.pickupEta,
    };
  }, [rideData, phase, route, driverPoint, stops]);
}
