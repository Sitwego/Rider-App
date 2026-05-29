import { useFormik } from "formik";
import { ActivityIndicator, StyleSheet } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import PressableWithFeedBack from "~/components/PressableWithFeedBack";
import { DateInputField } from "~/components/datepicker";
import { useGetRiderProfile, useUpdateRiderProfile } from "~/hooks/useUserApis";
import { s } from "~/styles/Common-Styles";

import RnText from "../RnText";
import RnTextInput from "../RnTextInput";
import { RnView } from "../RnView";
import { useAppTheme } from "../theme";
import { atoms } from "../theme/atoms";

type Props = {
  navigation?: any;
};

type FormValues = {
  firstName: string;
  lastName: string;
  dob: string;
};

function validate(values: FormValues) {
  const errors: Partial<FormValues> = {};
  if (!values.firstName.trim()) errors.firstName = "First name is required";
  if (!values.lastName.trim()) errors.lastName = "Last name is required";
  return errors;
}

const maxDob = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d;
})();

export const EditProfileScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { fonts, colors } = useAppTheme();

  const { data: profile } = useGetRiderProfile();
  const { mutate: updateProfile, isPending } = useUpdateRiderProfile();

  const {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    setFieldValue,
    handleSubmit,
  } = useFormik<FormValues>({
    enableReinitialize: true,
    initialValues: {
      firstName: profile?.first_name?.trim() ?? "",
      lastName: profile?.last_name?.trim() ?? "",
      dob: "",
    },
    validate,
    onSubmit: (vals) => {
      updateProfile(
        {
          first_name: vals.firstName.trim(),
          last_name: vals.lastName.trim(),
          dob: vals.dob || null,
        },
        { onSuccess: () => navigation?.goBack() },
      );
    },
  });

  const inputStyle = [
    s.input,
    styles.textInput,
    {
      fontFamily: fonts.regular.fontFamily,
      color: colors.text,
      borderColor: colors.gray_200,
      backgroundColor: colors.bg_50,
    },
  ];

  return (
    <RnView style={[s.flex1, { backgroundColor: colors.background }]}>
      {/* Header */}
      <RnView
        style={[
          styles.header,
          { paddingTop: insets.top + 8, borderBottomColor: colors.gray_200 },
        ]}
      >
        <PressableWithFeedBack
          onPress={() => navigation?.goBack()}
          wrapperStyle={styles.backBtn}
        >
          <Icon
            name="ChevronLeft"
            size={24}
            strokeWidth={2}
            color={colors.text}
          />
        </PressableWithFeedBack>
        <RnText
          style={[
            atoms.text_lg,
            { fontFamily: fonts.heavy.fontFamily, color: colors.text },
          ]}
        >
          Edit Profile
        </RnText>
        <RnView style={styles.backBtn} />
      </RnView>

      <KeyboardAvoidingView behavior="padding" style={[s.flex1]}>
        <RnView style={[s.px16, { paddingTop: 28, gap: 16 }]}>
          {/* First Name */}
          <RnView>
            <FieldLabel label="First Name" colors={colors} fonts={fonts} />
            <RnTextInput
              style={[
                inputStyle,
                touched.firstName && errors.firstName
                  ? { borderColor: colors.danger }
                  : null,
              ]}
              autoCapitalize="words"
              autoComplete="name-given"
              autoCorrect={false}
              cursorColor={colors.text}
              maxLength={30}
              onChangeText={handleChange("firstName")}
              onBlur={handleBlur("firstName")}
              placeholder="First Name"
              placeholderTextColor={colors.gray}
              value={values.firstName}
            />
            {touched.firstName && errors.firstName ? (
              <RnText
                style={[atoms.text_xs, { color: colors.danger, marginTop: 4 }]}
              >
                {errors.firstName}
              </RnText>
            ) : null}
          </RnView>

          {/* Last Name */}
          <RnView>
            <FieldLabel label="Last Name" colors={colors} fonts={fonts} />
            <RnTextInput
              style={[
                inputStyle,
                touched.lastName && errors.lastName
                  ? { borderColor: colors.danger }
                  : null,
              ]}
              autoCapitalize="words"
              autoComplete="name-family"
              autoCorrect={false}
              cursorColor={colors.text}
              maxLength={30}
              onChangeText={handleChange("lastName")}
              onBlur={handleBlur("lastName")}
              placeholder="Last Name"
              placeholderTextColor={colors.gray}
              value={values.lastName}
            />
            {touched.lastName && errors.lastName ? (
              <RnText
                style={[atoms.text_xs, { color: colors.danger, marginTop: 4 }]}
              >
                {errors.lastName}
              </RnText>
            ) : null}
          </RnView>

          {/* Date of Birth */}
          <RnView>
            <FieldLabel label="Date of Birth" colors={colors} fonts={fonts} />
            <DateInputField
              label="Select Date of Birth"
              value={values.dob}
              onChangeDate={(date) => setFieldValue("dob", date)}
              maximumDate={maxDob}
            />
          </RnView>
        </RnView>

        {/* Save Button */}
        <RnView
          style={[
            s.flex1,
            s.justifyFlexEnd,
            s.px16,
            { paddingBottom: insets.bottom + 60 },
          ]}
        >
          <PressableWithFeedBack
            onPress={() => handleSubmit()}
            wrapperStyle={[
              styles.saveBtn,
              { backgroundColor: colors.primary_500 },
            ]}
          >
            {isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <RnText
                style={[
                  atoms.text_md,
                  {
                    color: "#fff",
                    fontFamily: fonts.bold.fontFamily,
                    textAlign: "center",
                  },
                ]}
              >
                Save Changes
              </RnText>
            )}
          </PressableWithFeedBack>
        </RnView>
      </KeyboardAvoidingView>
    </RnView>
  );
};

// ─── Sub-component ────────────────────────────────────────────────────────────

type FieldLabelProps = {
  label: string;
  colors: any;
  fonts: any;
};

const FieldLabel: React.FC<FieldLabelProps> = ({ label, colors, fonts }) => (
  <RnText
    style={[
      atoms.text_sm,
      {
        fontFamily: fonts.bold.fontFamily,
        color: colors.text,
        marginBottom: 6,
      },
    ]}
  >
    {label}
  </RnText>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    paddingHorizontal: 14,
    fontSize: 15,
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
});
