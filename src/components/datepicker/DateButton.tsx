import { PressableScale } from "pressto";
import { useMemo } from "react";

import Icon from "~/components/Icons";
import { s } from "~/styles/Common-Styles";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

// looks like a TextField.Input, but is just a button. It'll do something different on each platform on press
// Android: open the date picker modal

export function DateFieldButton({
  label,
  value,
  onPress,
  isInvalid,
  accessibilityHint,
}: {
  label: string;
  value: string | Date;
  onPress: () => void;
  isInvalid?: boolean;
  accessibilityHint?: string;
}) {
  const { colors } = useAppTheme();

  const date = useMemo(
    () => (value ? new Date(value).toLocaleDateString() : ""),
    [value],
  );

  return (
    <RnView style={[s.relative, s.w100pct]}>
      {label ? (
        <RnText
          style={[atoms.text_xs, { color: colors.gray, marginBottom: 4 }]}
        >
          {label}
        </RnText>
      ) : null}
      <PressableScale
        onPress={onPress}
        // onPressIn={onPressIn}
        // onPressOut={onPressOut}
        // onFocus={onFocus}
        // onBlur={onBlur}
        style={[
          {
            borderColor: colors.gray_300,
            borderWidth: 1,
          },
          s.flexDirectionRow,
          s.w100pct,
          s.borderRadius_sm,
          s.alignCenter,
          s.p16,
          // hovered ? chromeHover : {},
          // focused || pressed ? chromeFocus : {},
          // isInvalid || isInvalid ? chromeError : {},
          // (isInvalid || isInvalid) && (hovered || focused)
          //   ? chromeErrorHover
          //   : {},
        ]}
      >
        <Icon
          name="CalendarDays"
          size={20}
          strokeWidth={2}
          color={colors.text}
        />
        <RnText style={[atoms.text_md, atoms.pl_xs]}>{date}</RnText>
      </PressableScale>
    </RnView>
  );
}
