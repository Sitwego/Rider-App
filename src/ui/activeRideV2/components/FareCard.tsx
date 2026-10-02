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
  /** What the rider pays — net of any promotion. */
  fare: string;
  /** Set only when a promotion applies (with `discount`). */
  fullFare: string | null;
  discount: string | null;
  distanceLabel: string;
  tripDuration: string;
  vehicleType: string | null;
};

const FareRow = ({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) => {
  const { colors } = useAppTheme();
  return (
    <RnView style={styles.fareRow}>
      <RnText style={[atoms.text_sm, { color: colors.gray_300 }]}>
        {label}
      </RnText>
      <RnText style={[atoms.text_sm, { color: valueColor ?? colors.text }]}>
        {value}
      </RnText>
    </RnView>
  );
};

// TODO: share with ActiveRideSheet's FareDetailsContent once that file's
// promo WIP lands.
export function FareDetailsContent({
  fare,
  fullFare,
  discount,
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
        {/* Only on a discounted ride: the original fare and what came off
            it, so the amount above is explained rather than just lower than
            the quote. */}
        {fullFare && discount ? (
          <>
            <FareRow label="Fare" value={`${CURRENCY} ${fullFare}`} />
            <FareRow
              label="Promo discount"
              value={`−${CURRENCY} ${discount}`}
              valueColor={colors.green_500}
            />
          </>
        ) : null}
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
  const { fare, fullFare, discount, distanceLabel, tripDuration, vehicleType } =
    props;

  const onPress = useCallback(() => {
    sheet.present(
      ({ dismiss }) => (
        <FareDetailsContent
          fare={fare}
          fullFare={fullFare}
          discount={discount}
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
  }, [
    sheet,
    fare,
    fullFare,
    discount,
    distanceLabel,
    tripDuration,
    vehicleType,
    colors,
  ]);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        discount
          ? `Fare ${CURRENCY} ${fare}, promo saves ${CURRENCY} ${discount}. View fare details`
          : "View fare details"
      }
      style={[styles.card, { backgroundColor: colors.bg_50 }]}
    >
      <RnView style={atoms.gap_xs}>
        <RnView style={styles.titleRow}>
          <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
            Fare estimate
          </RnText>
          <Icon name="Info" size={14} color={colors.gray_300} />
        </RnView>
        <RnView style={styles.amountRow}>
          <RnText
            style={[
              atoms.text_lg,
              { color: colors.text, fontFamily: fonts.heavy.fontFamily },
            ]}
          >
            {CURRENCY} {fare}
          </RnText>
          {fullFare ? (
            <RnText
              style={[atoms.text_sm, styles.struck, { color: colors.gray_300 }]}
            >
              {CURRENCY} {fullFare}
            </RnText>
          ) : null}
        </RnView>
        {discount ? (
          <RnView style={[styles.promo, { backgroundColor: colors.bg_100 }]}>
            <Icon name="BadgePercent" size={14} color={colors.green_500} />
            <RnText style={[atoms.text_xs, { color: colors.green_500 }]}>
              Promo applied · −{CURRENCY} {discount}
            </RnText>
          </RnView>
        ) : null}
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
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  struck: { textDecorationLine: "line-through" },
  promo: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 8,
  },
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
