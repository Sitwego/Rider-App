import { TabActions } from "@react-navigation/native";
import { PressableScale } from "pressto";
import { memo, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  ListRenderItem,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import { RideHistoryRide, useRideHistory } from "~/hooks/api";
import { useRideRequsetMoadal } from "~/providers/RideBookingModalProvider";
import { s } from "~/styles/Common-Styles";

import RnText from "../RnText";
import { RnView } from "../RnView";
import { useAppTheme } from "../theme";
import { atoms } from "../theme/atoms";

// ─── Types ────────────────────────────────────────────────────────────────────

type MonthHeaderItem = {
  type: "month-header";
  label: string;
  total_spent: number;
};

type RideItem = {
  type: "ride";
  data: RideHistoryRide;
};

type HistoryListItem = MonthHeaderItem | RideItem;

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVE_SECTION_HEIGHT = Dimensions.get("window").height * 0.45;

// Hoisted static styles — created once, never recreated on render
const ls = StyleSheet.create({
  rideRow: {
    width: "100%",
    justifyContent: "space-between",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  separator: {
    height: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  rateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
  },
  activeLabel: {
    position: "absolute",
    top: 0,
    left: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 4,
  },
});

// Pure helper — outside component so it is never recreated
function resolveStatusColor(
  status: string,
  green: string,
  red: string,
  fallback: string,
): string {
  switch (status.toLowerCase()) {
    case "completed":
      return green;
    case "cancelled":
      return red;
    default:
      return fallback;
  }
}

// ─── Item components (memo = skip re-render when props are unchanged) ─────────

// Defined outside the screen so the reference is always stable
const ItemSeparator = () => <RnView style={ls.separator} />;

type MonthHeaderRowProps = {
  label: string;
  total_spent: number;
  boldFont: string;
  dividerColor: string;
};

const MonthHeaderRow = memo(function MonthHeaderRow({
  label,
  total_spent,
  boldFont,
  dividerColor,
}: MonthHeaderRowProps) {
  return (
    <>
      <RnView style={[ls.divider, { backgroundColor: dividerColor }]} />
      <RnView style={ls.monthHeader}>
        <RnText style={atoms.text_sm}>{label}</RnText>
        <RnText style={[atoms.text_sm, { fontFamily: boldFont }]}>
          Ksh {total_spent.toLocaleString()}
        </RnText>
      </RnView>
    </>
  );
});

type RideRowProps = {
  ride: RideHistoryRide;
  onPress: (rideId: string) => void;
  onRateDriver: (rideId: string, driverId: string) => void;
  textColor: string;
  statusColor: string;
  rateColor: string;
  boldFont: string;
  regularFont: string;
};

const RideRow = memo(function RideRow({
  ride,
  onPress,
  onRateDriver,
  textColor,
  statusColor,
  rateColor,
  boldFont,
  regularFont,
}: RideRowProps) {
  // Handlers live inside the item so the parent renderItem stays arrow-free
  const handlePress = useCallback(
    () => onPress(ride.ride_id),
    [onPress, ride.ride_id],
  );
  const handleRate = useCallback(
    () => onRateDriver(ride.ride_id, ride.driver_id),
    [onRateDriver, ride.ride_id, ride.driver_id],
  );

  return (
    <PressableScale style={[ls.rideRow, s.px4]} onPress={handlePress}>
      <RnView style={[s.flexDirectionRow, s.gap16]}>
        <Icon strokeWidth={2} color={textColor} size={28} name="CarTaxiFront" />
        <RnView style={[s.flexCol, s.gap2]}>
          <RnText
            numberOfLines={1}
            style={[atoms.text_xs, { fontFamily: regularFont }]}
          >
            {ride.destination_name}
          </RnText>
          <RnText style={[atoms.text_2xs, { color: statusColor }]}>
            {ride.status}
          </RnText>
          {!ride.has_rated_driver && (
            <PressableScale
              style={[ls.rateButton, { borderColor: rateColor }]}
              onPress={handleRate}
            >
              <Icon name="Star" size={12} color={rateColor} strokeWidth={2} />
              <RnText style={[atoms.text_2xs, { color: rateColor }]}>
                Rate Driver
              </RnText>
            </PressableScale>
          )}
        </RnView>
      </RnView>
      <RnView style={[s.flexDirectionRow, s.alignCenter, s.gap12]}>
        <RnText style={[atoms.text_xs, { fontFamily: boldFont }]}>
          Ksh {ride.amount.toLocaleString()}
        </RnText>
        <Icon name="ChevronRight" size={28} color={textColor} strokeWidth={2} />
      </RnView>
    </PressableScale>
  );
});

// ─── List header (memo = only re-renders when its own props change) ───────────

type ActiveRideHeaderProps = {
  goToHome: () => void;
  textColor: string;
  green600: string;
  heavyFont: string;
};

const ActiveRideHeader = memo(function ActiveRideHeader({
  goToHome,
  textColor,
  green600,
  heavyFont,
}: ActiveRideHeaderProps) {
  return (
    <>
      <RnView style={[s.w100pct, { height: ACTIVE_SECTION_HEIGHT }]}>
        <RnView style={[s.justifyCenter, s.centerItem, s.flex1]}>
          <RnView style={ls.activeLabel}>
            <RnText style={[atoms.text_lg, { fontFamily: heavyFont }]}>
              Active
            </RnText>
          </RnView>
          <RnView style={[s.centerItem, s.mb20, s.gap12]}>
            <Icon
              name="CalendarDays"
              color={textColor}
              size={50}
              strokeWidth={3}
            />
            <RnView style={s.alignSelf}>
              <RnText style={[atoms.text_sm, s.textCenter]}>
                No upcoming trips yet
              </RnText>
              <RnText style={s.textCenter}>
                Reserve for extra peace of mind
              </RnText>
            </RnView>
          </RnView>
          <PressableScale
            style={[s.flexDirectionRow, s.gap8, s.alignSelf]}
            onPress={goToHome}
          >
            <Icon name="Plus" color={green600} strokeWidth={2} size={24} />
            <RnText style={[atoms.text_md, { color: green600 }]}>
              Book a ride
            </RnText>
          </PressableScale>
        </RnView>
      </RnView>
      <RnView style={[s.flexDirectionRow, s.alignCenter, s.gap8, s.mb10]}>
        <RnText>History</RnText>
      </RnView>
    </>
  );
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export const RiderHistoryScreen: React.FC<any> = (props) => {
  const { colors, fonts } = useAppTheme();

  // Primitive values — stable across renders unless the theme actually changes.
  // Using these (not the `colors` object) in dep arrays prevents renderItem
  // from being recreated every render when the context returns a new object ref.
  const textColor = colors.text;
  const green600 = colors.green_600;
  const red400 = colors.red_400;
  const bg100 = colors.bg_100;
  const boldFont = fonts.bold.fontFamily;
  const regularFont = fonts.regular.fontFamily;
  const heavyFont = fonts.heavy.fontFamily;

  const insets = useSafeAreaInsets();
  const { showModal } = useRideRequsetMoadal();
  const navigation = props.navigation;

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
  } = useRideHistory();

  const onPressRide = useCallback(
    (rideId: string) => {
      props.navigation?.push("RideDetailsScreen", { ride_id: rideId });
    },
    [props.navigation],
  );

  const onRateDriver = useCallback(
    (rideId: string, driverId: string) => {
      props.navigation?.push("RatingScreen", { rideId, driverId });
    },
    [props.navigation],
  );

  const jumpToHome = useMemo(() => TabActions.jumpTo("MapPinHouse"), []);

  const goToHome = useCallback(() => {
    showModal();
    navigation.dispatch(jumpToHome);
  }, [showModal, navigation, jumpToHome]);

  // Flatten pages → mixed header + ride items for FlatList
  const listData = useMemo<HistoryListItem[]>(() => {
    if (!data) return [];
    return data.pages.flatMap((page) =>
      page.flatMap((group) => [
        {
          type: "month-header",
          label: group.label,
          total_spent: group.total_spent,
        } as MonthHeaderItem,
        ...group.rides.map(
          (ride) => ({ type: "ride", data: ride }) as RideItem,
        ),
      ]),
    );
  }, [data]);

  // Stable renderItem — only recreated when primitive color/font values change
  const renderItem = useCallback<ListRenderItem<HistoryListItem>>(
    ({ item }) => {
      if (item.type === "month-header") {
        return (
          <MonthHeaderRow
            label={item.label}
            total_spent={item.total_spent}
            boldFont={boldFont}
            dividerColor={bg100}
          />
        );
      }
      return (
        <RideRow
          ride={item.data}
          onPress={onPressRide}
          onRateDriver={onRateDriver}
          textColor={textColor}
          statusColor={resolveStatusColor(
            item.data.status,
            green600,
            red400,
            textColor,
          )}
          rateColor={green600}
          boldFont={boldFont}
          regularFont={regularFont}
        />
      );
    },
    [
      bg100,
      boldFont,
      green600,
      red400,
      regularFont,
      textColor,
      onPressRide,
      onRateDriver,
    ],
  );

  const keyExtractor = useCallback(
    (item: HistoryListItem, index: number) =>
      item.type === "ride"
        ? item.data.ride_id
        : `header-${item.label}-${index}`,
    [],
  );

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Memoized so the footer element is not recreated every render
  const ListFooter = useMemo(
    () =>
      isFetchingNextPage ? (
        <ActivityIndicator color={green600} style={s.py10} />
      ) : null,
    [isFetchingNextPage, green600],
  );

  // Stable component reference passed to FlatList — React controls re-renders
  const ListHeaderComponent = useCallback(
    () => (
      <ActiveRideHeader
        goToHome={goToHome}
        textColor={textColor}
        green600={green600}
        heavyFont={heavyFont}
      />
    ),
    [goToHome, textColor, green600, heavyFont],
  );

  return (
    <RnView style={[s.flex1, s.px16, { marginTop: insets.top + 16 }]}>
      <RnView>
        <RnText style={[atoms.text_xl, { fontFamily: heavyFont }]}>
          Rides History
        </RnText>
      </RnView>

      {isLoading ? (
        <RnView style={[s.flex1, s.centerItem]}>
          <ActivityIndicator color={green600} />
        </RnView>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={ListHeaderComponent}
          ListFooterComponent={ListFooter}
          onEndReached={onEndReached}
          refreshing={isRefetching}
          onRefresh={refetch}
          ItemSeparatorComponent={ItemSeparator}
          onEndReachedThreshold={0.5}
          // ─── Performance props ─────────────────────────────────────
          windowSize={10}
          maxToRenderPerBatch={15}
          initialNumToRender={15}
          updateCellsBatchingPeriod={25}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 150 }}
        />
      )}
    </RnView>
  );
};
