import { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { useNavigation } from "@react-navigation/native";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, BackHandler } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { runOnJS } from "react-native-worklets";

import { useLoginCustomer } from "~/hooks/useUserApis";
import { useAuthApi } from "~/providers/AuthProvider";
import { s } from "~/styles/Common-Styles";
import RnText from "~/ui/RnText";
import RnTextInput, { AnimatedTextInputRef } from "~/ui/RnTextInput";
import { RnAnimatedView, RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

import PressableWithFeedBack from "./PressableWithFeedBack";

/** Just for debugging */
const initialIsModalOpened = false;

interface Props {
  children: React.ReactNode | React.ReactElement;
}

export interface OTPConfirmationRef {
  show_otp_modal: (props: FirebaseAuthTypes.ConfirmationResult) => void;
  hide_otp_modal: () => void;
}

export const OtpConfirmationModal = React.forwardRef<OTPConfirmationRef, Props>(
  ({ children }, ref) => {
    const { colors, fonts } = useAppTheme();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const { mutateAsync: loginCustomer } = useLoginCustomer();
    const { login } = useAuthApi();

    const [confirmationResult, setConfirmationResult] =
      useState<FirebaseAuthTypes.ConfirmationResult>();
    const [otpCode, setOtpCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOpened, setIsOpened] = useState(false);

    const otpInputRef = useRef<AnimatedTextInputRef>(null);
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

    const resetInputState = useCallback(() => {
      setOtpCode("");
      setError(null);
      otpInputRef.current?.clear();
    }, []);

    // Stable named callbacks — never use inline lambdas with runOnJS when
    // they capture native refs (host functions live on the JS runtime and
    // must not be touched from the UI/worklet runtime).
    const onCloseAnimDone = useCallback(() => {
      setIsOpened(false);
      resetInputState();
    }, [resetInputState]);

    const focusOtpInput = useCallback(() => {
      otpInputRef.current?.focus();
    }, []);

    const closeModal = useCallback(() => {
      openAnimValue.value = withTiming(2, { duration: 400 }, (finished) => {
        if (finished) {
          openAnimValue.value = 0;
          runOnJS(onCloseAnimDone)();
        }
      });
    }, [openAnimValue, onCloseAnimDone]);

    const openModal = useCallback(() => {
      setIsOpened(true);
      openAnimValue.value = 0;
      openAnimValue.value = withTiming(1, { duration: 400 }, (finished) => {
        if (finished) {
          runOnJS(focusOtpInput)();
        }
      });
    }, [openAnimValue, focusOtpInput]);

    const onShow = useCallback(
      (result: FirebaseAuthTypes.ConfirmationResult) => {
        setConfirmationResult(result);
        if (getIsModalOpened()) {
          // Modal already open (e.g. resend): reset input and reuse
          resetInputState();
        } else {
          openModal();
        }
      },
      [getIsModalOpened, openModal, resetInputState],
    );

    useImperativeHandle(
      ref,
      () => ({ show_otp_modal: onShow, hide_otp_modal: closeModal }),
      [onShow, closeModal],
    );

    const isValidOtp = useMemo(() => /^\d{4,6}$/.test(otpCode), [otpCode]);

    const goToInfoScreen = useCallback(
      (phone_number: string) => {
        //@ts-ignore
        navigation.navigate("UserInfo", { phone_number });
      },
      [navigation],
    );

    const confirmOtp = useCallback(async () => {
      if (!confirmationResult || !isValidOtp) return;
      setIsLoading(true);
      setError(null);
      try {
        const res = await confirmationResult.confirm(otpCode);
        if (res?.user) {
          const login_response = await loginCustomer({
            phone_number: res.user.phoneNumber || "",
            device_id: "some-device-id", // TODO: Replace with actual device id
          });
          if (!login_response?.success && !login_response?.data) {
            closeModal();
            goToInfoScreen(res.user.phoneNumber || "");
            return;
          }
          await login(login_response.data);
          closeModal();
        }
      } catch {
        setError("Invalid OTP. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }, [
      closeModal,
      confirmationResult,
      goToInfoScreen,
      isValidOtp,
      login,
      loginCustomer,
      otpCode,
    ]);

    useEffect(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (getIsModalOpened()) {
          closeModal();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [closeModal, getIsModalOpened]);

    return (
      <React.Fragment>
        {children}
        {isOpened && (
          <RnAnimatedView
            animatedProps={drawerContainerProps}
            style={[
              opacityStyle,
              translateYStyle,
              {
                width: "100%",
                display: "flex",
                height: "100%",
                paddingHorizontal: 10,
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
                alignSelf: "flex-end",
                backgroundColor: colors.background,
                borderTopRightRadius: 16,
                borderTopLeftRadius: 16,
              },
            ]}
          >
            <RnView style={[s.flex1, s.px16, { marginTop: insets.top + 20 }]}>
              <RnText style={[atoms.text_xl]}>Enter Your OTP</RnText>
              <KeyboardAvoidingView behavior="padding" style={[s.flex1]}>
                <RnView style={[s.flex1, s.px16, s.mt20]}>
                  <RnTextInput
                    ref={otpInputRef}
                    style={[
                      s.input,
                      s.f16,
                      s.w100pct,
                      {
                        fontFamily: fonts.regular.fontFamily,
                        color: colors.text,
                        borderColor: colors.background,
                      },
                    ]}
                    underlineColorAndroid={colors.bg_50}
                    keyboardType="number-pad"
                    autoCorrect={false}
                    cursorColor={colors.text}
                    maxLength={6}
                    inputMode="numeric"
                    onChangeText={setOtpCode}
                    returnKeyType="done"
                    onSubmitEditing={confirmOtp}
                    placeholder="Enter OTP"
                    placeholderTextColor={colors.gray}
                    defaultValue=""
                  />
                  {error && (
                    <RnText
                      style={[atoms.text_sm, { color: "red", marginTop: 4 }]}
                    >
                      {error}
                    </RnText>
                  )}
                  <RnView style={[s.mt10]}>
                    <RnText
                      style={[
                        atoms.text_sm,
                        {
                          color: colors.gray_500,
                          fontFamily: fonts.regular.fontFamily,
                        },
                      ]}
                    >
                      Didn&apos;t receive the code? Resend OTP
                    </RnText>
                  </RnView>
                </RnView>
                <RnView
                  style={[
                    s.flex1,
                    s.justifyFlexEnd,
                    { marginBottom: insets.bottom * 2 },
                  ]}
                >
                  <RnView
                    style={[
                      s.flexDirectionRow,
                      s.justifyCenter,
                      s.gap16,
                      { flexWrap: "wrap" },
                    ]}
                  >
                    <RnText
                      style={[
                        atoms.text_sm,
                        { fontFamily: fonts.regular.fontFamily },
                      ]}
                    >
                      Please verify your otp to continue
                    </RnText>
                    <PressableWithFeedBack
                      wrapperStyle={[
                        s.p16,
                        s.alignCenter,
                        {
                          borderRadius: 8,
                          width: "90%",
                          backgroundColor: colors.green_200,
                        },
                      ]}
                      onPress={confirmOtp}
                      disabled={!isValidOtp || isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={colors.text} />
                      ) : (
                        <RnText>Verify</RnText>
                      )}
                    </PressableWithFeedBack>
                  </RnView>
                </RnView>
              </KeyboardAvoidingView>
            </RnView>
          </RnAnimatedView>
        )}
      </React.Fragment>
    );
  },
);
OtpConfirmationModal.displayName = "OtpConfirmationModal";
