import { PressableScale } from "pressto";
import { memo, useCallback, useRef } from "react";
import { type LayoutChangeEvent, StyleSheet } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import Icon from "~/components/Icons";
import WaitingTimer from "~/components/WaitingTimer";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { space } from "~/ui/theme/tokens";

import { ACCENT } from "../geometry";

type Props = {
  label: string;
  headline: string;
  statusMessage: string;
  /** Shown until the trip starts, like the old floating OTP chip. */
  otp: string | null;
  arrivalTime: number | null;
  frozenWaitElapsed: number | undefined;
  slotW: number;
  slotH: number;
  progress: SharedValue<number>;
  onExpand: () => void;
  /** Card position inside the scroll content. */
  onCardLayout: (e: LayoutChangeEvent) => void;
  /** Slot offset relative to the card's top-left. */
  onSlotOffset: (x: number, y: number) => void;
};

/**
 * "Ride status" card. The right-hand frame is only a measured slot: the
 * single live map is rendered at screen level and positioned over it.
 */
function RideStatusCardBase({
  label,
  headline,
  statusMessage,
  otp,
  arrivalTime,
  frozenWaitElapsed,
  slotW,
  slotH,
  progress,
  onExpand,
  onCardLayout,
  onSlotOffset,
}: Props) {
  const { colors, fonts } = useAppTheme();
  const rowAt = useRef<{ x: number; y: number } | null>(null);
  const slotAt = useRef<{ x: number; y: number } | null>(null);

  const report = useCallback(() => {
    if (rowAt.current && slotAt.current) {
      onSlotOffset(
        rowAt.current.x + slotAt.current.x,
        rowAt.current.y + slotAt.current.y,
      );
    }
  }, [onSlotOffset]);
  const onRowLayout = useCallback(
    (e: LayoutChangeEvent) => {
      rowAt.current = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y };
      report();
    },
    [report],
  );
  const onSlotLayout = useCallback(
    (e: LayoutChangeEvent) => {
      slotAt.current = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y };
      report();
    },
    [report],
  );

  // The whole card fades: it slides up under the expanded map, and its
  // bottom edge would otherwise show between the map and the driver card.
  const cardFade = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5], [1, 0], "clamp"),
  }));

  return (
    <Animated.View onLayout={onCardLayout} style={cardFade}>
      <PressableScale
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityLabel={`${headline}. Expand live map`}
        style={[styles.card, { backgroundColor: colors.bg_50 }]}
      >
        <RnView style={styles.row} onLayout={onRowLayout}>
          <RnView style={styles.text}>
            <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
              {label}
            </RnText>
            <Animated.Text
              key={headline}
              entering={FadeIn.duration(220)}
              exiting={FadeOut.duration(120)}
              style={[
                atoms.text_xl,
                { color: ACCENT, fontFamily: fonts.heavy.fontFamily },
              ]}
            >
              {headline}
            </Animated.Text>
          </RnView>
          <RnView
            onLayout={onSlotLayout}
            style={[
              styles.slot,
              { width: slotW, height: slotH, backgroundColor: colors.bg_100 },
            ]}
          />
        </RnView>

        <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
          {statusMessage}
        </RnText>

        {otp ? (
          <RnView style={[styles.otp, { backgroundColor: colors.bg_100 }]}>
            <Icon name="KeyRound" size={16} color={ACCENT} />
            <RnText style={[atoms.text_sm, { color: colors.gray_300 }]}>
              Share OTP with your driver
            </RnText>
            <RnText
              style={[
                atoms.text_lg,
                styles.otpCode,
                { color: colors.text, fontFamily: fonts.heavy.fontFamily },
              ]}
            >
              {otp}
            </RnText>
          </RnView>
        ) : null}

        {arrivalTime != null ? (
          <WaitingTimer
            arrivalTime={arrivalTime}
            frozenElapsed={frozenWaitElapsed}
          />
        ) : null}
      </PressableScale>
    </Animated.View>
  );
}

export const RideStatusCard = memo(RideStatusCardBase);

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: space.lg,
    gap: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
  },
  text: { flex: 1, gap: space.xs },
  slot: { borderRadius: 16 },
  otp: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 12,
  },
  otpCode: { marginLeft: "auto", letterSpacing: 4 },
});
