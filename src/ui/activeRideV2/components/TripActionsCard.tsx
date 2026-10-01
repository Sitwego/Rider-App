import { PressableScale } from "pressto";
import { memo, useCallback } from "react";
import { Linking, StyleSheet } from "react-native";

import Icon from "~/components/Icons";
import { useCancelRideRequest } from "~/hooks/api";
import { useActiveRide } from "~/providers/ActiveRideProvider";
import { useBottomSheet } from "~/ui/BottomSheet";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { space } from "~/ui/theme/tokens";
import {
  CancelRideReasonsContent,
  type CancelReason,
} from "~/ui/views/CancelRideReasonSheet";
import { height } from "~/utils/dimensions";
import { googleMapsNavigationLink } from "~/utils/geo";

type Props = {
  destination: { lat: number; lng: number } | null;
  /** Cancelling is offered until the trip starts, as in the old sheet. */
  canCancel: boolean;
};

/** Same flow as the old sheet: ask why, then cancel and clear the ride. */
function useCancelActiveRide() {
  const sheet = useBottomSheet();
  const { colors } = useAppTheme();
  const { setActiveRideState } = useActiveRide();
  const { mutateAsync: cancelRideAsync } = useCancelRideRequest();

  const cancelRide = useCallback(
    async (reason: CancelReason, note: string) => {
      try {
        await cancelRideAsync({
          reason: reason.id,
          reason_label: reason.label,
          category: reason.category,
          note,
        });
      } catch (err) {
        console.error("Error cancelling ride:", err);
      }
      setActiveRideState({ type: "REMOVE-RIDE" });
    },
    [cancelRideAsync, setActiveRideState],
  );

  return useCallback(() => {
    sheet.present(
      ({ dismiss }) => (
        <CancelRideReasonsContent
          onDone={(reason, comments) => {
            dismiss();
            void cancelRide(reason, comments);
          }}
        />
      ),
      {
        detents: [0, height],
        surface: { backgroundColor: colors.background },
        accessibilityLabel: "Why are you cancelling?",
        testID: "cancel-ride-reasons-sheet",
      },
    );
  }, [sheet, colors.background, cancelRide]);
}

function TripActionsCardBase({ destination, canCancel }: Props) {
  const { colors } = useAppTheme();
  const onCancel = useCancelActiveRide();

  const onNavigate = useCallback(() => {
    if (!destination) return;
    void Linking.openURL(googleMapsNavigationLink(destination));
  }, [destination]);

  return (
    <RnView style={[styles.card, { backgroundColor: colors.bg_50 }]}>
      {destination ? (
        <PressableScale
          onPress={onNavigate}
          accessibilityRole="button"
          accessibilityLabel="Open route in Google Maps"
          style={styles.action}
        >
          <Icon name="Navigation" size={20} color={colors.text} />
          <RnText style={[atoms.text_sm, { color: colors.text }]}>
            Open in Google Maps
          </RnText>
        </PressableScale>
      ) : null}
      {canCancel ? (
        <PressableScale
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel ride"
          style={styles.action}
        >
          <Icon name="CircleX" size={20} color={colors.red_500} />
          <RnText style={[atoms.text_sm, { color: colors.red_500 }]}>
            Cancel ride
          </RnText>
        </PressableScale>
      ) : null}
    </RnView>
  );
}

export const TripActionsCard = memo(TripActionsCardBase);

const styles = StyleSheet.create({
  card: { borderRadius: 20, paddingVertical: space.xs },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
