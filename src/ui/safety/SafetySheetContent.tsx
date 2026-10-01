import { PressableScale } from "pressto";
import { useState } from "react";
import { Linking, Pressable, Share, StyleSheet } from "react-native";

import Icon from "~/components/Icons";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { space } from "~/ui/theme/tokens";

import { ALT_EMERGENCY_NUMBER, EMERGENCY_NUMBER } from "./safetyConfig";
import {
  buildTripShareMessage,
  formatCoordinates,
  type LatLng,
  type RideSnapshot,
} from "./safetyMessages";
import { useRiderLocation } from "./useRiderLocation";

type AlertState = "idle" | "sending" | "sent" | "failed";

type Props = {
  ride: RideSnapshot;
  alertsEnabled: boolean;
  onAlertSafety: (riderLocation: LatLng | null) => Promise<boolean>;
  onClose: () => void;
};

const call = (number: string) => {
  // No canOpenURL pre-check: it can report false negatives for tel: on
  // Android 11+, and an emergency call must never be blocked by it.
  void Linking.openURL(`tel:${number}`).catch((err) =>
    console.error("[safety] could not open dialer", err),
  );
};

/**
 * Safety sheet: emergency call first, then what a dispatcher will ask for
 * (where you are, which car), then sharing. The driver is never notified.
 */
export function SafetySheetContent({
  ride,
  alertsEnabled,
  onAlertSafety,
  onClose,
}: Props) {
  const { colors, fonts } = useAppTheme();
  const location = useRiderLocation();
  const [alertState, setAlertState] = useState<AlertState>("idle");

  const where = location.coords ?? ride.carLocation;
  const whereLabel = location.coords
    ? "Your location"
    : ride.carLocation
      ? "Car's last known location"
      : "Your location";

  const onAlert = async () => {
    if (alertState === "sending" || alertState === "sent") return;
    setAlertState("sending");
    setAlertState((await onAlertSafety(location.coords)) ? "sent" : "failed");
  };

  const onShare = () => {
    void Share.share({
      message: buildTripShareMessage(ride, location.coords),
    }).catch(() => {});
  };

  const heavy = { fontFamily: fonts.heavy.fontFamily };

  return (
    <RnView style={styles.root}>
      <RnView style={styles.header}>
        <Icon name="ShieldCheck" size={28} color={colors.green_500} />
        <RnView>
          <RnText style={[atoms.text_xl, heavy, { color: colors.text }]}>
            Sitwego Safety
          </RnText>
          <RnText style={[atoms.text_sm, { color: colors.gray_300 }]}>
            Help is one tap away
          </RnText>
        </RnView>
      </RnView>

      <PressableScale
        onPress={() => call(EMERGENCY_NUMBER)}
        accessibilityRole="button"
        accessibilityLabel={`Call emergency services, ${EMERGENCY_NUMBER}`}
        style={[styles.callButton, { backgroundColor: colors.red_500 }]}
      >
        <Icon name="Phone" size={24} color="white" strokeWidth={2.5} />
        <RnText style={[atoms.text_xl, heavy, styles.white]}>
          Call {EMERGENCY_NUMBER}
        </RnText>
      </PressableScale>
      <Pressable
        onPress={() => call(ALT_EMERGENCY_NUMBER)}
        accessibilityRole="button"
        hitSlop={8}
      >
        <RnText
          style={[atoms.text_sm, styles.center, { color: colors.gray_300 }]}
        >
          or call {ALT_EMERGENCY_NUMBER}
        </RnText>
      </Pressable>

      <RnView style={[styles.panel, { backgroundColor: colors.bg_100 }]}>
        <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
          TELL THE DISPATCHER
        </RnText>

        <RnView style={styles.row}>
          <Icon name="MapPin" size={20} color={colors.green_500} />
          <RnView style={styles.rowText}>
            <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
              {whereLabel}
            </RnText>
            <RnText style={[atoms.text_md, heavy, { color: colors.text }]}>
              {location.address ??
                (where ? formatCoordinates(where) : "Locating…")}
            </RnText>
            {location.address && where ? (
              <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
                {formatCoordinates(where)}
              </RnText>
            ) : null}
          </RnView>
        </RnView>

        <RnView style={styles.row}>
          <Icon name="Car" size={20} color={colors.green_500} />
          <RnView style={styles.rowText}>
            <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
              Car
            </RnText>
            <RnText
              style={[
                atoms.text_2xl,
                heavy,
                styles.plate,
                { color: colors.text },
              ]}
            >
              {ride.plate}
            </RnText>
            <RnText style={[atoms.text_sm, { color: colors.text }]}>
              {[ride.vehicleLine, `Driver: ${ride.driverName}`]
                .filter(Boolean)
                .join(" · ")}
            </RnText>
          </RnView>
        </RnView>
      </RnView>

      {alertsEnabled ? (
        <PressableScale
          onPress={onAlert}
          accessibilityRole="button"
          style={[styles.secondary, { borderColor: colors.red_500 }]}
        >
          <Icon name="Siren" size={20} color={colors.red_500} />
          <RnText style={[atoms.text_md, heavy, { color: colors.red_500 }]}>
            {alertState === "sent"
              ? "Safety team alerted — we'll call you"
              : alertState === "sending"
                ? "Alerting Sitwego Safety…"
                : alertState === "failed"
                  ? `Couldn't reach Sitwego Safety. Call ${EMERGENCY_NUMBER}.`
                  : "Alert Sitwego Safety"}
          </RnText>
        </PressableScale>
      ) : null}

      <PressableScale
        onPress={onShare}
        accessibilityRole="button"
        style={[styles.secondary, { borderColor: colors.bg_100 }]}
      >
        <Icon name="Share2" size={20} color={colors.text} />
        <RnText style={[atoms.text_md, { color: colors.text }]}>
          Share trip status
        </RnText>
      </PressableScale>

      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        style={styles.safe}
      >
        <RnText style={[atoms.text_md, { color: colors.gray_300 }]}>
          {"I'm safe"}
        </RnText>
      </Pressable>
    </RnView>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  header: { flexDirection: "row", alignItems: "center", gap: space.md },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    paddingVertical: space.lg,
    borderRadius: 16,
  },
  white: { color: "white" },
  center: { textAlign: "center" },
  panel: { borderRadius: 16, padding: space.lg, gap: space.lg },
  row: { flexDirection: "row", gap: space.md },
  rowText: { flex: 1, gap: 2 },
  plate: { letterSpacing: 2 },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingVertical: space.md,
    borderRadius: 14,
    borderWidth: 1,
  },
  safe: { alignItems: "center", paddingVertical: space.sm },
});
