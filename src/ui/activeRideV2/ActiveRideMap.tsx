import { PressableScale } from "pressto";
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";

import { EmergencyButton } from "~/components/EmergencyButton";
import Icon from "~/components/Icons";
import RnMapView from "~/components/RnMaps";
import { DestinationMarker, StopMarker } from "~/components/RnMaps/MapMarker";
import { MapPolyline } from "~/components/RnMaps/MapPolyline";
import { SmoothDriverMarker } from "~/components/RnMaps/SmoothDriverMarker";
import {
  calcDynamicZoom,
  useFollowVehicleCamera,
} from "~/hooks/useFollowVehicleCamera";
import { useAppTheme } from "~/ui/theme";
import { haversineDistance } from "~/utils/geo";

import type { SettledMode } from "./useActiveRideLayout";
import type MapView from "react-native-maps";
import type { VehicleFrame } from "~/tracking/types";
import type { Point } from "~/types/geoTypes";

export type ActiveRideMapHandle = {
  /** One camera move for a mode that just settled. */
  settleCamera: (mode: SettledMode) => void;
  /** Stop chasing the vehicle (call when a collapse starts). */
  releaseCamera: () => void;
};

type Props = {
  /** Fixed native size — the expanded frame. Callers clip it. */
  width: number;
  height: number;
  /** Visible crop in compact mode, anchored to the map's bottom-left. */
  compactW: number;
  compactH: number;
  /** Settled mode; gestures and overlays only exist when expanded. */
  mode: SettledMode;
  route: Point[];
  driverPoint?: Point;
  stops: Point[];
  vehicleType?: string;
  markerEta: string;
  showEmergency: boolean;
};

const FIT_MARGIN = 24;
// Compact re-fits are cheap but visible; following every 2 s fix would make
// the thumbnail twitch.
const COMPACT_REFIT_MS = 15_000;

/**
 * The single live map of the v2 ride screen: the same polyline, smooth
 * driver marker, stop and destination markers as the old `RideMapView`.
 * It is rendered at a fixed size and anchored bottom-left in its clip, so
 * the Google logo (bottom-left, zero base padding) stays inside the compact
 * crop and `mapPadding` never changes. Every fit carries its own edge
 * padding: react-native-maps' Android fitToCoordinates adds the native base
 * padding current at call time, so switching padding and then fitting races.
 */
