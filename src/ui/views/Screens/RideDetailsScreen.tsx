import { TrueSheet } from "@lodev09/react-native-true-sheet";
import { Image } from "expo-image";
import { icons as LucideIcons } from "lucide-react-native";
import { PressableScale } from "pressto";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
  Pressable,
} from "react-native";
import { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import RnMapView from "~/components/RnMaps";
import { MapPolyline } from "~/components/RnMaps/MapPolyline";
import { useDeleteRide, useRideDetails } from "~/hooks/api";
import { useRideRequsetMoadal } from "~/providers/RideBookingModalProvider";
import { s } from "~/styles/Common-Styles";
import Avatar from "~/ui/Avatar";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { formatPrice } from "~/utils/math/numbers";
import { createProfileImageUrl } from "~/utils/url";

import { type PlaceType } from "../../../../lib/placesTypes";

type IconName = keyof typeof LucideIcons;

// Static requires — hoisted so Metro never re-evaluates them on re-render
const PICKUP_ICON = require("../../../../assets/images/pickup_light.png");
const STOP_ICON = require("../../../../assets/images/stop-location.png");

export function RideDetailsScreen({
  navigation,
  route,
}: any): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useAppTheme();
  const rideId = route.params.ride_id;

  const { data, isLoading } = useRideDetails(rideId);
  const { mutate: deleteRide, isPending: isDeleting } = useDeleteRide();
  const helpSheetRef = useRef<TrueSheet>(null);
  const { dispatchRideSearchState } = useRideRequsetMoadal();

  const onRebook = useCallback(() => {
    if (!data) return;
    const confirmedPickup: PlaceType = {
      lat: data.from.lat,
      lng: data.from.lng,
      city: data.from.city ?? undefined,
      state: data.from.state ?? undefined,
      name: data.from.ward,
      address: data.from.ward,
      place_id: data.from.place_id ?? undefined,
    };
    const dropOff: PlaceType = {
      lat: data.to.lat,
      lng: data.to.lng,
      city: data.to.city ?? undefined,
      state: data.to.state ?? undefined,
      name: data.to.ward,
      address: data.to.ward,
      place_id: data.to.place_id ?? undefined,
    };
    dispatchRideSearchState({
      type: "SET-RIDE-SEARCH-RESULT",
      payload: { pickup: confirmedPickup, dropOff, findingEstimates: true },
    });
    navigation.navigate("RideFairEstimateScreen", {
      pickup: confirmedPickup,
      dropOff,
    });
  }, [data, dispatchRideSearchState, navigation]);

  const onPressHelp = useCallback(async () => {
    console.log("Help button pressed");
    try {
      await helpSheetRef.current?.present();
    } catch {}
  }, []);

  console.log("Ride details data:", data);

  const driverPhotoUrl = useMemo(() => {
    return createProfileImageUrl(
      data?.driver_id!,
      data?.driver.photo_id!,
      "get-profile-image",
    );
  }, [data?.driver.photo_id, data?.driver_id]);

  const mapRegion = useMemo(() => {
    if (!data?.from || !data?.to) return null;
    const midLat = (data.from.lat + data.to.lat) / 2;
    const midLng = (data.from.lng + data.to.lng) / 2;
    const latDelta = Math.max(
      Math.abs(data.from.lat - data.to.lat) * 2.5,
      0.01,
    );
    const lngDelta = Math.max(
      Math.abs(data.from.lng - data.to.lng) * 2.5,
      0.01,
    );
    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [data?.from, data?.to]);

  const formattedDate = data?.date
    ? new Date(data.date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: formattedDate,
      headerTitleStyle: {
        fontFamily: fonts.heavy.fontFamily,
        ...atoms.text_xl,
        color: colors.text,
      },
      headerStyle: {
        backgroundColor: colors.background,
        shadowColor: "transparent",
        borderBottomWidth: 1,
      },
      headerRight: () => <RideHistoryHeaderRight onHelpPress={onPressHelp} />,
    });
  }, [
    colors.background,
    colors.text,
    fonts.heavy.fontFamily,
    formattedDate,
    navigation,
    onPressHelp,
  ]);

  if (isLoading) {
    return (
      <RnView style={[s.flex1, s.centerItem]}>
        <ActivityIndicator color={colors.green_600} />
      </RnView>
    );
  }

  return (
    <RnView style={[s.flex1, { marginTop: 0 }]}>
      <ScrollView
        contentContainerStyle={[s.px16, { paddingBottom: 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {data?.status?.toLowerCase() === "cancelled" && (
          <RnView style={[s.px2, s.py10, s.mb20]}>
            <RnText style={[atoms.text_sm, { color: colors.red_500 }]}>
              Ride cancelled by driver
            </RnText>
          </RnView>
        )}
        {mapRegion && data?.from && data?.to && (
          <RnView style={ls.mapContainer}>
            <RnMapView
              region={mapRegion}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              style={ls.map}
            >
              <Marker
                coordinate={{
                  latitude: data.from.lat,
                  longitude: data.from.lng,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <Image
                  source={PICKUP_ICON}
                  style={ls.markerIcon}
                  contentFit="contain"
                />
              </Marker>
              <Marker
                coordinate={{ latitude: data.to.lat, longitude: data.to.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <Image
                  source={STOP_ICON}
                  style={ls.markerIcon}
                  contentFit="contain"
                />
              </Marker>
              <MapPolyline
                coordinates={[
                  { latitude: data.from.lat, longitude: data.from.lng },
                  { latitude: data.to.lat, longitude: data.to.lng },
                ]}
                strokeColor={colors.green_600}
                strokeWidth={3}
              />
            </RnMapView>
          </RnView>
        )}
        <RnView style={[s.w100pct, s.flexCol, s.centerItem, s.mb10, s.gap12]}>
          <RnView
            style={[
              s.w100pct,
              s.alignSelf,
              s.mt20,
              s.pb20,
              {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <PressableScale
              onPress={onRebook}
              style={[
                s.p16,
                s.centerItem,
                s.borderRadius_md,
                { backgroundColor: colors.green_300 },
              ]}
            >
              <RnText>Rebook</RnText>
            </PressableScale>
          </RnView>
          <RnView
            style={[
              s.w100pct,
              s.py5,
              s.pb10,
              s.mt20,
              {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <RnText style={[atoms.text_sm]}>Ride fare</RnText>
            <RnView style={[s.w100pct, s.flexDirectionRow, s.spaceBetween]}>
              <RnText style={[atoms.text_md]}>Total Fare</RnText>
              <RnView>
                <RnText style={[atoms.text_xl]}>
                  KSH {formatPrice(data?.total_fare ?? 0)}
                </RnText>
              </RnView>
            </RnView>
          </RnView>
          <RnView
            style={[
              s.w100pct,
              s.flexDirectionRow,
              s.spaceBetween,
              s.py5,
              s.pb10,
              s.mt20,
              {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <RnView style={[s.flexCol, s.gap4]}>
              <RnView style={[s.flexDirectionRow, s.gap8]}>
                <RnText style={[atoms.text_xl]}>{data?.driver?.name}</RnText>
                <RnText style={[atoms.text_xs]}>
                  <Icon
                    name="Star"
                    size={20}
                    strokeWidth={2}
                    color={colors.green_300}
                  />
                  {"   "}
                  {data?.driver?.rating.toFixed(2) ?? "—"}
                </RnText>
              </RnView>
              <RnText style={[atoms.text_sm, { color: colors.gray_500 }]}>
                {data?.ride_category ?? "—"}
              </RnText>
              <RnText
                style={[
                  atoms.text_md,
                  { fontFamily: fonts.regular.fontFamily },
                ]}
              >
                {data?.driver?.vehicle
                  ? `${data.driver.vehicle.make} ${data.driver.vehicle.model} - ${data.driver.vehicle.plate_number}`
                  : "—"}
              </RnText>
            </RnView>
            <Avatar
              size={65}
              onLoad={function (): void {}}
              avatar={driverPhotoUrl}
            />
          </RnView>
        </RnView>
      </ScrollView>

      <RnView
        style={[
          s.justifyFlexEnd,
          s.px16,
          { marginBottom: insets.bottom * 2.3 },
        ]}
      >
        <PressableScale
          style={[
            s.p16,
            s.borderRadius_sm,
            s.centerItem,
            { opacity: isDeleting ? 0.5 : 1 },
          ]}
          onPress={() => !isDeleting && deleteRide({ ride_id: rideId })}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={colors.red_300} />
          ) : (
            <RnText
              style={[atoms.text_sm, s.textCenter, { color: colors.red_300 }]}
            >
              Delete Ride
            </RnText>
          )}
        </PressableScale>
      </RnView>

      {/* ── Help sheet */}
      <TrueSheet
        ref={helpSheetRef}
        detents={["auto"]}
        backgroundColor={colors.background}
        grabber
        grabberOptions={{ color: colors.text }}
        cornerRadius={16}
        headerStyle={{ marginTop: 24 }}
        header={
          <View
            style={[
              s.px16,
              s.py10,
              s.centerItem,
              {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <RnText
              style={[
                atoms.text_lg,
                s.textCenter,
                { fontFamily: fonts.heavy.fontFamily, color: colors.text },
              ]}
            >
              Help &amp; Support
            </RnText>
          </View>
        }
      >
        <View style={[s.px16, s.py10, { paddingBottom: insets.bottom + 32 }]}>
          {HELP_ITEMS.map((item) => (
            <Pressable
              key={item.label}
              style={[
                s.flexDirectionRow,
                s.alignCenter,
                s.gap12,
                s.py16,
                s.px10,
                {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
              onPress={() => {
                console.log(item);
              }}
            >
              <Icon
                name={item.icon}
                size={20}
                color={colors.text}
                strokeWidth={1.5}
              />
              <RnText style={[atoms.text_sm, { color: colors.text }]}>
                {item.label}
              </RnText>
            </Pressable>
          ))}
        </View>
      </TrueSheet>
    </RnView>
  );
}

const HELP_ITEMS: { label: string; icon: IconName }[] = [
  { label: "Report an issue with this ride", icon: "TriangleAlert" },
  { label: "I was charged incorrectly", icon: "CircleDollarSign" },
  { label: "Lost an item", icon: "PackageSearch" },
  { label: "Contact support", icon: "Headphones" },
];

const ls = StyleSheet.create({
  mapContainer: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
  },
  map: {
    flex: 1,
  },
  markerIcon: {
    width: 32,
    height: 32,
  },
});

/**
 * A component to render headerRight button in RideHistoryScreen
 * @return React.JSX.Element
 */
export function RideHistoryHeaderRight({
  onHelpPress,
}: {
  onHelpPress: () => Promise<void>;
}): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <PressableScale onPress={onHelpPress} style={{ padding: 8 }}>
      <Icon
        name="MessageCircleQuestion"
        size={28}
        color={colors.text}
        strokeWidth={1.5}
      />
    </PressableScale>
  );
}
