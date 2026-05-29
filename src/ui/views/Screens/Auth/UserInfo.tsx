import { useFormik } from "formik";
import { useRef } from "react";
import { ActivityIndicator } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PressableWithFeedBack from "~/components/PressableWithFeedBack";
import { CONSTANTS } from "~/constants/CONSTANTS";
import { useAuthApi } from "~/providers/AuthProvider";
import { s } from "~/styles/Common-Styles";
import { CreateAccountType } from "~/types/accountTypes";
import RnText from "~/ui/RnText";
import RnTextInput, { AnimatedTextInputRef } from "~/ui/RnTextInput";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

type FormValues = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  re_password: string;
};

function validate(values: FormValues) {
  const errors: Partial<FormValues> = {};

  if (!values.first_name.trim()) {
    errors.first_name = "First name is required";
  }
  if (!values.last_name.trim()) {
    errors.last_name = "Last name is required";
  }
  if (!values.email) {
    errors.email = "Email is required";
  } else if (!CONSTANTS.REGEX.EMAIL.test(values.email)) {
    errors.email = "Invalid email address";
  }
  if (!values.password) {
    errors.password = "Password is required";
  } else if (values.password.length < 6) {
    errors.password = "Password must be at least 6 characters";
  }
  if (!values.re_password) {
    errors.re_password = "Please confirm your password";
  } else if (values.re_password !== values.password) {
    errors.re_password = "Passwords do not match";
  }

  return errors;
}

