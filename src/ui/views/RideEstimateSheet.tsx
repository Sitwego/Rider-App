import { TrueSheet } from "@lodev09/react-native-true-sheet";
import { ReanimatedTrueSheet } from "@lodev09/react-native-true-sheet/reanimated";
import { useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  FlatList,
  ActivityIndicator,
  ListRenderItemInfo,
  Pressable as RNPressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import { useSendRideRequest } from "~/hooks/api";
import { useActiveRide } from "~/providers/ActiveRideProvider";
import { useLoadingSheet } from "~/providers/LoadingSheetProvider";
import {
  useRideSearchState,
  useRideRequsetMoadal,
} from "~/providers/RideBookingModalProvider";
import { s } from "~/styles/Common-Styles";
import { EstimatesType } from "~/types/searchDataType";
import { delay } from "~/utils/delay";
import { height } from "~/utils/dimensions";

import RnText from "../RnText";
import { RnView } from "../RnView";
import { useAppTheme } from "../theme";
import { atoms } from "../theme/atoms";

type ItemType = {
  item: EstimatesType;
  onCategorySelect: (id: string) => void;
  selected: boolean;
};
type CategoriesType =
  | "Swift"
  | "Standard"
  | "Comfort"
  | "Xl"
  | "Bike"
  | "Executive";

const CATEGORY_IMAGES: Record<CategoriesType, number> = {
  Swift: require("../../../assets/images/swift_ca_ic.png"),
  Standard: require("../../../assets/images/stardand_ca_ic.png"),
  Comfort: require("../../../assets/images/comfort_ca_ic.png"),
  Xl: require("../../../assets/images/xl_ca_ic.png"),
  Bike: require("../../../assets/images/ny_ic_bike_left_side.png"),
  Executive: require("../../../assets/images/excutive_ca_ic.png"),
};

const RenderItem = memo(({ item, onCategorySelect, selected }: ItemType) => {
  const { colors } = useAppTheme();
  const categoryImage =
    CATEGORY_IMAGES[item.category as CategoriesType] ??
    CATEGORY_IMAGES["Swift"];
  return (
    <RNPressable
      onPress={() => onCategorySelect(item.category)}
      style={({ pressed }) => [
        _styles.ITEM_container,
        {
          borderColor:
            pressed || selected ? colors.green_500 : colors.background,
        },
      ]}
    >
      <RnView style={[_styles.START_item, atoms.gap_lg]}>
        <RnView style={[_styles.CAR_iconImage, s.justifyCenter]}>
          <Image
            contentFit="contain"
            cachePolicy="memory-disk"
            source={categoryImage}
            style={[s.flex1, { width: null, height: null }]}
          />
        </RnView>
        <RnView style={[{ flexDirection: "column" }, atoms.gap_sm]}>
          <RnText>{item.category}</RnText>
          <RnView style={[{ flexDirection: "row", alignItems: "center" }]}>
            <RnView
              style={[
                {
                  flexDirection: "row",
                  alignItems: "center",
                },
              ]}
            >
              <Icon
                name="User"
                size={14}
                color={colors.gray_50}
                strokeWidth={1}
              />
              <RnText style={[atoms.text_2xs, { color: colors.gray_50 }]}>
                6
              </RnText>
            </RnView>
            <Icon name="Dot" color={colors.gray_50} size={14} strokeWidth={2} />
            <RnText style={[atoms.text_2xs, { color: colors.gray_100 }]}>
              Ac, Extra Spacious
            </RnText>
          </RnView>
        </RnView>
      </RnView>
      <RnView>
        <RnText style={[atoms.text_sm]}>Ksh {item.final_fare}</RnText>
      </RnView>
    </RNPressable>
  );
});
RenderItem.displayName = "RenderItem";

export interface RideEstimatesSheetHandle {
  show: () => Promise<void>;
  hide: () => Promise<void>;
}

interface Props {
  children: React.ReactNode;
}

export const RideEstimatesSheet = forwardRef<RideEstimatesSheetHandle, Props>(
  ({ children }, ref) => {
    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    const sheetRef = useRef<TrueSheet>(null);
    const flatListRef = useRef<FlatList<EstimatesType>>(null);
    const [sheetIdx, setSheetidx] = useState<number | undefined>();
    const [selectedId, setSelectedId] = useState<string>();
    const rideSearchState = useRideSearchState();
    const { dispatchRideSearchState } = useRideRequsetMoadal();
    const navigation = useNavigation();
    const loadingSheet = useLoadingSheet();
    const { setActiveRideState } = useActiveRide();
    const { mutateAsync: sendRideRequest } = useSendRideRequest();

    const hide = useCallback(async () => {
      try {
        await sheetRef.current?.dismiss();
      } catch {}
    }, []);

    const show = useCallback(async () => {
      if (sheetRef.current) {
        await delay(300);
        try {
          await sheetRef.current.present(sheetIdx);
        } catch {}
      }
    }, [sheetIdx]);

    const _onCategorySelect = useCallback(
      (id: string) => {
        if (sheetIdx !== 1) {
          sheetRef.current?.resize(1);
        }
        setSelectedId(id);
      },
      [sheetIdx],
    );

    useImperativeHandle(ref, () => ({ show, hide }));

    const _renderItem = useCallback(
      ({ item }: ListRenderItemInfo<EstimatesType>) => (
        <RenderItem
          selected={selectedId === item.category}
          onCategorySelect={_onCategorySelect}
          item={item}
        />
      ),
      [_onCategorySelect, selectedId],
    );

    const _keyExtractor = useCallback(
      (item: EstimatesType) => item.category,
      [],
    );

    const _onDismiss = useCallback(() => {
      if (navigation.canGoBack()) {
        dispatchRideSearchState({ type: "REMOVE-SEARCH-RESULTS" });
        navigation.goBack();
      }
    }, [dispatchRideSearchState, navigation]);

    const _onSendRequest = useCallback(async () => {
      if (!rideSearchState.searchData?.estimates || !selectedId) return;
      await hide();
      loadingSheet.show();
      const data = await sendRideRequest({ selected: selectedId });
      if (data.resp) {
        setActiveRideState({
          type: "SET-RIDE-STATUS-UPDATE-KEYS",
          data: data.resp,
        });
      }
      _onDismiss();
    }, [
      _onDismiss,
      hide,
      loadingSheet,
      rideSearchState.searchData?.estimates,
      selectedId,
      sendRideRequest,
      setActiveRideState,
    ]);

    const _onMount = useCallback(() => {
      setSheetidx(1);
    }, []);

    const renderFooter = useCallback(
      () => (
        <RNPressable
          onPress={_onSendRequest}
          disabled={!selectedId}
          style={[
            s.p16,
            s.w100pct,
            s.alignSelf,
            s.justifyCenter,
            s.alignCenter,
            {
              backgroundColor: selectedId ? colors.primary : colors.bg_600,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
            },
          ]}
        >
          <RnText>
            {selectedId ? `Request ${selectedId}` : "Select a ride"}
          </RnText>
        </RNPressable>
      ),
      [_onSendRequest, colors.bg_600, colors.primary, selectedId],
    );

    const searchData = rideSearchState.searchData;

    return (
      <>
        {children}
        <ReanimatedTrueSheet
          ref={sheetRef}
          cornerRadius={12}
          scrollable
          detents={[0.56, 0.75]}
          dimmed={!rideSearchState.findingEstimates}
          dimmedDetentIndex={rideSearchState.findingEstimates ? 0 : 1}
          backgroundColor={colors.background}
          onDidDismiss={_onDismiss}
          onMount={_onMount}
          grabber
          grabberOptions={{ color: colors.bg_600 }}
          style={[s.bottomSheetContainer, { marginBottom: insets.bottom }]}
          footer={renderFooter}
          footerStyle={[s.w100pct, { paddingBottom: insets.bottom }]}
        >
          <RnView style={{ flexGrow: 1, flexBasis: "100%" }}>
            {rideSearchState.findingEstimates ? (
              <RnView style={[s.alignCenter, s.flex1, atoms.p_5xl]}>
                <RnText
                  style={[atoms.text_2xs, s.textCenter, { color: colors.gray }]}
                >
                  Finding Ride Estimates
                </RnText>
                <ActivityIndicator size={24} color={colors.text} />
              </RnView>
            ) : (
              <>
                <RnView style={[_styles.HEADER_container]}>
                  <RnText>Select a ride category</RnText>
                  <RnView
                    style={[
                      atoms.gap_2xs,
                      { flexDirection: "row", alignItems: "center" },
                    ]}
                  >
                    <RnText style={[atoms.text_xs, { color: colors.gray_100 }]}>
                      {searchData?.distance} Km
                    </RnText>
                    <Icon
                      name="Dot"
                      size={16}
                      strokeWidth={2}
                      color={colors.gray_50}
                    />
                    <RnText style={[atoms.text_xs, { color: colors.gray_100 }]}>
                      {searchData?.duration[0]} {searchData?.duration[1]}
                    </RnText>
                  </RnView>
                </RnView>
                <RnView style={{ flex: 1, height: height * 0.2 }}>
                  <FlatList<EstimatesType>
                    ref={flatListRef}
                    nestedScrollEnabled
                    data={searchData?.estimates}
                    keyExtractor={_keyExtractor}
                    initialNumToRender={6}
                    contentContainerStyle={{ paddingBottom: 56, gap: 2 }}
                    renderItem={_renderItem}
                  />
                </RnView>
              </>
            )}
          </RnView>
        </ReanimatedTrueSheet>
      </>
    );
  },
);
RideEstimatesSheet.displayName = "RideEstimatesSheet";

const _styles = StyleSheet.create({
  HEADER_container: {
    alignSelf: "center",
    alignItems: "center",
    flexDirection: "column",
    paddingVertical: 8,
  },
  ITEM_container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    height: 70,
    borderWidth: StyleSheet.hairlineWidth + 1,
    borderRadius: 8,
  },
  START_item: {
    flexDirection: "row",
    alignItems: "center",
  },
  CAR_iconImage: {
    width: 80,
    height: 60,
    borderRadius: 6,
  },
});
