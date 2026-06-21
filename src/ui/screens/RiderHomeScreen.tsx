import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EmitterSubscription, StyleSheet } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import MapView, { Camera } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmergencyButton } from "~/components/EmergencyButton";
import Icon from "~/components/Icons";
import RnMapView from "~/components/RnMaps";
import { DestinationMarker, DriverMarker } from "~/components/RnMaps/MapMarker";
import { MapPolyline } from "~/components/RnMaps/MapPolyline";
import { SmoothDriverMarker } from "~/components/RnMaps/SmoothDriverMarker";
import { TrackingDemo } from "~/components/TrackingDemo";
import { useRequestPushNotificationPermission } from "~/hooks/notification";
import {
  calcDynamicPitch,
  calcDynamicZoom,
  DEFAULT_ZOOM,
  useFollowVehicleCamera,
} from "~/hooks/useFollowVehicleCamera";
import { useSheetMapPadding } from "~/hooks/useSheetMapPadding";
import { nativeBridgeEventEmitter } from "~/lib/native";
import {
  useActiveRide,
  useActiveRideState,
} from "~/providers/ActiveRideProvider";
import { useRideRequsetMoadal } from "~/providers/RideBookingModalProvider";
import { Point } from "~/types/geoTypes";
import { RideReqEvent } from "~/types/rideRequestEvents";
import { height } from "~/utils/dimensions";
import {
  calculateLatOffset,
  getCoordinatesFromLineStr,
  haversineDistance,
} from "~/utils/geo";
import { autoFormatDuration } from "~/utils/math/times";

import RnText from "../RnText";
import { RnView } from "../RnView";
import { useAppTheme } from "../theme";
import { atoms } from "../theme/atoms";

