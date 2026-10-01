import { PressableScale } from "pressto";
import { StyleSheet } from "react-native";

import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { space } from "~/ui/theme/tokens";

import { setActiveRideV2Enabled, useActiveRideV2Enabled } from "../flags";

import { useMockRide } from "./mockRide";

/** Developer controls for the v2 ride screen: flag override and mock ride. */
export function ActiveRideDevTools() {
  const { colors } = useAppTheme();
  const v2 = useActiveRideV2Enabled();
  const mock = useMockRide();

  const buttons: { label: string; onPress: () => void }[] = [
    {
      label: `Active ride v2: ${v2 ? "ON" : "OFF"}`,
      onPress: () => setActiveRideV2Enabled(!v2),
    },
    ...(mock.active
      ? [
          { label: mock.nextStep, onPress: mock.advance },
          { label: "End mock ride", onPress: mock.end },
        ]
      : [{ label: "Start mock ride", onPress: mock.start }]),
  ];

  return (
    <RnView style={[styles.box, { borderColor: colors.bg_100 }]}>
      <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
        DEVELOPER · ACTIVE RIDE
      </RnText>
      <RnView style={styles.row}>
        {buttons.map((b) => (
          <PressableScale
            key={b.label}
            onPress={b.onPress}
            style={[styles.button, { backgroundColor: colors.bg_100 }]}
          >
            <RnText style={[atoms.text_sm, { color: colors.text }]}>
              {b.label}
            </RnText>
          </PressableScale>
        ))}
      </RnView>
    </RnView>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: space._2xl,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    gap: space.sm,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  button: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 10,
  },
});
