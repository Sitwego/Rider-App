import { ModalBottomSheet } from "@swmansion/react-native-bottom-sheet";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  findNodeHandle,
  Keyboard,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { space } from "~/ui/theme/tokens";

import { BottomSheetSurface } from "./BottomSheetSurface";
import { detentValue } from "./config";

import type { ResolvedSheetConfig } from "./config";
import type { BottomSheetOptions } from "./types";
import type { ReactNode } from "react";

interface Props {
  index: number;
  config: ResolvedSheetConfig;
  options: BottomSheetOptions;
  onIndexChange: (index: number) => void;
  onSettle: (index: number) => void;
  children: ReactNode;
}

/** Track the keyboard height so content can pad itself above it. */
const useKeyboardHeight = (enabled: boolean): number => {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    // `Will*` events are iOS-only; Android only emits the `Did*` pair.
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [enabled]);

  // Report 0 while disabled without writing state from the effect.
  return enabled ? height : 0;
};

/**
 * Presentational wrapper shared by the imperative host and the declarative
 * `AppBottomSheet`. Owns the cross-cutting concerns the library leaves to the
 * app: the themed surface, keyboard avoidance, bottom safe-area padding, and
 * accessibility (modal focus trap + focus move on open).
 */
export const SheetView = ({
  index,
  config,
  options,
  onIndexChange,
  onSettle,
  children,
}: Props) => {
  const insets = useSafeAreaInsets();
  const containerRef = useRef<View>(null);

  const keyboardEnabled = (options.keyboardBehavior ?? "padding") !== "none";
  const keyboardHeight = useKeyboardHeight(keyboardEnabled);
  const respectSafeArea = options.respectSafeArea ?? true;

  // Sheets with a single fixed-point open detent get a container of exactly
  // that height so inner scrollables are bounded and bottom-pinned children
  // stay on-screen. `flex: 1` cannot do this: the native content wrapper does
  // not give Yoga a definite height (observed in native-overlay mode), so a
  // flex chain collapses to content size. `content`-detent sheets must stay
  // auto-height or the measured content height would balloon to the cap.
  const openPointDetents = config.detents
    .map(detentValue)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const fixedHeight =
    openPointDetents.length === 1 &&
    config.detents.every((detent) => detentValue(detent) !== "content")
      ? openPointDetents[0]
      : undefined;

  // Move screen-reader focus into the sheet once it mounts so it is announced
  // and subsequent gestures stay within it.
  useEffect(() => {
    const node = containerRef.current && findNodeHandle(containerRef.current);
    if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
  }, []);

  // The native-overlay window is edge-to-edge (it draws under the navigation
  // bar), but `insets` are measured in the main app window, which may end
  // above it — recover the nav-bar height from the screen/window delta so
  // bottom-pinned content clears the system bar in both modes.
  const overlayBottomInset = config.nativeOverlay
    ? Math.max(
        0,
        Dimensions.get("screen").height -
          Dimensions.get("window").height -
          (StatusBar.currentHeight ?? 0),
      )
    : 0;
  const bottomInset = Math.max(insets.bottom, overlayBottomInset);

  const paddingBottom =
    (respectSafeArea ? bottomInset : 0) +
    (keyboardHeight > 0 ? keyboardHeight : space.lg);

  return (
    <ModalBottomSheet
      index={index}
      detents={config.detents}
      animateIn
      // When the keyboard drives content padding, let the sheet follow the
      // animated height instead of adding its own resize animation.
      animateContentHeight={keyboardHeight === 0}
      extendUnderStatusBar={config.extendUnderStatusBar}
      nativeOverlay={config.nativeOverlay}
      scrimColor={config.scrimColor}
      scrimOpacities={config.scrimOpacities}
      onIndexChange={onIndexChange}
      onSettle={onSettle}
      onPositionChange={options.onPositionChange}
      surface={<BottomSheetSurface surface={options.surface} />}
    >
      <View
        ref={containerRef}
        accessible
        accessibilityViewIsModal
        accessibilityLabel={options.accessibilityLabel}
        testID={options.testID}
        style={[
          styles.content,
          fixedHeight != null && { height: fixedHeight },
          { paddingTop: space.xl, paddingBottom },
        ]}
      >
        {children}
      </View>
    </ModalBottomSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
  },
});
