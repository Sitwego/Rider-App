import { memo } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import { RnView } from "~/ui/RnView";

const DOT = 6;
const ACTIVE = 22;

/**
 * Page dots driven by the pager's continuous position (page + fraction) on
 * the UI thread: the active dot stretches into a pill and hands its width
 * to the next one as the finger moves, rather than snapping on settle.
 */
function PromoDotsBase({
  count,
  position,
}: {
  count: number;
  position: SharedValue<number>;
}) {
  if (count < 2) return null;
  return (
    <RnView style={styles.row} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} index={i} position={position} />
      ))}
    </RnView>
  );
}

function Dot({
  index,
  position,
}: {
  index: number;
  position: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const distance = Math.abs(position.get() - index);
    return {
      width: interpolate(distance, [0, 1], [ACTIVE, DOT], Extrapolation.CLAMP),
      opacity: interpolate(distance, [0, 1], [1, 0.4], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

export const PromoDots = memo(PromoDotsBase);

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: { height: DOT, borderRadius: DOT / 2, backgroundColor: "#FFFFFF" },
});
