import { Image } from "expo-image";
import { PressableScale } from "pressto";
import { memo, useCallback, useState } from "react";
import { type LayoutChangeEvent, StyleSheet } from "react-native";

import Icon from "~/components/Icons";
import NumberPlate from "~/components/Platenumber";
import Avatar from "~/ui/Avatar";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { space } from "~/ui/theme/tokens";
import { makePhoneCall } from "~/utils/linking";

const PLATE_FONT = require("../../../../assets/fonts/ConfigAltBold.ttf");
// TODO: share with ActiveRideSheet's getVehicleImage once that file's WIP lands.
const DEFAULT_VEHICLE_IMAGE = require("../../../../assets/images/ic_white_taxi.png");
const VEHICLE_IMAGES: Record<string, number> = {
  Bike: require("../../../../assets/images/ny_ic_bike_left_side.png"),
  Auto: require("../../../../assets/images/ny_ic_auto.png"),
};
const MAX_PLATE_WIDTH = 150;
const AVATAR_SIZE = 56;

type Props = {
  avatarUrl: string | null;
  driverName: string;
  ratingLabel: string;
  plate: string;
  vehicleType: string | null;
  vehicleColor: string | null;
  phone: string | null;
};

function DriverCardBase({
  avatarUrl,
  driverName,
  ratingLabel,
  plate,
  vehicleType,
  vehicleColor,
  phone,
}: Props) {
  const { colors, fonts } = useAppTheme();
  const [plateWidth, setPlateWidth] = useState(0);

  const onPlateLayout = useCallback((e: LayoutChangeEvent) => {
    setPlateWidth(Math.min(MAX_PLATE_WIDTH, e.nativeEvent.layout.width));
  }, []);
  const onCall = useCallback(() => makePhoneCall(phone), [phone]);

  const vehicleLine = [vehicleColor, vehicleType].filter(Boolean).join(" ");
  const vehicleImage =
    (vehicleType && VEHICLE_IMAGES[vehicleType]) || DEFAULT_VEHICLE_IMAGE;

  return (
    <RnView style={[styles.card, { backgroundColor: colors.bg_50 }]}>
      <RnView style={styles.row}>
        <RnView>
          <Avatar onLoad={noop} avatar={avatarUrl ?? ""} size={AVATAR_SIZE} />
          <RnView style={[styles.rating, { backgroundColor: colors.bg_100 }]}>
            <RnText style={[atoms.text_2xs, { color: colors.text }]}>
              {ratingLabel}
            </RnText>
            <Icon name="Star" size={12} color={colors.green_500} />
          </RnView>
        </RnView>
        <RnView style={styles.identity}>
          <RnText
            numberOfLines={1}
            style={[
              atoms.text_md,
              { color: colors.text, fontFamily: fonts.heavy.fontFamily },
            ]}
          >
            {driverName}
          </RnText>
          <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
            is your driver{vehicleLine ? ` · ${vehicleLine}` : ""}
          </RnText>
        </RnView>
        {phone ? (
          <PressableScale
            onPress={onCall}
            accessibilityRole="button"
            accessibilityLabel={`Call ${driverName}`}
            style={[styles.call, { backgroundColor: colors.bg_100 }]}
          >
            <Icon name="PhoneCall" size={20} color={colors.primary_400} />
          </PressableScale>
        ) : null}
      </RnView>

      <RnView style={styles.row}>
        <RnView onLayout={onPlateLayout} style={styles.plate}>
          {plateWidth > 0 ? (
            <NumberPlate
              plateNumber={plate}
              width={plateWidth}
              fontPath={PLATE_FONT}
            />
          ) : null}
        </RnView>
        <Image
          source={vehicleImage}
          contentFit="contain"
          cachePolicy="memory-disk"
          style={styles.vehicle}
          accessibilityIgnoresInvertColors
        />
      </RnView>
    </RnView>
  );
}

const noop = () => {};

export const DriverCard = memo(DriverCardBase);

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: space.lg, gap: space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  identity: { flex: 1, gap: space._2xs },
  rating: {
    position: "absolute",
    bottom: -6,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  call: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  plate: { flex: 1, maxWidth: MAX_PLATE_WIDTH },
  vehicle: { width: 100, height: 50, marginLeft: "auto" },
});
