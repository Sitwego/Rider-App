import * as React from "react";
import { StyleSheet } from "react-native";

import Icon from "~/components/Icons";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

interface WaitingTimerProps {
  /** Unix timestamp in milliseconds when the driver arrived at pickup */
  arrivalTime: number;
  /**
   * Pre-computed elapsed seconds snapped at ride start and persisted in MMKV.
   * When provided the component renders a static value — no setInterval is
   * ever created, so app kill/reopen cannot accidentally restart the timer.
   */
  frozenElapsed?: number;
}

const FREE_WAIT_SECONDS = 5 * 60; // 5 minutes

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const WaitingTimer = ({ arrivalTime, frozenElapsed }: WaitingTimerProps) => {
  const { colors } = useAppTheme();

  const [elapsed, setElapsed] = React.useState(() => {
    if (frozenElapsed !== undefined) return frozenElapsed;
    return Math.floor((Date.now() - arrivalTime) / 1000);
  });

  React.useEffect(() => {
    if (frozenElapsed !== undefined) {
      // Persisted value — no interval needed, safe across kills and restarts
      setElapsed(frozenElapsed);
      return;
    }
    const tick = () =>
      setElapsed(Math.floor((Date.now() - arrivalTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [arrivalTime, frozenElapsed]);

  const isOvertime = elapsed > FREE_WAIT_SECONDS;
  const overtime = elapsed - FREE_WAIT_SECONDS;

  return (
    <RnView
      style={[
        styles.container,
        { backgroundColor: colors.bg_50, borderColor: colors.bg_100 },
      ]}
    >
      <Icon
        name="Clock"
        size={20}
        color={isOvertime ? colors.primary : colors.primary_400}
        strokeWidth={2}
      />
      <RnText style={[atoms.text_xs, { color: colors.gray_400 }]}>
        Driver waiting
      </RnText>
      <RnView style={styles.timeRow}>
        <RnText
          style={[
            atoms.text_md,
            atoms.font_bold,
            { color: colors.text, letterSpacing: 1.5 },
          ]}
        >
          {formatTime(Math.min(elapsed, FREE_WAIT_SECONDS))}
        </RnText>
        {isOvertime && (
          <RnText
            style={[atoms.text_xs, { color: colors.red_600, letterSpacing: 1 }]}
          >
            {` (+${formatTime(overtime)})`}
          </RnText>
        )}
      </RnView>
    </RnView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
});

export default WaitingTimer;
