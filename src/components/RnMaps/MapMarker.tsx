import { Image } from "expo-image";
import { useEffect, useMemo, useRef } from "react";
import { Animated } from "react-native";
import { Marker, MarkerAnimated } from "react-native-maps";

import { s } from "~/styles/Common-Styles";
import { Point } from "~/types/geoTypes";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { getMarkerRotation } from "~/utils/geo";

import Icon from "../Icons";

const CAR_ICON = require("../../../assets/images/hatchbac-top-view-ic.png");

export function MapMarkerCarIcon(props: Point[]) {
  //Pick current location from the points array, first element
  const currentLocation = props[0];
  // Rotation angle value stored in animated value
  const rotationAngle = useRef(new Animated.Value(0)).current;

  const markerRef = useRef<any>(null);

  const rotation = useMemo(() => {
    if (props.length < 2) return 0;
    const firstPosition = props[0];
    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < props.length - 1; i++) {
      const distance = Math.hypot(
        props[i].latitude - firstPosition.latitude,
        props[i].longitude - firstPosition.longitude,
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }
    // to ensure index is always within the bounds
    if (closestIndex < 0 || closestIndex >= props.length - 1) return 0;
    const p1 = props[closestIndex];
    const p2 = props[closestIndex + 1];

    const rotation = getMarkerRotation(p1, p2);

    console.log("Calculated rotation:", rotation);
    return rotation;
  }, [props]);

  useEffect(() => {
    // Animate rotation to new angle
    Animated.timing(rotationAngle, {
      toValue: rotation,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [rotation, rotationAngle]);

  useEffect(() => {
    if (markerRef.current) {
      if (currentLocation) {
        // markerRef.current.animateMarkerToCoordinate(currentLocation, 500);
      }
    }
  }, [currentLocation]);

  if (!currentLocation) return null;

  return (
    <MarkerAnimated
      coordinate={currentLocation}
      anchor={{ x: 0.5, y: 0.5 }}
      flat={true}
      rotation={rotationAngle}
      //@ts-ignore
      ref={(ref) => (markerRef.current = ref)}
    >
      <Animated.View style={[]}>
        <Image
          contentFit="contain"
          source={CAR_ICON}
          style={{ width: 50, height: 50 }}
        />
      </Animated.View>
    </MarkerAnimated>
  );
}
export function DriverMarker(props?: Point) {
  //Pick current location from the points array, first element
  const currentLocation = props;
  if (!currentLocation) return null;
  console.log("Rendering DriverMarker at:", currentLocation);

  return (
    <Marker coordinate={currentLocation} anchor={{ x: 0.5, y: 0.5 }} flat>
      <Image
        contentFit="contain"
        source={CAR_ICON}
        style={{ width: 50, height: 50 }}
      />
    </Marker>
  );
}

export const DestinationMarker: React.FC<Point & { ride_duration: string }> = (
  props,
) => {
  const { fonts, colors } = useAppTheme();
  const { ride_duration, ...rest } = props;
  return (
    <Marker flat anchor={{ x: 0.3, y: 0.6 }} coordinate={rest}>
      <RnView
        style={[
          s.flexDirectionRow,
          s.gap4,
          s.spaceBetween,
          s.alignCenter,
          s.px6,
          s.py5,
          s.borderRadius_full,
          { backgroundColor: colors.bg_100 },
        ]}
      >
        <Icon
          name="CircleStop"
          size={22}
          color={colors.green_400}
          strokeWidth={4}
        />
        <RnText
          style={[
            atoms.text_xs,
            { color: colors.text, fontFamily: fonts.heavy.fontFamily },
          ]}
        >
          {ride_duration}
        </RnText>
      </RnView>
    </Marker>
  );
};
