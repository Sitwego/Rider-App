import { TrueSheet } from "@lodev09/react-native-true-sheet";
import {
  ReanimatedTrueSheet,
  useReanimatedTrueSheet,
} from "@lodev09/react-native-true-sheet/reanimated";
import { Image } from "expo-image";
import { PressableScale as Pressable } from "pressto";
import * as React from "react";
import { Linking, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  WithSpringConfig,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import PickupToDestination from "~/components/PickUp_DropOff_Indicator";
import NumberPlate from "~/components/Platenumber";
import WaitingTimer from "~/components/WaitingTimer";
import { useCancelRideRequest } from "~/hooks/api";
import {
  useActiveRideState,
  useActiveRide,
} from "~/providers/ActiveRideProvider";
import { s } from "~/styles/Common-Styles";
import { height } from "~/utils/dimensions";
import { googleMapsNavigationLink } from "~/utils/geo";
import { makePhoneCall } from "~/utils/linking";
import { formatPrice } from "~/utils/math/numbers";
import { autoFormatDuration } from "~/utils/math/times";
import { createProfileImageUrl } from "~/utils/url";

import Avatar from "../Avatar";
import RnText from "../RnText";
import { RnAnimatedView, RnView } from "../RnView";
import { useAppTheme } from "../theme";
import { atoms } from "../theme/atoms";

export const SPRING_CONFIG: WithSpringConfig = {
  damping: 500,
  stiffness: 1000,
  mass: 3,
  overshootClamping: true,
};

export interface Props {
  children: React.ReactNode;
}

const ActiveRideRequestSheet = React.forwardRef<ActionSheetACTRef, Props>(
  ({ children }, ref) => {
    const { setActiveRideState } = useActiveRide();
    const { mutateAsync: cancelRideAsync } = useCancelRideRequest();
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const activeRideSheetRef = React.useRef<TrueSheet>(null);
    const convoSheetRef = React.useRef<TrueSheet>(null);
    const { rideData, ride_status } = useActiveRideState();
    const { animatedPosition } = useReanimatedTrueSheet();

    const [plateWidth, setPlateWidth] = React.useState(0);
    const [sheetMounted, setSheetMounted] = React.useState(false);

    const fabAnimatedStyle = useAnimatedStyle(() => {
      const y = -(height - animatedPosition.value);
      const opacity = interpolate(y, [-550, -650], [1, 0], Extrapolation.CLAMP);
      const scale = interpolate(y, [-550, -650], [1, 0.5], Extrapolation.CLAMP);
      const translateY =
        y + interpolate(y, [-550, -650], [0, 56 * 0.2], Extrapolation.CLAMP);

      return {
        opacity,
        transform: [{ scale }, { translateY }],
      };
    });

    const _open = React.useCallback(async () => {
      try {
        await activeRideSheetRef.current?.present(0);
      } catch {}
    }, []);

    const _close = React.useCallback(async () => {
      try {
        await activeRideSheetRef.current?.dismiss();
      } catch {}
    }, []);

    React.useImperativeHandle(
      ref,
      () => ({
        open: _open,
        close: _close,
      }),
      [_close, _open],
    );

    const derived = React.useMemo(() => {
      if (!rideData) return null;
      return {
        license_plate: rideData.plate_number || "N/A",
        to_pickup_duration: autoFormatDuration(
          rideData.estimated_duration_to_pickup ?? 0,
        ),
        driver_name: `${rideData.first_name} ${rideData.last_name}`,
        driver_rating: rideData.rating || 0,
        fare: formatPrice(rideData.fare || 0),
        ride_duration: autoFormatDuration(rideData.estimated_duration || 0),
        driver_image: rideData.face_image_id,
        driver_id: rideData?.driver_id as string,
      };
    }, [rideData]);

    const driverImageUrl = React.useMemo(() => {
      if (!derived) return null;
      return createProfileImageUrl(
        derived.driver_id,
        //@ts-ignore
        derived.driver_image,
        "get-profile-image",
      );
    }, [derived]);

    const cancelRide = React.useCallback(async () => {
      if (!rideData) return;
      await _close();
      try {
        await cancelRideAsync({
          note: "User cancelled",
          reason: "changed mind",
        });
      } catch (err) {
        console.error("Error cancelling ride:", err);
      }
      setActiveRideState({ type: "REMOVE-RIDE" });
    }, [_close, cancelRideAsync, rideData, setActiveRideState]);

    const _onCallButtonPress = React.useCallback(() => {
      makePhoneCall(rideData?.phone);
    }, [rideData?.phone]);

    const _onMessageButtonPress = React.useCallback(async () => {
      try {
        await convoSheetRef.current?.present();
      } catch {}
    }, []);

    React.useEffect(() => {
      if (!rideData) {
        _close();
      }
    }, [_close, rideData]);

    return (
      <React.Fragment>
        {children}
        {sheetMounted && !!rideData && (
          <RnAnimatedView
            style={[
              fabAnimatedStyle,
              {
                position: "absolute",
                height: 56,
                flexDirection: "row",
                justifyContent: "space-between",
                alignSelf: "center",
                bottom: 0,
                flex: 1,
                width: "90%",
                backgroundColor: colors.transparent,
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 4,
              },
            ]}
          >
            <Pressable
              style={[
                s.py4,
                s.px10,
                s.alignCenter,
                s.justifyCenter,
                s.borderRadius_md,
                { backgroundColor: colors.gray_100 },
              ]}
              onPress={() => {
                if (!rideData?.to) return;
                const url = googleMapsNavigationLink({
                  lat: rideData.to.lat,
                  lng: rideData.to.lon,
                });
                Linking.openURL(url);
              }}
            >
              <Icon
                name="Navigation"
                size={24}
                color={colors.text}
                strokeWidth={2}
                style={[s.alignSelf, { marginRight: 6 }]}
              />
            </Pressable>
            {ride_status !== "Inprogress" && (
              <RnView
                style={[
                  s.flexDirectionRow,
                  atoms.gap_lg,
                  s.borderRadius_md,
                  {
                    backgroundColor: colors.gray_100,
                    paddingHorizontal: 6,
                    paddingVertical: 4,
                  },
                ]}
              >
                <RnText style={[atoms.text_md, { color: colors.text }]}>
                  OTP
                </RnText>
                <RnText
                  style={[
                    atoms.text_lg,
                    { color: colors.text, letterSpacing: 2 },
                  ]}
                >
                  {rideData?.otp || "----"}
                </RnText>
              </RnView>
            )}
          </RnAnimatedView>
        )}
        <ReanimatedTrueSheet
          cornerRadius={16}
          detents={[0.5, 0.9]}
          dimmedDetentIndex={1}
          dimmed
          dismissible={false}
          backgroundColor={colors.background}
          ref={activeRideSheetRef}
          grabber={false}
          style={[{ paddingBottom: insets.bottom + 16 }, s.px10]}
          onMount={() => setSheetMounted(true)}
          onDidDismiss={() => setSheetMounted(false)}
        >
          <GestureHandlerRootView style={{ flexBasis: "100%", flexGrow: 1 }}>
            {/* Guard prevents NumberPlate (and other derived-dependent children) from
                receiving undefined props while the sheet is animating closed after
                rideData is cleared, which would cause a fatal JS crash. */}
            {sheetMounted && !!rideData && (
              <RnView
                style={[
                  {
                    paddingTop: 8,
                    flex: 1,
                    flexDirection: "column",
                  },
                  atoms.gap_lg,
                ]}
              >
                <RnView style={[{ width: "100%" }, s.mb10, atoms.gap_2xs]}>
                  {ride_status === "Inprogress" ? (
                    <RnText>
                      Thank you enjoy the ride to your destination🎉
                    </RnText>
                  ) : ride_status === "Arrived" ? (
                    <RnText style={[atoms.text_xs]}>
                      Your driver arrived at the pickup location. Please be
                      there within 5 minutes
                    </RnText>
                  ) : (
                    <RnText>
                      Your ride is {derived?.to_pickup_duration} away
                    </RnText>
                  )}
                </RnView>
                {/* Rider status */}
                <RnView
                  style={[
                    {
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    },
                  ]}
                >
                  <RnView
                    onLayout={(e) => setPlateWidth(e.nativeEvent.layout.width)}
                    style={{ width: 150, alignSelf: "center" }}
                  >
                    {plateWidth > 0 && (
                      <NumberPlate
                        plateNumber={derived?.license_plate as string}
                        width={plateWidth}
                        fontPath={require("../../../assets/fonts/ConfigAltBold.ttf")}
                      />
                    )}
                  </RnView>
                  <RnView
                    style={[
                      {
                        width: 100,
                        height: 50,
                      },
                    ]}
                  >
                    <Image
                      source={require("../../../assets/images/ic_white_taxi.png")}
                      style={{ flex: 1, height: null, width: null }}
                      contentFit="cover"
                      accessible={true}
                      accessibilityIgnoresInvertColors
                      accessibilityLabel={""}
                    />
                  </RnView>
                </RnView>
                {(ride_status === "Arrived" || ride_status === "Inprogress") &&
                  rideData?.actual_arrival_time && (
                    <WaitingTimer
                      arrivalTime={rideData.actual_arrival_time}
                      frozenElapsed={rideData.frozen_wait_elapsed}
                    />
                  )}
                {/* <WaitingTimer arrivalTime={1773801225123} /> */}

                <RnView
                  style={[
                    s.flexDirectionRow,
                    { justifyContent: "space-between" },
                  ]}
                >
                  <RnView
                    style={[s.flexDirectionRow, atoms.gap_sm, s.alignCenter]}
                  >
                    <RnView
                      style={[
                        {
                          width: 60,
                          height: 60,
                          borderRadius: 30,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Avatar
                        onLoad={() => {}}
                        avatar={driverImageUrl ?? ""}
                        size={60}
                      />
                      <RnView
                        style={[
                          s.flexDirectionRow,
                          atoms.gap_2xs,
                          {
                            position: "absolute",
                            bottom: -2,
                            backgroundColor: colors.gray,
                            paddingHorizontal: 4,
                            paddingVertical: 2,
                            borderRadius: 20,
                            alignSelf: "center",
                          },
                        ]}
                      >
                        <RnText style={[atoms.text_2xs]}>
                          {derived?.driver_rating.toFixed(1)}
                        </RnText>
                        <Icon
                          name="Star"
                          size={16}
                          strokeWidth={2}
                          color={colors.green_500}
                        />
                      </RnView>
                    </RnView>
                    <RnText style={[{ color: colors.gray }, atoms.text_xs]}>
                      {derived?.driver_name}
                    </RnText>
                  </RnView>
                  <RnView style={[s.flexDirectionRow, atoms.gap_2xl]}>
                    <Pressable
                      onPress={_onCallButtonPress}
                      style={[atoms.p_xs, { alignItems: "center" }]}
                    >
                      <Icon
                        name="PhoneCall"
                        size={24}
                        color={colors.primary_400}
                        strokeWidth={2}
                      />
                    </Pressable>
                    <Pressable
                      onPress={_onMessageButtonPress}
                      style={[atoms.p_xs, { alignItems: "center" }]}
                    >
                      <Icon
                        name="MessageCircle"
                        size={24}
                        color={colors.green_500}
                        strokeWidth={2}
                        style={{ marginLeft: 8 }}
                      />
                      <RnView
                        style={[
                          {
                            position: "absolute",
                            top: 0,
                            right: 5,
                            width: 16,
                            height: 16,
                            borderRadius: 8,
                            justifyContent: "center",
                            alignItems: "center",
                          },
                        ]}
                      >
                        <Icon
                          name="Dot"
                          size={40}
                          color={colors.red_500}
                          strokeWidth={2}
                        />
                      </RnView>
                    </Pressable>
                  </RnView>
                </RnView>
                <RnView style={[s.flexDirectionRow, s.spaceBetween]}>
                  <RnView style={[s.flexCol, atoms.gap_sm]}>
                    <RnView
                      style={[s.flexDirectionRow, s.alignCenter, atoms.gap_xs]}
                    >
                      <RnText>Fare Estimate</RnText>
                      <Icon
                        name="Info"
                        size={20}
                        color={colors.gray}
                        strokeWidth={2}
                      />
                    </RnView>
                    <RnText style={{ color: colors.text, fontSize: 14 }}>
                      KES {derived?.fare}
                    </RnText>
                  </RnView>
                  <RnView style={[s.flexDirectionRow, atoms.gap_xs]}>
                    <Icon
                      name="HandCoins"
                      size={24}
                      color={colors.green_500}
                      strokeWidth={3}
                    />
                    <RnText style={[atoms.text_xs, { color: colors.gray }]}>
                      Pay by Cash
                    </RnText>
                  </RnView>
                </RnView>
                <RnView
                  style={[
                    {
                      padding: 4,
                      borderRadius: 8,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderColor: colors.gray,
                      borderWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <PickupToDestination
                    height={70}
                    from={{
                      city: rideData?.from?.city,
                      street: rideData?.from?.street,
                      ward: rideData?.from?.ward,
                      country: rideData?.from?.country as string,
                    }}
                    to={{
                      city: rideData?.to?.city,
                      street: rideData?.to?.street,
                      ward: rideData?.to?.ward,
                      country: rideData?.to?.country as string,
                    }}
                    distance={`${rideData?.estimated_distance?.toFixed(1)} Km`}
                    duration={derived?.ride_duration}
                  />
                </RnView>
                <RnView
                  style={[
                    s.flex1,
                    s.justifyFlexEnd,
                    { paddingBottom: insets.bottom + 100 },
                  ]}
                >
                  {ride_status === "Inprogress" ? (
                    <Pressable
                      style={[s.p16, s.alignSelf, s.borderRadius_md]}
                      onPress={() => {}}
                    >
                      <RnText
                        style={[{ color: colors.primary_400 }, atoms.text_md]}
                      >
                        Share Ride
                      </RnText>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={cancelRide}
                      style={[s.p16, s.alignSelf, s.borderRadius_md]}
                    >
                      <RnText
                        style={[{ color: colors.red_500 }, atoms.text_md]}
                      >
                        Cancel Ride
                      </RnText>
                    </Pressable>
                  )}
                </RnView>
              </RnView>
            )}
          </GestureHandlerRootView>
          {/* <ConversationsSheet ref={convoSheetRef} /> */}
        </ReanimatedTrueSheet>
      </React.Fragment>
    );
  },
);

export default ActiveRideRequestSheet;

export interface ActionSheetACTRef {
  open: () => Promise<void>;
  close: () => Promise<void>;
}

ActiveRideRequestSheet.displayName = "ActiveRideRequestSheet";
