import {
  FirebaseAuthTypes,
  getAuth,
  signInWithPhoneNumber,
} from "@react-native-firebase/auth";
import { PressableScale as Pressable } from "pressto";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { isValidNumber } from "react-native-phone-entry";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PhoneInputComponet from "~/components/PhoneInput";
import { useConfirmOtp } from "~/providers/OtpProvider";
import { s } from "~/styles/Common-Styles";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

export const Login = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useAppTheme();
  const [phone, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otpMDL = useConfirmOtp();

  const isValidPhone = useMemo(
    () => Boolean(phone && isValidNumber(phone, "KE")),
    [phone],
  );

  const send_otp = useCallback(async () => {
    if (!isValidPhone) return;
    setIsLoading(true);
    setError(null);
    try {
      const c_response: FirebaseAuthTypes.ConfirmationResult =
        await signInWithPhoneNumber(getAuth(), phone);
      otpMDL.show_otp_modal(c_response);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [isValidPhone, otpMDL, phone]);

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[s.flex1, s.px16, { marginTop: insets.top + 20 }]}
    >
      <RnView style={[s.mb20, s.w100pct]}>
        <RnText
          style={[
            atoms.text_2xl,
            { fontFamily: fonts.heavy.fontFamily, marginBottom: 8 },
          ]}
        >
          Welcome
        </RnText>
        <RnText
          style={[atoms.text_md, { fontFamily: fonts.regular.fontFamily }]}
        >
          Enter your phone number to login or sign up
        </RnText>
      </RnView>

      <RnView style={[s.w100pct, s.flex1, s.py16]}>
        <PhoneInputComponet phone={phone} onPhoneTextChange={setPhoneNumber} />
        {error && (
          <RnText
            style={[
              atoms.text_sm,
              {
                color: "red",
                marginTop: 8,
                fontFamily: fonts.regular.fontFamily,
              },
            ]}
          >
            {error}
          </RnText>
        )}
      </RnView>

      <RnView
        style={[s.flex1, s.justifyFlexEnd, { marginBottom: insets.bottom * 2 }]}
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
            style={[atoms.text_sm, { fontFamily: fonts.regular.fontFamily }]}
          >
            Send me a verification code
          </RnText>
          <Pressable
            style={[
              s.p16,
              s.alignCenter,
              {
                borderRadius: 8,
                backgroundColor:
                  isValidPhone && !isLoading
                    ? colors.primary
                    : colors.primary_25,
                width: "90%",
              },
            ]}
            onPress={send_otp}
            enabled={isValidPhone && !isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <RnText>Send OTP</RnText>
            )}
          </Pressable>
        </RnView>
      </RnView>
    </KeyboardAvoidingView>
  );
};
