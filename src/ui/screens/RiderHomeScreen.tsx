import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmitterSubscription, StyleSheet } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import MapView, { Camera } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmergencyButton } from "~/components/EmergencyButton";
import Icon from "~/components/Icons";
import RnMapView from "~/components/RnMaps";
import {
  DestinationMarker,
  DriverMarker,
  MapMarkerCarIcon,
} from "~/components/RnMaps/MapMarker";
import { MapPolyline } from "~/components/RnMaps/MapPolyline";
import { useRequestPushNotificationPermission } from "~/hooks/notification";
import { nativeBridgeEventEmitter } from "~/lib/native";
import {
  useActiveRide,
  useActiveRideState,
} from "~/providers/ActiveRideProvider";
import { useRideRequsetMoadal } from "~/providers/RideBookingModalProvider";
import { Point } from "~/types/geoTypes";
import { RideReqEvent } from "~/types/rideRequestEvents";
import { calculateLatOffset, getCoordinatesFromLineStr } from "~/utils/geo";
import { autoFormatDuration } from "~/utils/math/times";

import RnText from "../RnText";
import { RnView } from "../RnView";
import { useAppTheme } from "../theme";
import { atoms } from "../theme/atoms";

// ----------------------------------------------------------------
// Permission gate UI — shown instead of the map when location is
// not yet available. Each state has its own CTA.
const RideMapView: React.FC = () => {
  const mapRef = useRef<MapView>(null);
  const activeRide = useActiveRide();
  const { colors, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { ride_status, rideData, ride_status_update_keys } =
    useActiveRideState();
  const [cameraHeight, setCameraHeight] = useState(55); // Dynamic camera height/pitch
  const [camera, _setCamera] = useState<Camera>(() => {
    return {
      zoom: 16,
      //this should be dynamic based on ride data or current location
      center: {
        latitude: -1.2676625388519933,
        longitude: 36.60956291005589,
      },
      heading: -10,
      pitch: 5,
    };
  });
  const getPolylineCoordinates = useMemo(() => {
    if (rideData && rideData.p1) {
      return getCoordinatesFromLineStr(rideData?.p1) || [];
    }
    return [];
  }, [rideData]);

  const ride_duration = useMemo(() => {
    if (!rideData) return "";
    return autoFormatDuration(rideData.estimated_duration || 0);
  }, [rideData]);

  const destination = getPolylineCoordinates.length
    ? {
        latitude:
          getPolylineCoordinates[getPolylineCoordinates.length - 1].latitude,
        longitude:
          getPolylineCoordinates[getPolylineCoordinates.length - 1].longitude,
      }
    : undefined;

  // Function to update camera height dynamically
  const updateCameraHeight = useCallback((newHeight: number) => {
    setCameraHeight(newHeight);
    if (mapRef.current) {
      mapRef.current.animateCamera(
        {
          pitch: newHeight,
        },
        { duration: 500 },
      );
    }
  }, []);

  useEffect(() => {
    if (mapRef.current && getPolylineCoordinates.length > 0) {
      // animateCamera to starting point from the polyline
      const coord = getPolylineCoordinates[0];
      mapRef.current.animateCamera(
        {
          center: {
            latitude: calculateLatOffset(coord.latitude),
            longitude: coord.longitude,
          },
          zoom: 16.2,
          heading: 0,
          pitch: 0, // Use dynamic camera height
        },
        { duration: 1000 },
      );
    }
  }, [getPolylineCoordinates, insets.top, cameraHeight]);

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
              strokeWidth={5}
            />
            <MapMarkerCarIcon {...getPolylineCoordinates} />
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
      {ride_status === "Inprogress" && <EmergencyButton />}
    </RnView>
  );
};

export const RiderHomeScreen: React.FC<any> = (props) => {
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
                Leaving From
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
            {/* <Pressable
              onPress={() => {
                props.navigation.push("RatingScreen", {
                  driverId: "1234",
                  rideId: "5678",
                });
              }}
              style={[
                atoms.gap_lg,
                {
                  height: 56,
                  flexDirection: "row",
                  alignItems: "center",
                  alignContent: "center",
                },
              ]}
            >
              <RnView
                style={[{ justifyContent: "center", alignItems: "center" }]}
              >
                <Icon
                  name="CircleStop"
                  strokeWidth={4}
                  size={24}
                  color={colors.red_300}
                />
              </RnView>
              <RnText
                style={{
                  fontSize: 14,
                }}
              >
                Going To
              </RnText>
            </Pressable> */}
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
});
