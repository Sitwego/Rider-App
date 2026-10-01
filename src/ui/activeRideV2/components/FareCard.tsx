import { PressableScale } from "pressto";
import { memo, useCallback } from "react";
import { Pressable, StyleSheet } from "react-native";

import Icon from "~/components/Icons";
import { useBottomSheet } from "~/ui/BottomSheet";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { space } from "~/ui/theme/tokens";

const CURRENCY = "KES";
const PAYMENT_METHOD = "Cash";

type FareDetails = {
  fare: string;
  distanceLabel: string;
  tripDuration: string;
  vehicleType: string | null;
};

const FareRow = ({ label, value }: { label: string; value: string }) => {
  const { colors } = useAppTheme();
  return (
    <RnView style={styles.fareRow}>
      <RnText style={[atoms.text_sm, { color: colors.gray_300 }]}>
        {label}
      </RnText>
      <RnText style={[atoms.text_sm, { color: colors.text }]}>{value}</RnText>
    </RnView>
  );
};

// TODO: share with ActiveRideSheet's FareDetailsContent (and add the promo
// lines) once that file's WIP lands.
export function FareDetailsContent({
  fare,
  distanceLabel,
  tripDuration,
  vehicleType,
  onClose,
}: FareDetails & { onClose: () => void }) {
  const { colors } = useAppTheme();
  return (
    <RnView style={atoms.gap_lg}>
      <RnView style={styles.titleRow}>
        <Icon name="ReceiptText" size={22} color={colors.green_500} />
        <RnText style={[atoms.text_lg, { color: colors.text }]}>
          Fare details
        </RnText>
      </RnView>
      <RnView style={[styles.total, { backgroundColor: colors.bg_100 }]}>
        <RnText style={[atoms.text_md, { color: colors.gray_300 }]}>
          Estimated fare
        </RnText>
        <RnText style={[atoms.text_xl, { color: colors.text }]}>
          {CURRENCY} {fare}
        </RnText>
      </RnView>
      <RnView style={atoms.gap_sm}>
        <FareRow label="Trip distance" value={distanceLabel} />
        <FareRow label="Estimated duration" value={tripDuration} />
        <FareRow label="Vehicle type" value={vehicleType ?? "—"} />
        <FareRow label="Payment method" value={PAYMENT_METHOD} />
      </RnView>
      <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
        The final fare may vary based on actual distance, time, and any
        applicable surcharges such as tolls or waiting time.
      </RnText>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        style={[styles.gotIt, { backgroundColor: colors.green_500 }]}
      >
        <RnText style={[atoms.text_md, { color: colors.bg_50 }]}>Got it</RnText>
      </Pressable>
    </RnView>
  );
}

function FareCardBase(props: FareDetails) {
  const { colors, fonts } = useAppTheme();
  const sheet = useBottomSheet();
  const { fare, distanceLabel, tripDuration, vehicleType } = props;

  const onPress = useCallback(() => {
    sheet.present(
      ({ dismiss }) => (
        <FareDetailsContent
          fare={fare}
          distanceLabel={distanceLabel}
          tripDuration={tripDuration}
          vehicleType={vehicleType}
          onClose={dismiss}
        />
      ),
      {
        detents: [0, "content"],
        surface: { backgroundColor: colors.background },
        accessibilityLabel: "Fare details",
        testID: "fare-details-sheet",
      },
    );
  }, [sheet, fare, distanceLabel, tripDuration, vehicleType, colors]);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View fare details"
      style={[styles.card, { backgroundColor: colors.bg_50 }]}
    >
      <RnView style={atoms.gap_xs}>
        <RnView style={styles.titleRow}>
          <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
            Fare estimate
          </RnText>
          <Icon name="Info" size={14} color={colors.gray_300} />
        </RnView>
        <RnText
          style={[
            atoms.text_lg,
            { color: colors.text, fontFamily: fonts.heavy.fontFamily },
          ]}
        >
          {CURRENCY} {fare}
        </RnText>
      </RnView>
      <RnView style={styles.titleRow}>
        <Icon name="HandCoins" size={20} color={colors.green_500} />
        <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
          Pay by {PAYMENT_METHOD}
        </RnText>
      </RnView>
    </PressableScale>
  );
}

export const FareCard = memo(FareCardBase);

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  fareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  total: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: space.md,
    borderRadius: 12,
  },
  gotIt: { padding: space.lg, alignItems: "center", borderRadius: 12 },
});
