import { PressableScale } from "pressto";
import { Fragment, memo, useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { PlacePickerView, LocationResult } from "react-native-place-picker";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import RnText from "~/ui/RnText";
import { RnAnimatedView, RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

const SHEET_HEIGHT = 220;
type LocationPickerProps = {
  pin_location?: { latitude: number; longitude: number };
  /**A callback to updates result gotten from location picker */
  onLocationSelected?: (result: LocationResult) => void;
};

function LocationPicker({
  pin_location,
  onLocationSelected,
}: LocationPickerProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [selectedLocation, setSelectedLocation] =
    useState<LocationResult | null>(null);
  const { sheetAnimatedStyle, show } = useBottomSheetAnimation(SHEET_HEIGHT);

  const handleLocationSelected = useCallback(
    (result: LocationResult) => {
      setSelectedLocation(result);
      show();
    },
    [show],
  );

  return (
    <Fragment>
      <PlacePickerView
        latitude={pin_location?.latitude ?? -1.2595669100441973}
        longitude={pin_location?.longitude ?? 36.77701672444041}
        zoom={18.5}
        mapType="normal"
        onLocationSelected={handleLocationSelected}
        onError={(msg) => console.error(msg)}
        onMapReady={() => console.log("Map ready")}
        style={styles.map}
      />

      {/* Animated bottom sheet */}
      <RnAnimatedView
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 16,
          },
          sheetAnimatedStyle,
        ]}
      >
        <RnText style={[atoms.text_md, { color: colors.text }]}>
          Adjust your pickup location
        </RnText>

        <RnView style={styles.locationRow}>
          <RnView style={[styles.dot, { backgroundColor: colors.primary }]} />
          <RnText
            style={[atoms.text_xs, { color: colors.text }]}
            numberOfLines={1}
          >
            {selectedLocation?.address ?? ""}
          </RnText>
        </RnView>

        <PressableScale
          style={[styles.confirmButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            if (selectedLocation && onLocationSelected) {
              onLocationSelected(selectedLocation);
            }
          }}
        >
          <RnText style={styles.confirmButtonText}>Confirm Location</RnText>
        </PressableScale>
      </RnAnimatedView>
    </Fragment>
  );
}

function useBottomSheetAnimation(sheetHeight: number) {
  const translateY = useSharedValue(sheetHeight);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const show = useCallback(() => {
    "use no memo";
    translateY.value = withSpring(0, { stiffness: 500 });
  }, [translateY]);

  return { sheetAnimatedStyle, show };
}

export default memo(LocationPicker);

const styles = StyleSheet.create({
  map: { flex: 1 },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 20,
    shadowColor: "#0F2424",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    flexShrink: 0,
  },
  locationText: {
    fontSize: 16,
    flex: 1,
  },
  confirmButton: {
    height: 52,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
