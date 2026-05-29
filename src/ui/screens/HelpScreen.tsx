import { PressableWithoutFeedback } from "pressto";
import React, { useCallback } from "react";
import { Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import { s } from "~/styles/Common-Styles";

import RnText from "../RnText";
import { RnView } from "../RnView";
import { useAppTheme } from "../theme";
import { atoms } from "../theme/atoms";

export const HelpScreen: React.FC = () => {
  const { colors, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();

  const openLink = useCallback((url: string) => {
    Linking.openURL(url).catch((err) =>
      console.error("Failed to open URL: ", err),
    );
  }, []);

  const call_support = useCallback(() => {
    const phoneNumber = "tel:+254743181173";
    try {
      Linking.canOpenURL(phoneNumber).then((supported) => {
        if (!supported) {
          console.error("Can't handle phone number: " + phoneNumber);
        } else {
          return Linking.openURL(phoneNumber);
        }
      });
    } catch (err) {
      console.error("Failed to make a call: ", err);
    }
  }, []);

  const sendWahtsapp = useCallback(() => {
    const whatsappUrl = "whatsapp://send?phone=+254743181173";
    openLink(whatsappUrl);
  }, [openLink]);

  const sendEmail = useCallback(() => {
    const emailUrl = "mailto:support@sitwego.com?subject=Support%20Request";
    openLink(emailUrl);
  }, [openLink]);

  return (
    <RnView style={[s.flex1, s.px10, s.py10, { marginTop: insets.top }]}>
      <RnText
        style={[
          atoms.text_xl,
          s.textCenter,
          { fontFamily: fonts.heavy.fontFamily },
        ]}
      >
        Contact Us
      </RnText>
      <RnView style={[s.mt20]}>
        <RnText style={[atoms.text_sm]}>We are here to help</RnText>
        <RnView style={[{ marginVertical: 20 }]} />
        <PressableWithoutFeedback
          onPress={call_support}
          style={[
            s.flexDirectionRow,
            s.gap20,
            s.py8,
            s.px16,
            s.borderRadius_sm,
            s.mb10,
            { backgroundColor: colors.bg_50 },
          ]}
        >
          <Icon name="Phone" strokeWidth={2} size={24} color={colors.primary} />
          <RnView style={[s.flexCol, s.gap4]}>
            <RnText
              style={[atoms.text_md, { fontFamily: fonts.medium.fontFamily }]}
            >
              Phone
            </RnText>
            <RnText style={[atoms.text_sm, { color: colors.primary_400 }]}>
              Speak to our support team
            </RnText>
          </RnView>
        </PressableWithoutFeedback>
        <PressableWithoutFeedback
          onPress={sendWahtsapp}
          style={[
            s.flexDirectionRow,
            s.gap20,
            s.py8,
            s.px16,
            s.borderRadius_sm,
            s.mb10,
            { backgroundColor: "hsla(152, 82%, 8%, 0.9)" },
          ]}
        >
          <Icon
            name="MessageCircle"
            strokeWidth={2}
            size={24}
            color={colors.green_400}
          />
          <RnView style={[s.flexCol, s.gap4]}>
            <RnText
              style={[
                atoms.text_md,
                {
                  fontFamily: fonts.medium.fontFamily,
                  color: colors.green_400,
                },
              ]}
            >
              Whatsup
            </RnText>
            <RnText style={[atoms.text_sm, { color: colors.text }]}>
              Send us a message on WhatsApp
            </RnText>
          </RnView>
        </PressableWithoutFeedback>
        <PressableWithoutFeedback
          onPress={sendEmail}
          style={[
            s.flexDirectionRow,
            s.gap20,
            s.py8,
            s.px16,
            s.borderRadius_sm,
            s.mb10,
            { backgroundColor: colors.bg_50 },
          ]}
        >
          <Icon name="Mail" strokeWidth={2} size={24} color={colors.text} />
          <RnView style={[s.flexCol, s.gap4]}>
            <RnText
              style={[
                atoms.text_md,
                {
                  fontFamily: fonts.medium.fontFamily,
                  color: colors.text,
                },
              ]}
            >
              Email
            </RnText>
            <RnText style={[atoms.text_sm, { color: colors.text }]}>
              Write email to our support team
            </RnText>
          </RnView>
        </PressableWithoutFeedback>
      </RnView>
    </RnView>
  );
};
