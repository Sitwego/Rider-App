// ----------------------------------------------------------------
// TrackingDemo — dev-only screen for exercising the real-time vehicle
// tracking pipeline end-to-end on a device, without a backend.
//
// A GpsSimulator drives a virtual vehicle along the mock route and
// emits noisy fixes every 2 s into the SAME pipeline the production
// driver marker uses (useVehicleAnimation → VehicleMarker). Controls:
//
//   Pause/Resume — stop/restart the GPS feed (watch prediction take
//                  over, then the marker dim once stale at 10 s)
//   Signal lost  — vehicle keeps driving with no fixes; on restore the
//                  tracker hard-recovers or glides depending on drift
//   Reset        — teleport the fix back to the start (large-error path)
//
// Enabled via the SHOW_TRACKING_DEMO flag in RiderHomeScreen.tsx.
// ----------------------------------------------------------------

import React, { memo, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import RnMapView from "~/components/RnMaps";
import { MapPolyline } from "~/components/RnMaps/MapPolyline";
import {
  calcDynamicPitch,
  DEFAULT_ZOOM,
  useFollowVehicleCamera,
} from "~/hooks/useFollowVehicleCamera";
import { useVehicleAnimation } from "~/hooks/useVehicleAnimation";
import { GpsSimulator } from "~/tracking/testing/GpsSimulator";
import { mockRoute } from "~/tracking/testing/mockRoute";

import { VehicleMarker } from "./VehicleMarker";

const DEMO_VEHICLE_ID = "demo-vehicle";
const STATUS_UPDATE_MS = 300;

type DemoStatus = {
  progress: number;
  isPredicting: boolean;
  isStale: boolean;
};

function TrackingDemoComponent() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const { setVehicleRoute, ingestGpsUpdate, subscribeVehicle } =
    useVehicleAnimation();

  // Lazy one-time construction; the instance itself is stable and mutable.
  const [simulator] = useState(
    () =>
      new GpsSimulator(mockRoute, {
        speedMps: 14, // ~50 km/h
        intervalMs: 2000, // production GPS cadence
        noiseMeters: 4,
        loop: true,
      }),
  );

  const {
    isFollowing,
    followTo,
    recenter,
    getCameraHeading,
    onRegionChange,
    onRegionChangeComplete,
    onPanDrag,
  } = useFollowVehicleCamera(mapRef);

  const [paused, setPaused] = useState(false);
  const [signalLost, setSignalLost] = useState(false);
  // A/B switch: screen-space rotation compensation (billboard + camera
  // heading) vs the platform's native flat-marker behavior.
  const [camFix, setCamFix] = useState(true);
  const [status, setStatus] = useState<DemoStatus>({
    progress: 0,
    isPredicting: false,
    isStale: false,
  });
  const lastStatusAtRef = useRef(0);
  // Latest smoothed route bearing from the animation frames — fed to the
  // camera together with each new GPS coordinate.
  const latestHeadingRef = useRef<number | undefined>(undefined);

  // Wire the pipeline: route + simulated GPS feed. The camera is driven
  // by GPS arrivals (navigation style): every new coordinate glides the
  // center there and rotates the map to the vehicle bearing.
  useEffect(() => {
    setVehicleRoute(DEMO_VEHICLE_ID, mockRoute);
    simulator.start((fix) => {
      ingestGpsUpdate(DEMO_VEHICLE_ID, fix);
      followTo(fix.latitude, fix.longitude, latestHeadingRef.current);
    });
    return () => simulator.stop();
  }, [setVehicleRoute, ingestGpsUpdate, simulator, followTo]);

  // Low-rate status readout (the marker itself updates at 60 fps via refs;
  // this state only feeds the debug text, throttled to avoid re-renders).
  useEffect(
    () =>
      subscribeVehicle(DEMO_VEHICLE_ID, (frame) => {
        latestHeadingRef.current = frame.heading;

        const now = Date.now();
        if (now - lastStatusAtRef.current < STATUS_UPDATE_MS) return;
        lastStatusAtRef.current = now;
        setStatus({
          progress: frame.progress,
          isPredicting: frame.isPredicting,
          isStale: frame.isStale,
        });
      }),
    [subscribeVehicle],
  );

  const togglePause = () => {
    if (paused) simulator.resume();
    else simulator.pause();
    setPaused(!paused);
  };

  const toggleSignal = () => {
    simulator.setSignalLost(!signalLost);
    setSignalLost(!signalLost);
  };

  const reset = () => simulator.reset();

  const badges = [
    signalLost ? "SIGNAL LOST" : null,
    paused ? "FEED PAUSED" : null,
    status.isStale ? "STALE" : status.isPredicting ? "PREDICTING" : "TRACKING",
  ].filter(Boolean);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <RnMapView
        ref={mapRef}
        onMapReady={() => {
          // Start directly in the follow view; the first animation frame
          // engages the chase from here (no overview fit, no toggling).
          mapRef.current?.setCamera({
            center: mockRoute[0],
            zoom: DEFAULT_ZOOM,
            pitch: calcDynamicPitch(DEFAULT_ZOOM),
            heading: 0,
          });
        }}
        showsCompass={false}
        toolbarEnabled={false}
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}
        onPanDrag={onPanDrag}
      >
        <MapPolyline
          coordinates={mockRoute}
          strokeColor="#22c55e"
          strokeWidth={6}
          lineCap="round"
          lineJoin="round"
        />
        <VehicleMarker
          vehicleId={DEMO_VEHICLE_ID}
          subscribe={subscribeVehicle}
          initialCoordinate={mockRoute[0]}
          getCameraHeading={camFix ? getCameraHeading : undefined}
        />
      </RnMapView>

      {/* <View style={[styles.panel, { bottom: insets.bottom + 80 }]}>
        <Text style={styles.title}>Tracking demo — simulated GPS</Text>
        <Text style={styles.statusText}>
          {Math.round(status.progress)} m / {Math.round(simulator.routeLength)}{" "}
          m · {badges.join(" · ")}
        </Text>
        <View style={styles.row}>
          <DemoButton
            label={paused ? "Resume" : "Pause"}
            onPress={togglePause}
          />
          <DemoButton
            label={signalLost ? "Restore signal" : "Lose signal"}
            onPress={toggleSignal}
            active={signalLost}
          />
          <DemoButton label="Reset" onPress={reset} />
        </View>
        <View style={styles.row}>
          <DemoButton
            label={camFix ? "Rotation: cam-fix" : "Rotation: flat"}
            onPress={() => setCamFix(!camFix)}
            active={camFix}
          />
          <DemoButton
            label="Recenter"
            onPress={recenter}
            active={!isFollowing}
          />
        </View>
      </View> */}
    </View>
  );
}

function DemoButton({
  label,
  onPress,
  active = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        active && styles.buttonActive,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F2424",
  },
  panel: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 12,
    backgroundColor: "rgba(15, 36, 36, 0.5)",
    padding: 14,
    gap: 8,
  },
  title: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  statusText: {
    color: "#a7f3d0",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: "#134e4a",
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonActive: {
    backgroundColor: "#b45309",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
});

export const TrackingDemo = memo(TrackingDemoComponent);
