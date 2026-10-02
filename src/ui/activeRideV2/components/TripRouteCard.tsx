import { memo } from "react";
import { StyleSheet } from "react-native";

import PickupToDestination, {
  type FromToLocationType,
} from "~/components/PickUp_DropOff_Indicator";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { space } from "~/ui/theme/tokens";

import type { LocationInfo } from "~/types/loactionAddress";

type Props = {
  from: LocationInfo | undefined;
  to: LocationInfo | undefined;
  distanceLabel: string;
  tripDuration: string;
};

const toFromTo = (place: LocationInfo | undefined): FromToLocationType => ({
  city: place?.city,
  street: place?.street,
  ward: place?.ward,
  country: place?.country ?? undefined,
});

function TripRouteCardBase({ from, to, distanceLabel, tripDuration }: Props) {
  const { colors } = useAppTheme();
  return (
    <RnView style={[styles.card, { backgroundColor: colors.bg_50 }]}>
      <PickupToDestination
        height={70}
        from={toFromTo(from)}
        to={toFromTo(to)}
        distance={distanceLabel}
        duration={tripDuration}
      />
    </RnView>
  );
}

export const TripRouteCard = memo(TripRouteCardBase);

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: space.md },
});
