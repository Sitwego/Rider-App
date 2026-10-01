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

type Props = {
  count: number;
  /** Continuous pager position: page index + fraction. */
  position: SharedValue<number>;
  color?: string;
  /** Distance from the carousel's bottom edge. */
  bottom?: number;
};

/**
 * Page dots driven by the pager's continuous position on the UI thread: the
 * active dot stretches into a pill and hands its width to the next one as
 * the page moves, rather than snapping on settle.
 */
function CarouselDotsBase({
  count,
  position,
  color = "#FFFFFF",
  bottom = 12,
}: Props) {
  if (count < 2) return null;
  return (
    <RnView style={[styles.row, { bottom }]} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} index={i} position={position} color={color} />
      ))}
    </RnView>
  );
}

function Dot({
  index,
  position,
  color,
}: {
  index: number;
  position: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const distance = Math.abs(position.get() - index);
    return {
      width: interpolate(distance, [0, 1], [ACTIVE, DOT], Extrapolation.CLAMP),
      opacity: interpolate(distance, [0, 1], [1, 0.4], Extrapolation.CLAMP),
    };
  });
  return (
    <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />
  );
}

export const CarouselDots = memo(CarouselDotsBase);

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: { height: DOT, borderRadius: DOT / 2 },
});