const RideMapView: React.FC = () => {
  const mapRef = useRef<MapView>(null);
  const activeRide = useActiveRide();
  const { colors, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { ride_status, rideData, ride_status_update_keys } =
    useActiveRideState();
  const getPolylineCoordinates = useMemo(() => {
    // Pre-trip (driver heading to pickup): render the driver->pickup leg so
    // the marker animates along the approach and the raw fix snaps onto the
    // right axis. Once Inprogress, switch to the pickup->destination route.
    if (ride_status !== "Inprogress") {
      const pickupLeg = rideData?.ride_polyline?.driver_to_pickup_polyline;
      if (Array.isArray(pickupLeg) && pickupLeg.length > 0) {
        return pickupLeg;
      }
    }
    if (rideData && rideData.p1) {
      return getCoordinatesFromLineStr(rideData?.p1) || [];
    }
    return [];
  }, [rideData, ride_status]);

  // Latest raw driver fix: the driver's true GPS coordinate from the native
  // "locationChange" events (~2 s cadence). Use the raw fix rather than the
  // route's first coordinate so the marker/camera track the driver's actual
  // position instead of a point snapped onto the polyline.
  const driverPoint = useMemo<Point | undefined>(() => {
    const fix = rideData?.driver_location;
    if (
      !fix ||
      typeof fix.latitude !== "number" ||
      typeof fix.longitude !== "number"
    ) {
      return undefined;
    }
    return { latitude: fix.latitude, longitude: fix.longitude };
  }, [rideData?.driver_location]);

  console.log("RideMapView render: driverPoint", driverPoint, "route coords", {
    getPolylineCoordinates,
  });
  const ride_duration = useMemo(() => {
    if (!rideData) return "";
    // Pre-trip the destination marker sits at the pickup point, so show the
    // ETA to pickup; once Inprogress it's the destination, so show trip ETA.
    const seconds =
      ride_status !== "Inprogress"
        ? rideData.estimated_duration_to_pickup
        : rideData.estimated_duration;
    return autoFormatDuration(seconds || 0);
  }, [rideData, ride_status]);

  const destination = getPolylineCoordinates.length
    ? {
        latitude:
          getPolylineCoordinates[getPolylineCoordinates.length - 1].latitude,
        longitude:
          getPolylineCoordinates[getPolylineCoordinates.length - 1].longitude,
      }
    : undefined;
  // Camera follow + camera-heading source for the driver marker.
  const {
    isFollowing,
    followTo,
    recenter,
    getCameraHeading,
    onRegionChange,
    onRegionChangeComplete,
    onPanDrag,
  } = useFollowVehicleCamera(mapRef, {
    // Driven by the ~60 fps marker frame (below) rather than the ~2 s GPS
    // fixes, so a tighter cadence keeps the camera glued to the smooth marker.
    followIntervalMs: 500,
    followDurationMs: 800,
  });

  // Keep the followed vehicle centered in the map area above the active-ride
  // sheet (20px gap), reframing onto the driver whenever the sheet snaps to a
  // new detent.
  const mapPadding = useSheetMapPadding(mapRef, driverPoint, { gap: 20 });

  // The smoothed marker frame (≈60 fps) is the camera's follow source: it
  // glides continuously along the route between the ~2 s GPS fixes, so the
  // camera tracks it smoothly instead of lurching to each raw fix. The active
  // endpoint (pickup pre-trip, dropoff in-progress — the route's last
  // coordinate) is held in a ref so the per-frame zoom can be derived from the
  // distance to it without re-creating the frame handler each route tick.
  const endpointRef = useRef<Point | undefined>(undefined);
  useEffect(() => {
    endpointRef.current =
      getPolylineCoordinates.length > 0
        ? getPolylineCoordinates[getPolylineCoordinates.length - 1]
        : undefined;
  }, [getPolylineCoordinates]);

  // Don't drive the camera until a real GPS fix has landed — pre-fix frames
  // sit at the route start. Mirrors the previous "engage on first fix".
  const hasDriverFixRef = useRef(false);
  useEffect(() => {
    if (driverPoint) hasDriverFixRef.current = true;
  }, [driverPoint]);

  // Navigation-style camera: each smoothed frame glides the center to the
  // marker, rotates the map to the marker's (route-derived) heading, and sets
  // the distance-driven zoom/pitch. followTo throttles itself, so calling it
  // every frame is fine. Distance to the active endpoint drives the zoom:
  // close in → street-level close-up, far out → route overview.
  const handleDriverFrame = useCallback(
    (frame: { latitude: number; longitude: number; heading: number }) => {
      if (!hasDriverFixRef.current) return;
      console.log("handleDriverFrame", frame);
      const endpoint = endpointRef.current;
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

  // Content key for the route: upstream state churn recreates the
  // coordinates array (same content) on every locationChange tick, and
  // re-running this effect each time would yank the camera back to the
  // route start, fighting the driver-follow above.
  const routeKey = useMemo(() => {
    if (getPolylineCoordinates.length === 0) return "";
    const first = getPolylineCoordinates[0];
    return `${getPolylineCoordinates.length}:${first.latitude},${first.longitude}`;
  }, [getPolylineCoordinates]);
  const routeStartRef = useRef<Point | undefined>(undefined);
  useEffect(() => {
    routeStartRef.current = getPolylineCoordinates[0];
  }, [getPolylineCoordinates]);

  useEffect(() => {
    const coord = routeStartRef.current;
    if (mapRef.current && routeKey && coord) {
      // One initial glide to the route start per NEW route only.
      mapRef.current.animateCamera(
        {
          center: {
            latitude: calculateLatOffset(coord.latitude),
            longitude: coord.longitude,
          },
          zoom: 17,
          heading: 0,
          pitch: 0,
        },
        { duration: 1000 },
      );
    }
  }, [routeKey]);

  return (
    <RnView style={[atoms.flex_1, { marginTop: insets.top }]}>
      <RnMapView
        // Uncontrolled camera: follow/recenter drive it imperatively via
        // animateCamera. Set the initial view once the map is ready (a
        // *controlled* `camera` prop would be reasserted on every re-render —
        // e.g. recenter's setIsFollowing(true) — cancelling those animations).
        onMapReady={() => {
          const start = driverPoint ?? getPolylineCoordinates[0];
          if (start) {
            mapRef.current?.setCamera({
              center: { latitude: start.latitude, longitude: start.longitude },
              zoom: DEFAULT_ZOOM,
              pitch: calcDynamicPitch(DEFAULT_ZOOM),
              heading: 0,
            });
          }
        }}
        // onMapLoaded={_onMapLoaded}
        ref={mapRef}
        mapPadding={mapPadding}
        zoomEnabled
        showsUserLocation={true}
        showsCompass={false}
        pitchEnabled
        userLocationPriority="high"
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}
        onPanDrag={onPanDrag}
      >
        {getPolylineCoordinates.length > 0 && (
          <>
            <MapPolyline
              coordinates={getPolylineCoordinates}
              key="ride_line"
              geodesic={true}
              strokeColor={colors.green_400}
              fillColor={colors.green_400}
              lineCap="round"
              lineJoin="round"
              strokeWidth={3}
            />
            <SmoothDriverMarker
              route={getPolylineCoordinates}
              driverPoint={driverPoint}
              vehicleType={rideData?.vehicle_type}
              onFrame={handleDriverFrame}
              getCameraHeading={getCameraHeading}
            />
            {/* Destination Maker */}
            {destination && (
              <DestinationMarker
                ride_duration={ride_duration}
                {...destination}
              />
            )}
          </>
        )}
      </RnMapView>
      {/* Recenter — shown after the user pans away from the driver. */}
      {!isFollowing && (
        <Pressable
          onPress={recenter}
          style={[
            styles.recenterButton,
            { backgroundColor: colors.bg_100 ?? "#ffffff" },
          ]}
        >
          <Icon name="LocateFixed" size={22} color={colors.green_400} />
        </Pressable>
      )}
      {ride_status === "Inprogress" && <EmergencyButton />}
    </RnView>
  );
};

// Dev-only: replace the home screen with the vehicle-tracking demo
// (simulated GPS along src/tracking/testing/mockRoute). Flip to false
// (or delete the flag and wrapper below) when done testing.
// const SHOW_TRACKING_DEMO = __DEV__ && true;

export const RiderHomeScreen: React.FC<any> = (props) => (
  <RiderHome {...props} />
);
RiderHomeScreen.displayName = "RiderHomeScreen";

const RiderHome: React.FC<any> = (props) => {
  const mapRef = useRef<MapView>(null);
  const requestPushNotificationPermission =
    useRequestPushNotificationPermission();
  const [drPoint, setDrPoint] = useState<Point | undefined>(undefined);

  const [camera, _] = useState<Camera>(() => {
    return {
      zoom: 14.5,
      //this should be dynamic based on ride data or current location
      center: {
        latitude: -1.2676625388519933,
        longitude: 36.60956291005589,
      },
      heading: -10,
      pitch: 5,
    };
  });
  const { colors } = useAppTheme();
  const { showModal } = useRideRequsetMoadal();
  // const activeRide = useActiveRide();
  const insets = useSafeAreaInsets();
  const { ride_status, rideData, ride_status_update_keys } =
    useActiveRideState();

  const hasActiveRide = useMemo(() => {
    return ride_status !== null && rideData !== null;
  }, [rideData, ride_status]);

  // If ride status update keys is available
  // then we are searching for driver
  // and we don't have ride data yet
  const isSearchingForDriver = useMemo(() => {
    return (
      ride_status_update_keys !== undefined &&
      (rideData === undefined || rideData === null)
    );
  }, [rideData, ride_status_update_keys]);

  console.log(colors.background);

  useEffect(() => {
    let sub: EmitterSubscription | null = null;
    if (isSearchingForDriver) {
      sub = nativeBridgeEventEmitter.addListener(
        "offeringDriverEvent",
        (data: RideReqEvent) => {
          if (data?.eventPayload) {
            const { lat, lng } = data.eventPayload;
            setDrPoint({ latitude: lat, longitude: lng });
            //Animate to the new driver location
            if (mapRef.current) {
              mapRef.current.animateCamera(
                {
                  center: {
                    latitude: lat,
                    longitude: lng,
                  },
                  zoom: 16,
                  heading: 0,
                  pitch: 10,
                },
                { duration: 1000 },
              );
            }
          }
        },
      );
    }
    return () => {
      if (sub) {
        sub.remove();
      }
    };
  }, [isSearchingForDriver]);

  useEffect(() => {
    requestPushNotificationPermission("Home");
  }, [requestPushNotificationPermission]);

  if (isSearchingForDriver) {
    return (
      <RnView style={[atoms.flex_1, { marginTop: insets.top }]}>
        <RnMapView
          camera={camera}
          // onMapReady={_onMapReady}
          // onMapLoaded={_onMapLoaded}
          ref={mapRef}
          zoomEnabled
          showsUserLocation={true}
          showsCompass={false}
          pitchEnabled
          userLocationPriority="high"
          showsMyLocationButton={false}
          toolbarEnabled={false}
          onRegionChangeComplete={() => {
            // console.log("onRegionChangeComplete");
          }}
        >
          {drPoint && <DriverMarker {...drPoint} />}
        </RnMapView>
      </RnView>
    );
  }

  return (
    <RnView style={styles.container}>
      {hasActiveRide ? (
        <RideMapView />
      ) : (
        <RnView
          style={[
            {
              flexDirection: "column",
              justifyContent: "center",
              alignSelf: "center",
              width: "86%",
              borderRadius: 10,
              backgroundColor: colors.bg_50,
              shadowColor: colors.gray_700,
              shadowOffset: {
                width: 0,
                height: 2,
              },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
              elevation: 5,
            },
          ]}
        >
          <RnView
            style={{
              flexDirection: "column",
              justifyContent: "center",
              paddingHorizontal: 10,
            }}
          >
            <Pressable
              onPress={showModal}
              style={[
                atoms.gap_lg,
                {
                  height: 56,
                  flexDirection: "row",
                  alignItems: "center",
                  alignContent: "center",
                  borderBottomColor: colors.gray_200,
                  borderBottomWidth: 1,
                },
              ]}
            >
              <RnView
                style={[{ justifyContent: "center", alignItems: "center" }]}
              >
                <Icon
                  name="Circle"
                  strokeWidth={4}
                  size={24}
                  color={colors.green_300}
                />
              </RnView>
              <RnText
                style={{
                  fontSize: 14,
                }}
              >
                Where are you going?
              </RnText>
              <RnView
                style={[
                  {
                    position: "absolute",
                    right: 0,
                    justifyContent: "center",
                    alignItems: "center",
                    zIndex: 1,
                  },
                ]}
              >
                <Icon
                  name="ArrowDownUp"
                  strokeWidth={2}
                  size={24}
                  color={colors.primary_500}
                />
              </RnView>
            </Pressable>
          </RnView>
          <RnView
            style={{
              height: 56,
              flex: 1,
              backgroundColor: colors.primary_500,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 10,
            }}
          ></RnView>
        </RnView>
      )}
    </RnView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  recenterButton: {
    position: "absolute",
    right: 16,
    bottom: height * 0.95, // clear of the active-ride bottom sheet
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
});
