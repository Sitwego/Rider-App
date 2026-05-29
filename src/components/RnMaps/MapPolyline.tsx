import React from "react";
import { Polyline, MapPolylineProps } from "react-native-maps";

export const MapPolyline: React.FC<MapPolylineProps> = (props) => {
  return <Polyline {...props} />;
};
