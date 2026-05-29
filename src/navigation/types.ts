import type { RouteProp } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";

import type { PlaceType } from "../../lib/placesTypes";

// ---------------------------------------------------------------------------
// Shared stack param list
// Contains all screens registered in sharedStackScreens()
// ---------------------------------------------------------------------------
export type SharedStackParamList = {
  RideFairEstimateScreen: { pickup: PlaceType; dropOff: PlaceType };
  RideDetailsScreen: { rideId: string };
  RatingScreen: RatingScreenParams;
  ConfirmPickupScreen: {
    latitude: number;
    longitude: number;
    dropOff: PlaceType;
  };
};

// ---------------------------------------------------------------------------
// Profile stack param list
// ---------------------------------------------------------------------------
export type ProfileStackParamList = {
  RiderProfileScreen: undefined;
  EditProfileScreen: undefined;
  UserAddressScreen: undefined;
};

// ---------------------------------------------------------------------------
// RatingScreen route params
// ---------------------------------------------------------------------------
export type RatingScreenParams = {
  /** Unique identifier of the completed ride */
  rideId: string;
  /** Unique identifier of the driver being rated */
  driverId: string;
};

// ---------------------------------------------------------------------------
// Convenience screen-prop types for RatingScreen
// ---------------------------------------------------------------------------
export type RatingScreenNavigationProp = NativeStackNavigationProp<
  SharedStackParamList,
  "RatingScreen"
>;

export type RatingScreenRouteProp = RouteProp<
  SharedStackParamList,
  "RatingScreen"
>;

export type RatingScreenProps = NativeStackScreenProps<
  SharedStackParamList,
  "RatingScreen"
>;

export type RideDetailsScreenNavigationProp = NativeStackNavigationProp<
  SharedStackParamList,
  "RideDetailsScreen"
>;

export type RideDetailsScreenRouteProp = RouteProp<
  SharedStackParamList,
  "RideDetailsScreen"
>;

export type RideDetailsScreenProps = NativeStackScreenProps<
  SharedStackParamList,
  "RideDetailsScreen"
>;
