import React from "react";
import { Animated } from "react-native";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";

import { CUSTOMSTYLE } from "~/constants/MAP_CUSTOM_STYLE";

import { map_style } from "./RnMapStyle";

const AnimatedMapView = Animated.createAnimatedComponent(MapView);

export type RnMapViewProps = React.ComponentProps<typeof MapView> & {
  children?: React.ReactNode;
};
const RnMapView = React.memo(
  React.forwardRef<MapView, RnMapViewProps>((props, ref) => {
    return (
      <AnimatedMapView
        provider={PROVIDER_GOOGLE}
        style={[map_style.map]}
        customMapStyle={CUSTOMSTYLE}
        {...props}
        ref={ref}
      >
        {props.children}
      </AnimatedMapView>
    );
  }),
);
RnMapView.displayName = "RnMapView";
export default RnMapView;
