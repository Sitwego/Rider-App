import React, { useEffect } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import RnText from "~/ui/RnText";
import { RnAnimatedView, RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";

import type { LocationResult } from "react-native-place-picker";

const SHEET_HEIGHT = 220;

interface Props {
  location: LocationResult | null;
  onConfirm: (location: LocationResult) => void;
}

export function DestinationPickerSheet({ location, onConfirm }: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const translateY = useSharedValue(SHEET_HEIGHT);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    translateY.value = withSpring(location ? 0 : SHEET_HEIGHT, {
      damping: 18,
      stiffness: 130,
    });
  }, [location, translateY]);

  return (
    <RnAnimatedView
      style={[
        styles.sheet,
        { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
        sheetAnimatedStyle,
      ]}
    >
      <RnText style={[styles.title, { color: colors.text }]}>
        Adjust your destination
      </RnText>

      <RnView style={styles.locationRow}>
        <RnView style={[styles.dot, { backgroundColor: colors.primary }]} />
        <RnText
          style={[styles.address, { color: colors.text }]}
          numberOfLines={1}
        >
          {location?.address ?? ""}
        </RnText>
      </RnView>

      <TouchableOpacity
        style={[styles.confirmButton, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={() => location && onConfirm(location)}
      >
        <RnText style={styles.confirmButtonText}>Confirm destination</RnText>
      </TouchableOpacity>
    </RnAnimatedView>
  );
}

const styles = StyleSheet.create({
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  title: {
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
  address: {
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
