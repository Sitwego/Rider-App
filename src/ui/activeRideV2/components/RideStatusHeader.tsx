import { memo } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import Icon from "~/components/Icons";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { space } from "~/ui/theme/tokens";

type Props = {
  headline: string;
  onCollapse: () => void;
};

/** Accent bar shown above the expanded map; drag it down to collapse. */
function RideStatusHeaderBase({ headline, onCollapse }: Props) {
  const { colors, fonts } = useAppTheme();
  return (
    <RnView style={styles.row}>
      <Pressable
        onPress={onCollapse}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Collapse live map"
        style={styles.back}
      >
        <Icon name="ChevronDown" size={26} color={colors.text} />
      </Pressable>
      <Animated.Text
        key={headline}
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(120)}
        numberOfLines={1}
        style={[
          atoms.text_lg,
          styles.title,
          { color: colors.text, fontFamily: fonts.heavy.fontFamily },
        ]}
      >
        {headline}
      </Animated.Text>
    </RnView>
  );
}

export const RideStatusHeader = memo(RideStatusHeaderBase);

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1 },
});