const ActiveRideMapBase = forwardRef<ActiveRideMapHandle, Props>(
  function ActiveRideMap(
    {
      width,
      height,
      compactW,
      compactH,
      mode,
      route,
      driverPoint,
      stops,
      vehicleType,
      markerEta,
      showEmergency,
    },
    ref,
  ) {
    const { colors } = useAppTheme();
    const mapRef = useRef<MapView>(null);
    const initialFitDone = useRef(false);
    const lastCompactFitAt = useRef(0);

    const {
      isFollowing,
      followTo,
      recenter,
      getCameraHeading,
      onRegionChange,
      onRegionChangeComplete,
      onPanDrag,
    } = useFollowVehicleCamera(mapRef, {
      followOnStart: false,
      followIntervalMs: 500,
      followDurationMs: 800,
    });

    const latest = useRef({ route, driverPoint, mode, width, height });
    useEffect(() => {
      latest.current = { route, driverPoint, mode, width, height };
    });

    const fitFor = useCallback(
      (fitMode: SettledMode, animated: boolean) => {
        const {
          route: r,
          driverPoint: d,
          width: w,
          height: h,
        } = latest.current;
        const target = r.length > 0 ? r[r.length - 1] : undefined;
        const coords = d && target ? [d, target] : d ? [d] : r;
        if (coords.length === 0) return;
        const edgePadding =
          fitMode === "compact"
            ? {
                left: FIT_MARGIN,
                bottom: FIT_MARGIN,
                top: h - compactH + FIT_MARGIN,
                right: w - compactW + FIT_MARGIN,
              }
            : {
                left: FIT_MARGIN,
                bottom: FIT_MARGIN,
                top: FIT_MARGIN * 2,
                right: FIT_MARGIN,
              };
        mapRef.current?.fitToCoordinates(coords, { edgePadding, animated });
        if (fitMode === "compact") lastCompactFitAt.current = Date.now();
      },
      [compactH, compactW],
    );

    useImperativeHandle(
      ref,
      () => ({
        settleCamera: (settled) => {
          if (settled === "expanded" && latest.current.driverPoint) {
            recenter();
          } else {
            fitFor(settled, true);
          }
        },
        releaseCamera: onPanDrag,
      }),
      [fitFor, onPanDrag, recenter],
    );

    // Compact thumbnail: frame a new route right away (it may arrive after
    // the map is ready)…
    useEffect(() => {
      if (latest.current.mode !== "compact" || !initialFitDone.current) return;
      fitFor("compact", true);
    }, [route, fitFor]);

    // …and keep driver + next target framed as the driver moves, throttled.
    useEffect(() => {
      if (mode !== "compact" || !driverPoint || !initialFitDone.current) {
        return;
      }
      if (Date.now() - lastCompactFitAt.current < COMPACT_REFIT_MS) return;
      fitFor("compact", true);
    }, [driverPoint, fitFor, mode]);

    // Expanded: navigation-style follow, zoom driven by distance to target.
    const handleDriverFrame = useCallback(
      (frame: VehicleFrame) => {
        if (latest.current.mode !== "expanded") return;
        const r = latest.current.route;
        const endpoint = r.length > 0 ? r[r.length - 1] : undefined;
        const zoom = endpoint
          ? calcDynamicZoom(
              haversineDistance(
                { latitude: frame.latitude, longitude: frame.longitude },
                endpoint,
              ),
            )
          : undefined;
        followTo(frame.latitude, frame.longitude, frame.heading, zoom);
      },
      [followTo],
    );

    const destination = route.length > 0 ? route[route.length - 1] : null;
    const expanded = mode === "expanded";

    return (
      <View style={{ width, height }}>
        <RnMapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          scrollEnabled={expanded}
          zoomEnabled={expanded}
          rotateEnabled={expanded}
          pitchEnabled={expanded}
          showsUserLocation
          userLocationPriority="high"
          showsMyLocationButton={false}
          showsCompass={false}
          showsBuildings={false}
          toolbarEnabled={false}
          moveOnMarkerPress={false}
          onMapReady={() => {
            // Only the first ready positions the camera.
            if (initialFitDone.current) return;
            initialFitDone.current = true;
            fitFor("compact", false);
          }}
          onRegionChange={onRegionChange}
          onRegionChangeComplete={onRegionChangeComplete}
          onPanDrag={onPanDrag}
        >
          {route.length > 0 && (
            <>
              <MapPolyline
                coordinates={route}
                geodesic
                strokeColor={colors.green_400}
                lineCap="round"
                lineJoin="round"
                strokeWidth={3}
              />
              <SmoothDriverMarker
                route={route}
                driverPoint={driverPoint}
                vehicleType={vehicleType}
                onFrame={handleDriverFrame}
                getCameraHeading={getCameraHeading}
              />
              {stops.map((point, index) => (
                <StopMarker
                  key={`stop-${index}`}
                  label={stops.length > 1 ? `Stop ${index + 1}` : "Stop"}
                  {...point}
                />
              ))}
              {destination && (
                <DestinationMarker ride_duration={markerEta} {...destination} />
              )}
            </>
          )}
        </RnMapView>
        {expanded && showEmergency && <EmergencyButton />}
        {expanded && !isFollowing && driverPoint && (
          <PressableScale
            onPress={recenter}
            accessibilityRole="button"
            accessibilityLabel="Recenter on driver"
            style={[styles.recenter, { backgroundColor: colors.bg_100 }]}
          >
            <Icon name="LocateFixed" size={22} color={colors.green_400} />
          </PressableScale>
        )}
      </View>
    );
  },
);

export const ActiveRideMap = memo(ActiveRideMapBase);

const styles = StyleSheet.create({
  recenter: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
});