export const UserInfo = ({ route }: any) => {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useAppTheme();
  const { signup } = useAuthApi();
  const phone_number: string = route.params?.phone_number || "";

  const l_nameRef = useRef<AnimatedTextInputRef>(null);
  const e_mailRef = useRef<AnimatedTextInputRef>(null);
  const p_wordRef = useRef<AnimatedTextInputRef>(null);
  const r_p_wordRef = useRef<AnimatedTextInputRef>(null);

  const formik = useFormik<FormValues>({
    initialValues: {
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      re_password: "",
    },
    validate,
    onSubmit: async (values) => {
      if (!phone_number) return;
      const userInput: CreateAccountType = {
        contact_data: {
          email: values.email,
          phone_number,
        },
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        gender: "unknown",
        password: values.password,
        mobile_country_code: "+254",
      };
      await signup(userInput);
    },
  });

  const inputStyle = [
    s.input,
    s.f16,
    s.w100pct,
    {
      fontFamily: fonts.regular.fontFamily,
      color: colors.text,
      borderColor: colors.background,
    },
  ];

  return (
    <RnView style={[s.flex1, s.px16, { marginTop: insets.top }]}>
      <KeyboardAvoidingView behavior="padding" style={[s.flex1]}>
        <RnView style={[s.mt20]}>
          <RnText
            style={[
              atoms.text_2xl,
              { fontFamily: fonts.heavy.fontFamily, marginBottom: 4 },
            ]}
          >
            Create Account
          </RnText>
          <RnText
            style={[atoms.text_sm, { fontFamily: fonts.regular.fontFamily }]}
          >
            Fill in your details to get started
          </RnText>
        </RnView>

        <RnView style={[s.mt20, s.w100pct, s.px16]}>
          {/* First + Last Name row */}
          <RnView style={[s.flexDirectionRow, s.gap16]}>
            <RnView style={[{ flex: 1 }]}>
              <RnTextInput
                style={inputStyle}
                autoCapitalize="words"
                autoComplete="name-given"
                underlineColorAndroid={colors.bg_50}
                autoCorrect={false}
                cursorColor={colors.text}
                maxLength={20}
                inputMode="text"
                returnKeyType="next"
                placeholder="First Name"
                placeholderTextColor={colors.gray}
                value={formik.values.first_name}
                onChangeText={formik.handleChange("first_name")}
                onBlur={formik.handleBlur("first_name")}
                onSubmitEditing={() => l_nameRef.current?.focus()}
              />
              {formik.touched.first_name && formik.errors.first_name ? (
                <RnText style={[atoms.text_xs, { color: "red", marginTop: 2 }]}>
                  {formik.errors.first_name}
                </RnText>
              ) : null}
            </RnView>

            <RnView style={[{ flex: 1 }]}>
              <RnTextInput
                ref={l_nameRef}
                style={inputStyle}
                autoCapitalize="words"
                autoComplete="name-family"
                underlineColorAndroid={colors.bg_50}
                autoCorrect={false}
                cursorColor={colors.text}
                maxLength={20}
                inputMode="text"
                returnKeyType="next"
                placeholder="Last Name"
                placeholderTextColor={colors.gray}
                value={formik.values.last_name}
                onChangeText={formik.handleChange("last_name")}
                onBlur={formik.handleBlur("last_name")}
                onSubmitEditing={() => e_mailRef.current?.focus()}
              />
              {formik.touched.last_name && formik.errors.last_name ? (
                <RnText style={[atoms.text_xs, { color: "red", marginTop: 2 }]}>
                  {formik.errors.last_name}
                </RnText>
              ) : null}
            </RnView>
          </RnView>

          {/* Email */}
          <RnView style={[{ marginTop: 16 }]}>
            <RnTextInput
              ref={e_mailRef}
              style={inputStyle}
              underlineColorAndroid={colors.bg_50}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              cursorColor={colors.text}
              inputMode="email"
              returnKeyType="next"
              placeholder="Email Address"
              placeholderTextColor={colors.gray}
              value={formik.values.email}
              onChangeText={formik.handleChange("email")}
              onBlur={formik.handleBlur("email")}
              onSubmitEditing={() => p_wordRef.current?.focus()}
            />
            {formik.touched.email && formik.errors.email ? (
              <RnText style={[atoms.text_xs, { color: "red", marginTop: 2 }]}>
                {formik.errors.email}
              </RnText>
            ) : null}
          </RnView>

          {/* Password */}
          <RnView style={[{ marginTop: 16 }]}>
            <RnTextInput
              ref={p_wordRef}
              style={inputStyle}
              underlineColorAndroid={colors.bg_50}
              secureTextEntry
              cursorColor={colors.text}
              returnKeyType="next"
              placeholder="Password"
              placeholderTextColor={colors.gray}
              value={formik.values.password}
              onChangeText={formik.handleChange("password")}
              onBlur={formik.handleBlur("password")}
              onSubmitEditing={() => r_p_wordRef.current?.focus()}
            />
            {formik.touched.password && formik.errors.password ? (
              <RnText style={[atoms.text_xs, { color: "red", marginTop: 2 }]}>
                {formik.errors.password}
              </RnText>
            ) : null}
          </RnView>

          {/* Confirm Password */}
          <RnView style={[{ marginTop: 16 }]}>
            <RnTextInput
              ref={r_p_wordRef}
              style={inputStyle}
              underlineColorAndroid={colors.bg_50}
              secureTextEntry
              cursorColor={colors.text}
              returnKeyType="done"
              placeholder="Confirm Password"
              placeholderTextColor={colors.gray}
              value={formik.values.re_password}
              onChangeText={formik.handleChange("re_password")}
              onBlur={formik.handleBlur("re_password")}
              onSubmitEditing={() => formik.handleSubmit()}
            />
            {formik.touched.re_password && formik.errors.re_password ? (
              <RnText style={[atoms.text_xs, { color: "red", marginTop: 2 }]}>
                {formik.errors.re_password}
              </RnText>
            ) : null}
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
              style={[atoms.text_sm, { fontFamily: fonts.regular.fontFamily }]}
            >
              By registering, you agree to our Terms &amp; Conditions
            </RnText>
            <PressableWithFeedBack
              wrapperStyle={[
                s.p16,
                s.alignCenter,
                {
                  borderRadius: 8,
                  width: "90%",
                  backgroundColor:
                    formik.isValid && formik.dirty && !formik.isSubmitting
                      ? colors.green_200
                      : colors.primary_25,
                },
              ]}
              onPress={() => formik.handleSubmit()}
              disabled={!formik.isValid || !formik.dirty || formik.isSubmitting}
            >
              {formik.isSubmitting ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <RnText>Register</RnText>
              )}
            </PressableWithFeedBack>
          </RnView>
        </RnView>
      </KeyboardAvoidingView>
    </RnView>
  );
};
