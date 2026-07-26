import * as React from "react";
import { Pressable, ScrollView, StyleSheet, TextInput } from "react-native";

import Icon from "~/components/Icons";
import { s } from "~/styles/Common-Styles";

import RnText from "../RnText";
import { RnView } from "../RnView";
import { useAppTheme } from "../theme";
import { atoms } from "../theme/atoms";

import type { ComponentProps } from "react";
import type { CancelRideReasonCategory } from "~/hooks/api";

type IconName = ComponentProps<typeof Icon>["name"];

/**
 * A single cancellation reason. `id`, `label`, and `category` map 1:1 onto the
 * backend contract (`CancelRideRequestVars` in `~/hooks/api`).
 */
export interface CancelReason {
  id: string;
  label: string;
  icon: IconName;
  category: CancelRideReasonCategory;
}

interface ReasonSection {
  title: string;
  category: CancelRideReasonCategory;
  reasons: Omit<CancelReason, "category">[];
}

/** Grouped like the reference flow: rider-, driver-, and service-caused. */
const SECTIONS: ReasonSection[] = [
  {
    title: "My initiative",
    category: "rider",
    reasons: [
      {
        id: "found_another_ride",
        label: "Found another ride",
        icon: "CarTaxiFront",
      },
      { id: "plans_changed", label: "Plans changed", icon: "PersonStanding" },
      { id: "wrong_address", label: "Wrong address", icon: "Route" },
    ],
  },
  {
    title: "Driver's actions",
    category: "driver",
    reasons: [
      { id: "asked_to_cancel", label: "Asked to cancel", icon: "UserX" },
      { id: "refused_to_drive", label: "Refused to drive", icon: "Hand" },
      { id: "not_driving_to_me", label: "Not driving to me", icon: "CarFront" },
      {
        id: "asked_for_more_money",
        label: "Asked for more money",
        icon: "Coins",
      },
      { id: "not_responding", label: "Not responding", icon: "PhoneOff" },
    ],
  },
  {
    title: "Service issues",
    category: "service",
    reasons: [
      { id: "pickup_too_long", label: "Pickup too long", icon: "Clock" },
      { id: "driver_rating", label: "Driver's rating", icon: "Star" },
      { id: "ride_price", label: "Ride price", icon: "Banknote" },
    ],
  },
];

/** Flat reason list with each section's category stamped on its reasons. */
const ALL_REASONS: CancelReason[] = SECTIONS.flatMap((section) =>
  section.reasons.map((reason) => ({ ...reason, category: section.category })),
);

export interface CancelRideReasonsContentProps {
  /** Called with the chosen reason and the (trimmed) optional comments. */
  onDone: (reason: CancelReason, comments: string) => void;
}

/**
 * "What happened?" cancellation-reason picker, presented as bottom-sheet
 * content via `useBottomSheet().present(...)` (see `ActiveRideSheet`).
 * Single-select reason chips grouped by who caused the cancellation, an
 * optional comments field, and a destructive Done action that stays disabled
 * until a reason is picked — the ride is only cancelled through `onDone`;
 * dismissing the sheet keeps the ride.
 */
export const CancelRideReasonsContent = ({
  onDone,
}: CancelRideReasonsContentProps) => {
  const { colors, fonts } = useAppTheme();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [comments, setComments] = React.useState("");

  const selected = React.useMemo(
    () => ALL_REASONS.find((reason) => reason.id === selectedId) ?? null,
    [selectedId],
  );

  const handleDone = React.useCallback(() => {
    if (!selected) return;
    onDone(selected, comments.trim());
  }, [selected, comments, onDone]);

  const renderChip = (reason: Omit<CancelReason, "category">) => {
    const isSelected = reason.id === selectedId;
    return (
      // RN Pressable, not a gesture-handler pressable: this content renders in
      // the native-overlay window, where touches reach the JS responder system
      // but never the main window's gesture-handler root.
      <Pressable
        key={reason.id}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        onPress={() => setSelectedId(isSelected ? null : reason.id)}
        style={[
          styles.chip,
          {
            backgroundColor: isSelected ? colors.bg_100 : colors.bg_50,
            borderColor: isSelected ? colors.red_500 : colors.gray_100,
            borderWidth: isSelected ? 1 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <Icon
          name={reason.icon}
          size={16}
          strokeWidth={2}
          color={isSelected ? colors.red_500 : colors.text}
        />
        <RnText
          numberOfLines={1}
          style={[
            atoms.text_xs,
            { color: colors.text, fontFamily: fonts.heavy.fontFamily },
          ]}
        >
          {reason.label}
        </RnText>
      </Pressable>
    );
  };

  return (
    <RnView style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={atoms.gap_lg}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <RnText
          style={[
            atoms.text_xl,
            { color: colors.text, fontFamily: fonts.heavy.fontFamily },
          ]}
        >
          What happened?
        </RnText>

        {SECTIONS.map((section) => (
          <RnView key={section.title} style={atoms.gap_sm}>
            <RnText style={[atoms.text_xs, { color: colors.gray_300 }]}>
              {section.title}
            </RnText>
            <RnView style={styles.chipRow}>
              {section.reasons.map(renderChip)}
            </RnView>
          </RnView>
        ))}

        <TextInput
          value={comments}
          onChangeText={setComments}
          multiline
          placeholder="Your comments"
          placeholderTextColor={colors.gray_300}
          style={[
            styles.comments,
            atoms.text_sm,
            {
              color: colors.text,
              backgroundColor: colors.bg_100,
              fontFamily: fonts.medium.fontFamily,
            },
          ]}
        />
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !selected }}
        onPress={handleDone}
        style={[
          s.p16,
          s.alignCenter,
          s.borderRadius_md,
          styles.done,
          { backgroundColor: colors.red_500, opacity: selected ? 1 : 0.5 },
        ]}
      >
        <RnText
          style={[
            atoms.text_md,
            { color: "#FFFFFF", fontFamily: fonts.heavy.fontFamily },
          ]}
        >
          Done
        </RnText>
      </Pressable>
    </RnView>
  );
};

const styles = StyleSheet.create({
  // Fills the sheet's bounded content area (fixed-point detents) so the body
  // scrolls while Done stays pinned above the keyboard padding.
  root: { flex: 1 },
  scroll: { flex: 1 },
  done: { marginTop: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
  },
  comments: {
    minHeight: 72,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
});
