import { Image } from "expo-image";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MapView, { Camera, Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import RnMapView from "~/components/RnMaps";
import { MapPolyline } from "~/components/RnMaps/MapPolyline";
import { useRideFairEstimation } from "~/hooks/api";
import {
  useRideRequsetMoadal,
  useRideSearchState,
} from "~/providers/RideBookingModalProvider";
import { useRideEstimateBottomSheet } from "~/providers/RideEstimatesSheetProvider";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { height } from "~/utils/dimensions";
import { getCoordinatesFromLineStr } from "~/utils/geo";

export function RideFairEstimateScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { show } = useRideEstimateBottomSheet();
  const { mutateAsync, error, status, data } = useRideFairEstimation();
  const { dispatchRideSearchState } = useRideRequsetMoadal();
  const rideSearchState = useRideSearchState();
  const mapRef = useRef<MapView>(null);
  const [camera, _setCamera] = useState<Camera>(() => {
    return {
      zoom: 15,
      center: {
        latitude: -1.2676625388519933,
        longitude: 36.60956291005589,
      },
      heading: -50,
      pitch: 10,
    };
  });

  const rideFairEstimate = useCallback(
    async function () {
      await show();
      await mutateAsync();
    },
    [mutateAsync, show],
  );

  useEffect(() => {
    rideFairEstimate();
  }, [rideFairEstimate]);

  useEffect(() => {
    if (status === "success" && data) {
      dispatchRideSearchState({
        type: "TOGGLE-FINDING-ESTIMATES",
        payload: {
          ...rideSearchState,
          findingEstimates: false,
          searchData: data,
        },
      });
    }
  }, [status, data]);

  const _onMapReady = useCallback(() => {
    // if (rideSearchState.pickupCoordinates) {
    //   mapRef.current?.animateCamera(
    //     {
    //       center: {
    //         latitude: rideSearchState.pickupCoordinates.latitude,
    //         longitude: rideSearchState.pickupCoordinates.longitude,
    //       },
    //       zoom: 16,
    //     },
    //     { duration: 1000 },
    //   );
    // }
  }, []);

  const _onMapLoaded = useCallback(() => {
    if (rideSearchState.searchData) {
      const coords = getCoordinatesFromLineStr(
        rideSearchState.searchData.line_str,
      );
      const start = coords[0];
      const end = coords[coords.length - 1];
      mapRef.current?.fitToCoordinates([start, end], {
        edgePadding: {
          top: 100,
          right: 100,
          bottom: height / 4,
          left: 100,
        },
        animated: true,
      });
      // if (rideSearchState.pickupCoordinates) {
      //   mapRef.current?.animateCamera(
      //     {
      //       center: {
      //         latitude: rideSearchState.pickupCoordinates.latitude,
      //         longitude: rideSearchState.pickupCoordinates.longitude,
      //       },
      //       zoom: 16,
      //     },
      //     { duration: 1000 },
      //   );
    }
  }, [rideSearchState.searchData]);

  const _polylineMaker = useMemo(() => {
    // if rideSearchState.searchData is available,
    // use it and return polyline component and MapMaker components
    if (rideSearchState.searchData) {
      const lineStr = rideSearchState.searchData.line_str;
      const coords = getCoordinatesFromLineStr(lineStr);
      return (
        <>
          <MapPolyline
            key="ride_line"
            geodesic={true}
            strokeColor={colors.green_400}
            fillColor={colors.green_400}
            coordinates={coords || []}
            lineCap="round"
            lineJoin="round"
            strokeWidth={6}
          />
          <MapMaker
            icon={require("../../../../assets/images/pickup_light.png")}
            latitude={coords[0].latitude}
            longitude={coords[0].longitude}
          />
          <MapMaker
            icon={require("../../../../assets/images/stop-location.png")}
            latitude={coords[coords.length - 1].latitude}
            longitude={coords[coords.length - 1].longitude}
          />
        </>
      );
    }
    return null;
  }, [colors.green_400, rideSearchState.searchData]);

  return (
    <RnView style={[{ marginTop: insets.top, flex: 1 }]}>
      <RnMapView
        camera={camera}
        onMapReady={_onMapReady}
        onMapLoaded={_onMapLoaded}
        ref={mapRef}
        zoomEnabled
        zoomControlEnabled
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
        {_polylineMaker}
      </RnMapView>
    </RnView>
  );
}

type MapMarkerProps = {
  latitude: number;
  longitude: number;
  icon: string;
};
const MapMaker: React.FC<MapMarkerProps> = ({ latitude, longitude, icon }) => {
  return (
    <Marker
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={{
        latitude,
        longitude,
      }}
    >
      <Image
        source={icon}
        style={{
          height: 28,
          width: 28,
        }}
        contentFit="contain"
      />
    </Marker>
  );
};
