import { PressableScale } from "pressto";
import { ComponentProps, memo, useCallback, useMemo } from "react";
import { FlatList, StyleSheet } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";

import Icon from "~/components/Icons";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { haversineDistance } from "~/utils/geo";

import { PlaceType } from "../../../lib/placesTypes";
import { ShortcutKind } from "../../storage/savedPlaces";

type Origin = { latitude: number; longitude: number } | null | undefined;

type Shortcuts = {
  home: PlaceType | null;
  work: PlaceType | null;
  airport: PlaceType | null;
};

type QuickDestinationsProps = {
  shortcuts: Shortcuts;
  recents: PlaceType[];
  /** Current location, used to compute straight-line distance per row. */
  origin?: Origin;
  /** Chips rendered dimmed and non-interactive (e.g. airport until wired). */
  disabledShortcuts?: ShortcutKind[];
  onSelectPlace: (place: PlaceType) => void;
  onSelectShortcut: (kind: ShortcutKind, place: PlaceType | null) => void;
};

type IconName = ComponentProps<typeof Icon>["name"];

const CHIPS: { kind: ShortcutKind; label: string; icon: IconName }[] = [
  { kind: "home", label: "Home", icon: "House" },
  { kind: "work", label: "Work", icon: "Briefcase" },
  { kind: "airport", label: "Airport", icon: "PlaneTakeoff" },
];

/** Straight-line distance from origin to a place, formatted in km. */
function formatDistanceKm(origin: Origin, place: PlaceType): string | null {
  if (!origin || place.lat == null || place.lng == null) return null;
  const meters = haversineDistance(origin, {
    latitude: place.lat,
    longitude: place.lng,
  });
  const km = meters / 1000;
  if (km < 0.1) return null;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/**
 * The "SUGGESTIONS" panel shown in the ride-booking sheet's empty state:
 * a row of Home/Work/Airport quick-destination chips plus a list of recently
 * picked places (with straight-line distance). Presentational only — the
 * parent owns the saved-places store and selection side effects.
 */
function QuickDestinationsBase({
  shortcuts,
  recents,
  origin,
  disabledShortcuts,
  onSelectPlace,
  onSelectShortcut,
}: QuickDestinationsProps) {
  const { colors, fonts } = useAppTheme();

  const renderChip = useCallback(
    ({ kind, label, icon }: (typeof CHIPS)[number]) => {
      const place = shortcuts[kind];
      const disabled = disabledShortcuts?.includes(kind) ?? false;
      return (
        <PressableScale
          key={kind}
          style={[
            styles.chip,
            {
              backgroundColor: colors.bg_100,
              borderColor: colors.gray_100,
              opacity: disabled ? 0.4 : 1,
            },
          ]}
          onPress={() => {
            if (!disabled) onSelectShortcut(kind, place);
          }}
        >
          <Icon
            name={place ? icon : "Plus"}
            size={16}
            strokeWidth={place ? 2 : 2.5}
            color={colors.text}
          />
          <RnText
            numberOfLines={1}
            style={[
              atoms.text_xs,
              { color: colors.text, fontFamily: fonts.heavy.fontFamily },
            ]}
          >
            {label}
          </RnText>
        </PressableScale>
      );
    },
    [
      shortcuts,
      disabledShortcuts,
      colors.bg_100,
      colors.gray_100,
      colors.text,
      fonts.heavy.fontFamily,
      onSelectShortcut,
    ],
  );

  const header = useMemo(
    () => (
      <RnView>
        <RnText
          style={[
            atoms.text_xs,
            {
              color: colors.gray_300,
              fontFamily: fonts.heavy.fontFamily,
              letterSpacing: 1,
              marginBottom: 12,
            },
          ]}
        >
          SUGGESTIONS
        </RnText>
        <RnView style={styles.chipRow}>{CHIPS.map(renderChip)}</RnView>
        {recents.length > 0 ? (
          <RnView
            style={[styles.headerDivider, { backgroundColor: colors.gray_50 }]}
          />
        ) : null}
      </RnView>
    ),
    [
      colors.gray_300,
      colors.gray_50,
      fonts.heavy.fontFamily,
      renderChip,
      recents.length,
    ],
  );

  const renderRecent = useCallback(
    ({ item, index }: { item: PlaceType; index: number }) => {
      const main = item.name || item.address || "";
      // Drop a leading duplicate of the name from the address so the (more
      // useful) distance isn't truncated off the single-line secondary.
      let addr = item.address && item.address !== main ? item.address : null;
      if (addr && main && addr.toLowerCase().startsWith(main.toLowerCase())) {
        addr = addr.slice(main.length).replace(/^[\s,]+/, "") || null;
      }
      const secondaryParts = [addr, formatDistanceKm(origin, item)].filter(
        Boolean,
      );
      const secondary = secondaryParts.join(" · ");

      return (
        <Animated.View entering={FadeInDown.delay(index * 45).duration(240)}>
          <PressableScale
            style={styles.row}
            onPress={() => onSelectPlace(item)}
          >
            <RnView
              style={[styles.iconWrap, { backgroundColor: colors.gray_50 }]}
            >
              <Icon name="Clock" size={18} strokeWidth={2} color="#FFFFFF" />
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
            <Icon
              name="ArrowUpLeft"
              size={20}
              strokeWidth={2}
              color={colors.gray_300}
            />
          </PressableScale>
        </Animated.View>
      );
    },
    [
      origin,
      colors.gray_50,
      colors.text,
      colors.gray_300,
      fonts.heavy.fontFamily,
      onSelectPlace,
    ],
  );

  const renderSeparator = useCallback(
    () => (
      <RnView style={[styles.separator, { backgroundColor: colors.gray_50 }]} />
    ),
    [colors.gray_50],
  );

  const keyExtractor = useCallback(
    (item: PlaceType, index: number) =>
      item.place_id ?? item.address ?? String(index),
    [],
  );

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      layout={LinearTransition.duration(220).easing(Easing.out(Easing.cubic))}
      style={styles.container}
    >
      <FlatList
        data={recents}
        keyExtractor={keyExtractor}
        renderItem={renderRecent}
        ListHeaderComponent={header}
        ItemSeparatorComponent={renderSeparator}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flexBasis: 1, flexGrow: 1 },
  content: { paddingTop: 12, paddingHorizontal: 6 },
  chipRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 16,
    opacity: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
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
    marginLeft: 48,
    opacity: 0.6,
  },
});

export const QuickDestinations = memo(QuickDestinationsBase);
