import { TrueSheet } from "@lodev09/react-native-true-sheet";
import {
  ReanimatedTrueSheet,
  useReanimatedTrueSheet,
} from "@lodev09/react-native-true-sheet/reanimated";
import { Image } from "expo-image";
import { PressableScale as Pressable } from "pressto";
import * as React from "react";
import {
  Linking,
  Pressable as RNPressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
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
import { useBottomSheet } from "~/ui/BottomSheet";
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

import { CancelRideReasonsContent } from "./CancelRideReasonSheet";

import type { CancelReason } from "./CancelRideReasonSheet";

export const SPRING_CONFIG: WithSpringConfig = {
  damping: 500,
  stiffness: 1000,
  mass: 3,
  overshootClamping: true,
};

const FAB_HEIGHT = 56; // matches the FAB row's fixed height
const FAB_GAP = 8; // clearance kept above the sheet's top edge
const COLLAPSED_DETENT = 0.5; // = detents[0] on the ReanimatedTrueSheet below
const FAB_FADE_OUT_DETENT = 0.9; // stays visible through most of the drag, fades near full (1)

const DEFAULT_VEHICLE_IMAGE = require("../../../assets/images/ic_white_taxi.png");
const VEHICLE_IMAGES: Record<string, number> = {
  Bike: require("../../../assets/images/ny_ic_bike_left_side.png"),
  Auto: require("../../../assets/images/ny_ic_auto.png"),
};

const getVehicleImage = (vehicleType?: string) =>
  (vehicleType && VEHICLE_IMAGES[vehicleType]) || DEFAULT_VEHICLE_IMAGE;

export interface Props {
  children: React.ReactNode;
}

interface FareDetailsContentProps {
  currency: string;
  fare?: string;
  distanceKm?: number;
  duration?: string;
  vehicleType?: string;
  paymentMethod: string;
  onClose: () => void;
}

const FareRow = ({ label, value }: { label: string; value: string }) => {
  const { colors } = useAppTheme();
  return (
    <RnView style={[s.flexDirectionRow, s.spaceBetween, s.alignCenter]}>
      <RnText style={[atoms.text_sm, { color: colors.gray }]}>{label}</RnText>
      <RnText style={[atoms.text_sm, { color: colors.text }]}>{value}</RnText>
    </RnView>
  );
};

const FareDetailsContent = ({
  currency,
  fare,
  distanceKm,
  duration,
  vehicleType,
  paymentMethod,
  onClose,
}: FareDetailsContentProps) => {
  const { colors } = useAppTheme();
  return (
    <RnView style={atoms.gap_lg}>
      <RnView style={[s.flexDirectionRow, s.alignCenter, atoms.gap_sm]}>
        <Icon name="ReceiptText" size={22} color={colors.green_500} />
        <RnText style={[atoms.text_lg, { color: colors.text }]}>
          Fare details
        </RnText>
      </RnView>

      <RnView
        style={[
          s.flexDirectionRow,
          s.spaceBetween,
          s.alignCenter,
          {
            padding: 12,
            borderRadius: 12,
            backgroundColor: colors.bg_100,
          },
        ]}
      >
        <RnText style={[atoms.text_md, { color: colors.gray }]}>
          Estimated fare
        </RnText>
        <RnText style={[atoms.text_xl, { color: colors.text }]}>
          {currency} {fare ?? "—"}
        </RnText>
      </RnView>

      <RnView style={atoms.gap_sm}>
        <FareRow
          label="Trip distance"
          value={distanceKm != null ? `${distanceKm.toFixed(1)} Km` : "—"}
        />
        <FareRow label="Estimated duration" value={duration ?? "—"} />
        <FareRow label="Vehicle type" value={vehicleType ?? "—"} />
        <FareRow label="Payment method" value={paymentMethod} />
      </RnView>

      <RnText style={[atoms.text_xs, { color: colors.gray }]}>
        The final fare may vary based on actual distance, time, and any
        applicable surcharges such as tolls or waiting time.
      </RnText>
      <RNPressable
        onPress={onClose}
        accessibilityRole="button"
        style={[
          s.p16,
          s.alignCenter,
          s.borderRadius_md,
          { backgroundColor: colors.green_500 },
        ]}
      >
        <RnText style={[atoms.text_md, { color: colors.bg_50 }]}>Got it</RnText>
      </RNPressable>
    </RnView>
  );
};

const ActiveRideRequestSheet = React.forwardRef<ActionSheetACTRef, Props>(
  ({ children }, ref) => {
    const { setActiveRideState } = useActiveRide();
    const { mutateAsync: cancelRideAsync } = useCancelRideRequest();
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const sheet = useBottomSheet();
    const { height: windowHeight } = useWindowDimensions();
    const activeRideSheetRef = React.useRef<TrueSheet>(null);
    const convoSheetRef = React.useRef<TrueSheet>(null);
    const { rideData, ride_status } = useActiveRideState();
    const { animatedPosition, animatedDetent } = useReanimatedTrueSheet();

    const [plateWidth, setPlateWidth] = React.useState(0);
    const [sheetMounted, setSheetMounted] = React.useState(false);

    const fabAnimatedStyle = useAnimatedStyle(() => {
      // Position the FAB so its bottom sits `FAB_GAP` above the sheet's top edge.
      // Anchor from the window BOTTOM (`bottom: 0` on the view): `animatedPosition`
      // and `windowHeight` share the same RN-window coordinate space (the provider
      // seeds `animatedPosition` to `windowHeight` when the sheet is offscreen), so
      // `windowHeight - animatedPosition` is the sheet's visible height regardless
      // of status-bar / navigation-bar insets. Anchoring from `top: 0` instead is
      // NOT inset-safe — it drifts by the system-bar height on real devices.
      const translateY = -(windowHeight - animatedPosition.value) - FAB_GAP;

      // Fade/scale on the 0–1 detent fraction (collapsed 0.5 → expanded 1) so the
      // thresholds scale with the device instead of using fixed pixel heights.
      const opacity = interpolate(
        animatedDetent.value,
        [COLLAPSED_DETENT, FAB_FADE_OUT_DETENT],
        [1, 0],
        Extrapolation.CLAMP,
      );
      const scale = interpolate(
        animatedDetent.value,
        [COLLAPSED_DETENT, FAB_FADE_OUT_DETENT],
        [1, 0.5],
        Extrapolation.CLAMP,
      );

      return {
        opacity,
        transform: [{ translateY }, { scale }],
      };
    });

    const _open = React.useCallback(async () => {
      activeRideSheetRef.current
        ?.present()
        .then(() => {
          // setSheetMounted(true);
          console.log("Active ride sheet presented");
        })
        .catch((err) => {
          console.error("Error presenting active ride sheet:", err);
        });
    }, []);

    const _close = React.useCallback(async () => {
      activeRideSheetRef.current
        ?.dismiss()
        .then(() => {
          // setSheetMounted(false);
          console.log("Active ride sheet dismissed");
        })
        .catch((err) => {
          console.error("Error dismissing active ride sheet:", err);
        });
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

    const _onFarePress = React.useCallback(() => {
      sheet.present(
        ({ dismiss }) => (
          <FareDetailsContent
            currency="KES"
            fare={derived?.fare}
            distanceKm={rideData?.estimated_distance}
            duration={derived?.ride_duration}
            vehicleType={rideData?.vehicle_type}
            paymentMethod="Cash"
            onClose={dismiss}
          />
        ),
        {
          detents: [0, "content"],
          // This sheet is opened from inside a TrueSheet (a native presented
          // sheet). The provider portal sits behind that native presentation,
          // so present in a window-level native overlay to float above it.
          nativeOverlay: true,
          // Match the app / ride-sheet background instead of the default card.
          surface: { backgroundColor: colors.background },
          accessibilityLabel: "Fare details",
          testID: "fare-details-sheet",
        },
      );
    }, [
      sheet,
      colors.background,
      derived?.fare,
      derived?.ride_duration,
      rideData?.estimated_distance,
      rideData?.vehicle_type,
    ]);

    const cancelRide = React.useCallback(
      async (reason: CancelReason, note: string) => {
        if (!rideData) return;
        await _close();
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
      [_close, cancelRideAsync, rideData, setActiveRideState],
    );

    // "Cancel Ride" first asks why (reason sheet); the ride is only cancelled
    // from the sheet's Done — dismissing it any other way keeps the ride.
    const _onCancelPress = React.useCallback(() => {
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
          // Full-height: point detents are clamped natively to the below-
          // status-bar cap, so the window height resolves to 100%.
          detents: [0, height],
          // Opened from inside the TrueSheet's native presentation, like the
          // fare-details sheet above.
          nativeOverlay: true,
          surface: { backgroundColor: colors.background },
          accessibilityLabel: "Why are you cancelling?",
          testID: "cancel-ride-reasons-sheet",
        },
      );
    }, [sheet, colors.background, cancelRide]);

    const _onCallButtonPress = React.useCallback(() => {
      makePhoneCall(rideData?.phone);
    }, [rideData?.phone]);

    const _onMessageButtonPress = React.useCallback(async () => {
      convoSheetRef.current
        ?.present()
        .then(() => {
          console.log("Conversation sheet presented");
        })
        .catch((err) => {
          console.error("Error presenting conversation sheet:", err);
        });
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
                height: FAB_HEIGHT,
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
                { backgroundColor: "rgba(15, 36, 36, 0.6)" },
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
                    backgroundColor: "rgba(15, 36, 36, 0.6)",
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
          detents={[0.5, 1]}
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
                      source={getVehicleImage(rideData?.vehicle_type)}
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
                  <Pressable
                    onPress={_onFarePress}
                    accessibilityRole="button"
                    accessibilityLabel="View fare details"
                    style={[s.flexCol, atoms.gap_sm]}
                  >
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
                  </Pressable>
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
                      onPress={_onCancelPress}
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
