import { StyleSheet, View } from "react-native";

import { useAppTheme } from "~/ui/theme";
import { borderRadius as radiusTokens, space } from "~/ui/theme/tokens";

import type { BottomSheetSurfaceOptions } from "./types";

interface Props {
  surface?: BottomSheetSurfaceOptions;
}

/**
 * The shared sheet background. Passed to the library's `surface` prop, so it is
 * mounted in a full-size host and MUST fill via `StyleSheet.absoluteFill` (a
 * surface sized only by its own content collapses and never shows).
 *
 * Both the imperative host and the declarative `AppBottomSheet` render this so
 * every sheet in the app looks identical. Colors/radii come from design tokens.
 */
export const BottomSheetSurface = ({ surface }: Props) => {
  const { colors } = useAppTheme();

  const backgroundColor = surface?.backgroundColor ?? colors.card;
  const topRadius = surface?.borderRadius ?? radiusTokens.lg;
  const showHandle = surface?.showHandle ?? true;
  const handleColor = surface?.handleColor ?? colors.gray_300;

  return (
    <View
      collapsable={false}
      pointerEvents="box-none"
      style={[
        StyleSheet.absoluteFill,
        styles.surface,
        {
          backgroundColor,
          borderTopLeftRadius: topRadius,
          borderTopRightRadius: topRadius,
        },
      ]}
    >
      {showHandle ? (
        <View
          // Decorative — hidden from screen readers.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.handle, { backgroundColor: handleColor }]}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  surface: {
    alignItems: "center",
  },
  handle: {
    position: "absolute",
    top: space.sm,
    width: 40,
    height: 4,
    borderRadius: radiusTokens.full,
  },
});
