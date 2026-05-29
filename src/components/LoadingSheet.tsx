import { useFocusEffect } from "@react-navigation/native";
import React, {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { ViewProps } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  interpolate,
  AnimatedProps,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BASE_URL } from "~/constants/BASE_URL";
import { useCancelRideRequestEarly } from "~/hooks/api";
import {
  _startOfferingRideEvent,
  nativeBridgeEventEmitter,
  stopOfferingRideEvent,
} from "~/lib/native";
import {
  useActiveRide,
  useActiveRideState,
} from "~/providers/ActiveRideProvider";
import { s } from "~/styles/Common-Styles";
import { RideReqEvent, RideReqEventPayload } from "~/types/rideRequestEvents";
import Avatar from "~/ui/Avatar";
import RnText from "~/ui/RnText";
import { RnAnimatedView, RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { height } from "~/utils/dimensions";
import { autoFormatDuration } from "~/utils/math/times";

import Icon from "./Icons";
import { showToast } from "./Toast";

const LoadingSheetContent: React.FC<
  AnimatedProps<ViewProps> & { close: () => Promise<void> }
> = ({ close, ...rest }) => {
  const { colors, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { ride_status_update_keys } = useActiveRideState();
  const [offeringDriverEventData, setOfferingDriverEventData] = useState<
    RideReqEventPayload | undefined
  >(undefined);

  const { mutateAsync: cancelRideRequest } = useCancelRideRequestEarly();

  useEffect(() => {
    const sub = nativeBridgeEventEmitter.addListener(
      "offeringDriverEvent",
      (data: RideReqEvent) => {
        if (
          typeof data.eventPayload === "object" &&
          Object.keys(data.eventPayload).length > 0
        ) {
          setOfferingDriverEventData(data.eventPayload);
        } else {
          // show toast info
          showToast(
            "No drivers available. Please try again later.",
            {
              id: "No-Drivers-Available",
              title: "Success",
              variant: "success",
              duration: 10000,
            },
            <Icon
              name="Info"
              size={24}
              strokeWidth={2}
              color={colors.green_500}
            />,
          );

          //close the sheet
          close();
        }
      },
    );

    return () => {
      sub.remove();
      stopOfferingRideEvent();
      console.log("Stopped offering ride event");
    };
  }, [close, colors.green_500]);

  useFocusEffect(
    useCallback(() => {
      const ride_request_id = ride_status_update_keys
        ? ride_status_update_keys[0]
        : "";
      const user_id = ride_status_update_keys ? ride_status_update_keys[1] : "";
      if (ride_request_id) {
        console.log("Starting offering ride event...", ride_request_id);
        _startOfferingRideEvent(ride_request_id, user_id);
      }
    }, [ride_status_update_keys]),
  );

  const cancel = useCallback(async () => {
    if (ride_status_update_keys) {
      try {
        await close();
        await cancelRideRequest({
          ride_request_id: ride_status_update_keys[0],
        });
      } catch (err) {
        console.log("Error cancelling ride request:", err);
        await close();
      }
    }
    await close();
  }, [cancelRideRequest, close, ride_status_update_keys]);

  const offeringDriverComponent = useMemo(() => {
    const avatarUri =
      BASE_URL + "get-profile-image/" + offeringDriverEventData?.driverImg;
    const arrivalTime = autoFormatDuration(
      offeringDriverEventData?.arrivalTime || 0,
    );
    return (
      <>
        {offeringDriverEventData && (
          <RnView style={[s.flexDirectionRow, s.alignCenter, s.gap8]}>
            <Avatar
              avatar={avatarUri}
              onLoad={() => {}}
              size={60}
              styles={{}}
            />
            <RnView style={[s.justifyCenter, { flexShrink: 1 }]}>
              <RnText style={[atoms.text_xs]}>
                {offeringDriverEventData.driverName} {"  "} is {arrivalTime}{" "}
                away
              </RnText>
              <RnText style={[atoms.text_sm]}>
                <Icon
                  name="Star"
                  size={15}
                  color={colors.green_600}
                  strokeWidth={4}
                />
                {"   "} {offeringDriverEventData.driverRating}
              </RnText>
            </RnView>
          </RnView>
        )}
      </>
    );
  }, [colors.green_600, offeringDriverEventData]);
  return (
    <RnAnimatedView
      // animatedProps={drawerContainerProps}
      {...rest}
      style={[
        // opacityStyle,
        // translateYStyle,
        {
          width: "100%",
          display: "flex",
          height: height * 0.4,
          paddingTop: insets.top - 10,
          paddingBottom: insets.bottom + 10,
          alignSelf: "flex-end",
          justifyContent: "flex-end",
          position: "absolute",
          bottom: 0,
          backgroundColor: colors.bg_50,
          borderTopRightRadius: 16,
          borderTopLeftRadius: 16,
        },
      ]}
    >
      <RnView style={[s.flex1]}>
        <RnView style={[s.w100pct, s.px10, s.pt2, s.gap12]}>
          <RnView>
            <RnText
              style={[atoms.text_xl, { fontFamily: fonts.heavy.fontFamily }]}
            >
              Contacting drivers nearby....
            </RnText>
            <RnText
              style={[
                atoms.text_xs,
                { fontFamily: fonts.medium.fontFamily, color: colors.gray_500 },
              ]}
            >
              Checking who&apos;s available:
            </RnText>
          </RnView>
          {offeringDriverComponent}
        </RnView>
        <RnView style={[s.flex1, s.px16, s.justifyFlexEnd]}>
          <RnView style={[s.flexDirectionRow]}>
            <Pressable
              onPress={cancel}
              style={[
                s.p16,
                s.w100pct,
                s.alignCenter,
                s.alignSelf,
                // { backgroundColor: colors.bg_100 },
              ]}
            >
              <RnText style={[{ color: colors.red_500 }]}>
                Cancel request
              </RnText>
            </Pressable>
          </RnView>
        </RnView>
      </RnView>
    </RnAnimatedView>
  );
};

/** Just for debugging */
const initialIsModalOpened = false;
interface Props {
  children: React.ReactNode | React.ReactElement;
}
export interface LoadingSheetRef {
  show: () => void;
  hide: () => void;
}

const LoadingSheet = React.forwardRef<LoadingSheetRef, Props>(
  ({ children }, ref) => {
    const { setActiveRideState } = useActiveRide();
    const { ride_status_update_keys, rideData } = useActiveRideState();

    useImperativeHandle(ref, () => ({
      show: onShow,
      hide: closeModal,
    }));
    const openAnimValue = useSharedValue(initialIsModalOpened ? 1 : 0);
    const getIsModalOpened = useCallback(
      () => openAnimValue.value === 1,
      [openAnimValue],
    );

    const drawerContainerProps = useAnimatedProps(() => ({
      pointerEvents:
        openAnimValue.value === 1 ? ("auto" as const) : ("none" as const),
    }));

    const translateYStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateY: interpolate(openAnimValue.value, [0, 1, 2], [90, 0, 90]),
        },
      ],
    }));
    const opacityStyle = useAnimatedStyle(() => ({
      opacity: interpolate(openAnimValue.value, [0, 1, 2], [0, 1, 0]),
    }));

    const [isOpened, setIsOpened] = useState(false);

    const openModal = useCallback(() => {
      setIsOpened(true);

      openAnimValue.value = 0;
      openAnimValue.value = withTiming(1, { duration: 400 }, (finished) => {
        if (finished) {
          // Do something when the animation is finished
        }
      });
    }, [openAnimValue]);

    const closeModal = useCallback(() => {
      const animCallback = async () => {
        setIsOpened(false);
      };
      openAnimValue.value = withTiming(2, { duration: 400 }, (finished) => {
        if (finished) {
          openAnimValue.value = 0;
          runOnJS(animCallback)();
        }
      });
    }, [openAnimValue]);

    const onShow = useCallback(() => {
      if (getIsModalOpened()) {
        closeModal();
      } else {
        openModal();
      }
    }, [getIsModalOpened, closeModal, openModal]);

    const cancel_request = useCallback(async () => {
      console.log("Cancelling ride request...");
      setActiveRideState({
        type: "SET-RIDE-STATUS-UPDATE-KEYS",
        data: undefined,
      });
      closeModal();
    }, [closeModal, setActiveRideState]);

    // if ride_status_update_keys is undefined, close the modal
    useEffect(() => {
      if (rideData && typeof ride_status_update_keys === "undefined") {
        closeModal();
      }
    }, [closeModal, rideData, ride_status_update_keys]);

    return (
      <React.Fragment>
        {children}
        {isOpened && (
          <LoadingSheetContent
            animatedProps={drawerContainerProps}
            style={[translateYStyle, opacityStyle]}
            close={cancel_request}
          />
        )}
      </React.Fragment>
    );
  },
);
LoadingSheet.displayName = "LoadingSheet";
export default memo(LoadingSheet);
