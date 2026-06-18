import { useCallback } from "react";
import { StyleSheet } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import LocationPicker from "~/components/LocationPicker";
import { useRideRequsetMoadal } from "~/providers/RideBookingModalProvider";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";

import type { PlaceType } from "../../../../lib/placesTypes";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { LocationResult } from "react-native-place-picker";
import type { SharedStackParamList } from "~/navigation/types";

type Props = NativeStackScreenProps<
  SharedStackParamList,
  "ConfirmPickupScreen"
>;

export function ConfirmPickupScreen({ navigation, route }: Props) {
  const { latitude, longitude, dropOff } = route.params;
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { dispatchRideSearchState } = useRideRequsetMoadal();

  const handleLocationSelected = useCallback(
    (result: LocationResult) => {
      const parts = result.address?.split(",").map((p) => p.trim()) ?? [];
      const country = parts[parts.length - 1];
      const confirmedPickup: PlaceType = {
        address: result.address,
        name: result.address,
        country: country ?? "",
        lat: result.latitude,
        lng: result.longitude,
      };
      dispatchRideSearchState({
        type: "SET-RIDE-SEARCH-RESULT",
        payload: { pickup: confirmedPickup, dropOff, findingEstimates: true },
      });
      navigation.navigate("RideFairEstimateScreen", {
        pickup: confirmedPickup,
        dropOff,
      });
    },
    [dispatchRideSearchState, dropOff, navigation],
  );

  return (
    <RnView style={[StyleSheet.absoluteFill, {}]}>
      <LocationPicker
        pin_location={{ latitude, longitude }}
        onLocationSelected={handleLocationSelected}
      />
      <Pressable
        style={{
          position: "absolute",
          top: insets.top + 16,
          left: 16,
          padding: 8,
        }}
        onPress={() => navigation.goBack()}
      >
        <Icon name="ArrowLeft" size={24} strokeWidth={3} color={colors.text} />
      </Pressable>
    </RnView>
  );
}
