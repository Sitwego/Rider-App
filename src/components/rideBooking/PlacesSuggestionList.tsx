import { PressableScale } from "pressto";
import { memo, useCallback } from "react";
import { FlatList, StyleSheet } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";

import Icon from "~/components/Icons";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

/**
 * A single place-autocomplete suggestion. Shape is shared between the legacy
 * and New Places API paths (see lib/placesApi.tsx `filterResultsByPlacePredictions`).
 */
export type PlaceSuggestion = {
  place_id?: string;
  description?: string;
  name?: string;
  formatted_address?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
  types?: string[];
};

type PlacesSuggestionListProps = {
  items: PlaceSuggestion[];
  onSelect: (item: PlaceSuggestion) => void;
};

/**
 * Animated dropdown of place suggestions. Each row fades/slides in with a small
 * stagger; the container fades in/out as results appear and clear.
 */
function PlacesSuggestionListBase({
  items,
  onSelect,
}: PlacesSuggestionListProps) {
  const { colors, fonts } = useAppTheme();

  const renderItem = useCallback(
    ({ item, index }: { item: PlaceSuggestion; index: number }) => {
      const main =
        item.structured_formatting?.main_text ||
        item.description ||
        item.formatted_address ||
        item.name ||
        "";
      const secondary = item.structured_formatting?.secondary_text ?? "";

      return (
        <Animated.View entering={FadeInDown.delay(index * 45).duration(240)}>
          <PressableScale style={styles.row} onPress={() => onSelect(item)}>
            <RnView
              style={[styles.iconWrap, { backgroundColor: colors.gray_50 }]}
            >
              <Icon name="MapPin" size={18} strokeWidth={2} color="#FFFFFF" />
            </RnView>
            <RnView style={styles.textWrap}>
              <RnText
                numberOfLines={1}
                style={[
                  atoms.text_sm,
                  { color: colors.text, fontFamily: fonts.heavy.fontFamily },
                ]}
              >
                {main}
              </RnText>
              {secondary ? (
                <RnText
                  numberOfLines={1}
                  style={[
                    atoms.text_xs,
                    { color: colors.gray_300, marginTop: 2 },
                  ]}
                >
                  {secondary}
                </RnText>
              ) : null}
            </RnView>
          </PressableScale>
        </Animated.View>
      );
    },
    [
      colors.gray_50,
      colors.text,
      colors.gray_300,
      fonts.heavy.fontFamily,
      onSelect,
    ],
  );

  const renderSeparator = useCallback(
    () => (
      <RnView style={[styles.separator, { backgroundColor: colors.gray_50 }]} />
    ),
    [colors.gray_50],
  );

  const keyExtractor = useCallback(
    (item: PlaceSuggestion, index: number) =>
      item.place_id ?? item.description ?? String(index),
    [],
  );

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      style={styles.container}
    >
      <FlatList
        nativeID="result-list-id"
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={renderSeparator}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.list}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flexBasis: 1, flexGrow: 1 },
  list: { flex: 1, borderRadius: 0 },
  content: { paddingTop: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  textWrap: { flex: 1 },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 54,
    opacity: 0.6,
  },
});

export const PlacesSuggestionList = memo(PlacesSuggestionListBase);
