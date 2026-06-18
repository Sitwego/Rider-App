// ----------------------------------------------------------------
// SmoothDriverMarker — single-driver convenience wrapper around the
// tracking pipeline (useVehicleAnimation + VehicleMarker) for the
// active-ride map. Feed it the ride route and the latest raw driver
// fix; it renders a marker that moves continuously along the route
// at the display refresh rate between the ~2 s GPS updates.
// ----------------------------------------------------------------

import React, { memo, useEffect, useMemo, useRef } from "react";

import { useVehicleAnimation } from "~/hooks/useVehicleAnimation";
import { Point } from "~/types/geoTypes";

import { VehicleMarker } from "../VehicleMarker";

import type { VehicleFrame } from "~/tracking/types";

export interface SmoothDriverMarkerProps {
  /** Full ride route polyline (static for the ride — NOT the shrinking remainder). */
  route: Point[];
  /** Latest raw driver GPS fix. */
  driverPoint?: Point;
  vehicleId?: string;
  /** Ride vehicle type (e.g. "Bike", "Auto") used to pick the marker icon. */
  vehicleType?: string;
  /**
   * Per-frame animated driver position — feed it to a camera-follow
   * (e.g. useFollowVehicleCamera's followTo). Called at ~60 fps; the
   * consumer is expected to throttle.
   */
  onFrame?: (frame: VehicleFrame) => void;
  /** Camera heading source for screen-space icon rotation (see VehicleMarker). */
  getCameraHeading?: () => number;
}

/**
 * Content signature for the route. Upstream state churn recreates the
 * coordinates array every update with identical content; replacing the
 * tracker's route on identity change alone would reset interpolation
 * state every 2 seconds.
 */
function routeSignature(route: Point[]): string {
  if (route.length === 0) return "empty";
  const first = route[0];
  const last = route[route.length - 1];
  return `${route.length}:${first.latitude},${first.longitude}:${last.latitude},${last.longitude}`;
}

function SmoothDriverMarkerComponent({
  route,
  driverPoint,
  vehicleId = "active-ride-driver",
  vehicleType,
  onFrame,
  getCameraHeading,
}: SmoothDriverMarkerProps) {
  const { setVehicleRoute, ingestGpsUpdate, subscribeVehicle, hasVehicle } =
    useVehicleAnimation();

  // Keep the per-frame callback in a ref so the subscription stays stable
  // even when the parent recreates the handler every render.
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(
    () => subscribeVehicle(vehicleId, (frame) => onFrameRef.current?.(frame)),
    [subscribeVehicle, vehicleId],
  );

  const signature = useMemo(() => routeSignature(route), [route]);
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  // (Re)create the vehicle only when the route content actually changes.
  useEffect(() => {
    if (routeRef.current.length >= 2) {
      setVehicleRoute(vehicleId, routeRef.current);
    }
  }, [signature, vehicleId, setVehicleRoute]);

  // Every driver fix (including repeats — the engine's jitter filter keeps
  // a stationary driver fresh instead of letting it go stale) goes in.
  useEffect(() => {
    if (!driverPoint || !hasVehicle(vehicleId)) return;
    ingestGpsUpdate(vehicleId, {
      latitude: driverPoint.latitude,
      longitude: driverPoint.longitude,
      timestamp: Date.now(),
    });
  }, [driverPoint, vehicleId, ingestGpsUpdate, hasVehicle]);

  if (route.length < 2) return null;

  return (
    <VehicleMarker
      vehicleId={vehicleId}
      subscribe={subscribeVehicle}
      initialCoordinate={driverPoint ?? route[0]}
      vehicleType={vehicleType}
      getCameraHeading={getCameraHeading}
    />
  );
}

export const SmoothDriverMarker = memo(SmoothDriverMarkerComponent);
