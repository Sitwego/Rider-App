// ----------------------------------------------------------------
// VehicleMarker — render layer of the vehicle tracking pipeline.
//
// React renders this component ONCE per vehicle lifecycle; every
// per-frame position/rotation update flows imperatively through
// Animated values (AnimatedRegion.setValue / Animated.Value.setValue),
// which react-native-maps applies to the native marker without any
// React re-render. This is the react-native-maps equivalent of
// calling marker.setPosition()/setIcon() on a web google.maps.Marker.
//
// All marker specifics are isolated here, so swapping the rendering
// approach (e.g. a custom native marker) touches only this file.
// ----------------------------------------------------------------

import { Image, type ImageSource } from "expo-image";
import React, { memo, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { MarkerAnimated } from "react-native-maps";

import {
  normalizeHeading,
  shortestHeadingDelta,
  type LatLng,
} from "~/tracking/geo";

import type { VehicleFrameListener } from "~/hooks/useVehicleAnimation";

const DEFAULT_CAR_ICON = require("../../assets/images/hatchbac-top-view-ic.png");
const VEHICLE_TOP_VIEW_IMAGES: Record<string, number> = {
  Bike: require("../../assets/images/ny_ic_bike_top_view.png"),
  Auto: require("../../assets/images/ny_ic_auto_top_view.png"),
};

const getVehicleTopViewImage = (vehicleType?: string) =>
  (vehicleType && VEHICLE_TOP_VIEW_IMAGES[vehicleType]) || DEFAULT_CAR_ICON;

/** Skip native prop pushes below these deltas (≈1 cm / a hair of rotation). */
const COORDINATE_EPSILON_DEG = 1e-7;
const HEADING_EPSILON_DEG = 0.05;

/** Marker opacity while the vehicle is stale (no GPS past the timeout). */
const STALE_OPACITY = 0.45;

export interface VehicleMarkerProps {
  vehicleId: string;
  /** `subscribeVehicle` from useVehicleAnimation. */
  subscribe: (vehicleId: string, listener: VehicleFrameListener) => () => void;
  /** Where the marker sits until the first animation frame arrives. */
  initialCoordinate: LatLng;
  /** Initial icon rotation (compass degrees). */
  initialHeading?: number;
  /** Explicit icon. Overrides the `vehicleType`-derived top-view icon. */
  icon?: ImageSource | number;
  /** Ride vehicle type (e.g. "Bike", "Auto") used to pick the top-view icon. */
  vehicleType?: string;
  /** Icon square size in dp. */
  size?: number;
  /** Dim the marker while stale (default true). */
  dimWhenStale?: boolean;
  /**
   * Latest map-camera heading in degrees (see useFollowVehicleCamera).
   * When provided, the marker renders as a billboard and its rotation is
   * compensated in SCREEN space (vehicleHeading − cameraHeading), so the
   * icon stays aligned with the polyline no matter how the user rotates
   * or tilts the map — independent of how the platform implements `flat`.
   * When omitted, the marker relies on the native flat-marker behavior.
   */
  getCameraHeading?: () => number;
  onPress?: () => void;
}

function VehicleMarkerComponent({
  vehicleId,
  subscribe,
  initialCoordinate,
  initialHeading = 0,
  icon,
  vehicleType,
  size = 50,
  dimWhenStale = true,
  getCameraHeading,
  onPress,
}: VehicleMarkerProps) {
  // Animated handles created once (stable instances); .setValue() goes
  // straight to the native marker via the direct-manipulation path.
  const [latitudeValue] = useState(
    () => new Animated.Value(initialCoordinate.latitude),
  );
  const [longitudeValue] = useState(
    () => new Animated.Value(initialCoordinate.longitude),
  );
  const [rotationValue] = useState(() => new Animated.Value(initialHeading));
  const [opacityValue] = useState(() => new Animated.Value(1));

  // Last values pushed to native — used to skip no-op updates.
  const lastPushedRef = useRef({
    latitude: initialCoordinate.latitude,
    longitude: initialCoordinate.longitude,
    heading: initialHeading,
    isStale: false,
  });

  // Android renders marker children to a bitmap; stop re-capturing it once
  // the icon image has loaded (position/rotation/opacity are native marker
  // props and do not need view tracking).
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribe(vehicleId, (frame) => {
      const last = lastPushedRef.current;

      const latMoved = Math.abs(frame.latitude - last.latitude);
      const lngMoved = Math.abs(frame.longitude - last.longitude);
      if (
        latMoved > COORDINATE_EPSILON_DEG ||
        lngMoved > COORDINATE_EPSILON_DEG
      ) {
        latitudeValue.setValue(frame.latitude);
        longitudeValue.setValue(frame.longitude);
        last.latitude = frame.latitude;
        last.longitude = frame.longitude;
      }

      // Screen-space compensation: subtract the live camera heading so the
      // icon tracks the polyline through map rotation/tilt gestures.
      const targetHeading = getCameraHeading
        ? normalizeHeading(frame.heading - getCameraHeading())
        : frame.heading;
      if (
        Math.abs(shortestHeadingDelta(last.heading, targetHeading)) >
        HEADING_EPSILON_DEG
      ) {
        rotationValue.setValue(targetHeading);
        last.heading = targetHeading;
      }

      if (dimWhenStale && frame.isStale !== last.isStale) {
        last.isStale = frame.isStale;
        Animated.timing(opacityValue, {
          toValue: frame.isStale ? STALE_OPACITY : 1,
          duration: 400,
          // Marker `opacity` is a native view prop, not a style — the
          // native driver cannot target it.
          useNativeDriver: false,
        }).start();
      }
    });
    return unsubscribe;
  }, [
    vehicleId,
    subscribe,
    dimWhenStale,
    getCameraHeading,
    latitudeValue,
    longitudeValue,
    rotationValue,
    opacityValue,
  ]);

  return (
    <MarkerAnimated
      coordinate={{
        latitude: latitudeValue,
        longitude: longitudeValue,
      }}
      rotation={rotationValue}
      opacity={opacityValue}
      anchor={{ x: 0.5, y: 0.5 }}
      flat={!getCameraHeading}
      tracksViewChanges={tracksViewChanges}
      onPress={onPress}
    >
      <Image
        contentFit="contain"
        source={icon ?? getVehicleTopViewImage(vehicleType)}
        style={{ width: size, height: size }}
        onLoadEnd={() => setTracksViewChanges(false)}
      />
    </MarkerAnimated>
  );
}

/**
 * Memoized hard: parent re-renders (camera moves, sheets opening, …) must
 * not reach the marker. Only identity-level prop changes re-render it.
 */
export const VehicleMarker = memo(VehicleMarkerComponent);
