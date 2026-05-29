import { PressableScale as Pressable } from "pressto";

import Icon from "~/components/Icons";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

export function EmergencyButton() {
  const { colors, fonts } = useAppTheme();

  return (
    <RnView
      style={{
        position: "absolute",
        top: 12,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <Pressable
        onPress={() => {
          // TODO: implement emergency action
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.red_400,
          paddingHorizontal: 20,
          paddingVertical: 10,
          borderRadius: 24,
          gap: 8,
        }}
      >
        <Icon name="Siren" size={24} color={colors.text} strokeWidth={2.5} />
        <RnText
          style={[
            atoms.text_sm,
            { color: colors.text, fontFamily: fonts.heavy.fontFamily },
          ]}
        >
          Emergency
        </RnText>
      </Pressable>
    </RnView>
  );
}
