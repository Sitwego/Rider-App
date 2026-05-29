import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import PressableWithFeedBack from "~/components/PressableWithFeedBack";
import { s } from "~/styles/Common-Styles";

import RnText from "../RnText";
import RnTextInput from "../RnTextInput";
import { RnView } from "../RnView";
import { useAppTheme } from "../theme";
import { atoms } from "../theme/atoms";

type Props = {
  navigation?: any;
};

export const UserAddressScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { fonts, colors } = useAppTheme();

  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  const onSave = useCallback(() => {
    // TODO: persist address
    navigation?.goBack();
  }, [navigation]);

  const isValid = street.trim().length > 0 && city.trim().length > 0;

  return (
    <RnView style={[s.flex1, { backgroundColor: colors.background }]}>
      {/* Header */}
      <RnView
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: colors.gray_200,
          },
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
          My Address
        </RnText>
        <RnView style={styles.backBtn} />
      </RnView>

      <KeyboardAvoidingView behavior="padding" style={[s.flex1]}>
        <RnView style={[s.px16, { paddingTop: 28 }]}>
          {/* Map pin illustration */}
          <RnView style={[s.alignCenter, s.mb20]}>
            <RnView
              style={[
                styles.mapIconWrapper,
                { backgroundColor: `${colors.primary_500}18` },
              ]}
            >
              <Icon
                name="MapPin"
                size={32}
                strokeWidth={1.5}
                color={colors.primary_500}
              />
            </RnView>
            <RnText
              style={[
                atoms.text_sm,
                {
                  color: colors.gray,
                  fontFamily: fonts.regular.fontFamily,
                  marginTop: 8,
                  textAlign: "center",
                },
              ]}
            >
              Add your home address for faster booking
            </RnText>
          </RnView>

          {/* Street */}
          <FieldLabel label="Street Address" colors={colors} fonts={fonts} />
          <RnTextInput
            style={[
              s.input,
              styles.textInput,
              {
                fontFamily: fonts.regular.fontFamily,
                color: colors.text,
                borderColor: colors.gray_200,
                backgroundColor: colors.bg_50,
              },
            ]}
            autoCapitalize="words"
            autoCorrect={false}
            cursorColor={colors.text}
            onChangeText={setStreet}
            placeholder="123 Main Street"
            placeholderTextColor={colors.gray}
            value={street}
          />

          {/* City + State row */}
          <RnView
            style={[
              s.flexDirectionRow,
              { gap: 12, marginTop: 16, alignItems: "flex-start" },
            ]}
          >
            <RnView style={[{ flex: 1 }]}>
              <FieldLabel label="City" colors={colors} fonts={fonts} />
              <RnTextInput
                style={[
                  s.input,
                  styles.textInput,
                  {
                    fontFamily: fonts.regular.fontFamily,
                    color: colors.text,
                    borderColor: colors.gray_200,
                    backgroundColor: colors.bg_50,
                  },
                ]}
                autoCapitalize="words"
                autoCorrect={false}
                cursorColor={colors.text}
                onChangeText={setCity}
                placeholder="City"
                placeholderTextColor={colors.gray}
                value={city}
              />
            </RnView>
            <RnView style={[{ flex: 1 }]}>
              <FieldLabel
                label="State / Province"
                colors={colors}
                fonts={fonts}
              />
              <RnTextInput
                style={[
                  s.input,
                  styles.textInput,
                  {
                    fontFamily: fonts.regular.fontFamily,
                    color: colors.text,
                    borderColor: colors.gray_200,
                    backgroundColor: colors.bg_50,
                  },
                ]}
                autoCapitalize="characters"
                autoCorrect={false}
                cursorColor={colors.text}
                maxLength={10}
                onChangeText={setState}
                placeholder="State"
                placeholderTextColor={colors.gray}
                value={state}
              />
            </RnView>
          </RnView>

          {/* Zip */}
          <FieldLabel
            label="Zip / Postal Code"
            colors={colors}
            fonts={fonts}
            style={{ marginTop: 16 }}
          />
          <RnTextInput
            style={[
              s.input,
              styles.textInput,
              {
                fontFamily: fonts.regular.fontFamily,
                color: colors.text,
                borderColor: colors.gray_200,
                backgroundColor: colors.bg_50,
              },
            ]}
            keyboardType="number-pad"
            cursorColor={colors.text}
            maxLength={10}
            onChangeText={setZip}
            placeholder="00000"
            placeholderTextColor={colors.gray}
            value={zip}
          />
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
            onPress={onSave}
            disabled={!isValid}
            wrapperStyle={[
              styles.saveBtn,
              {
                backgroundColor: isValid ? colors.primary_500 : colors.gray_100,
              },
            ]}
          >
            <RnText
              style={[
                atoms.text_md,
                {
                  color: isValid ? "#fff" : colors.gray,
                  fontFamily: fonts.bold.fontFamily,
                  textAlign: "center",
                },
              ]}
            >
              Save Address
            </RnText>
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
  style?: object;
};

const FieldLabel: React.FC<FieldLabelProps> = ({
  label,
  colors,
  fonts,
  style,
}) => (
  <RnText
    style={[
      atoms.text_sm,
      {
        fontFamily: fonts.bold.fontFamily,
        color: colors.text,
        marginBottom: 6,
      },
      style,
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
  mapIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
