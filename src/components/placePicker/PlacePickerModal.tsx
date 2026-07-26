import { PressableScale } from "pressto";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, TextInput } from "react-native";
import Config from "react-native-config";
import { FlatList, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import { useGoogleAutocomplete } from "~/hooks/useGoogleAutocomplete";
import { useSavedPlaces } from "~/hooks/useSavedPlaces";
import { AutocompletePrediction } from "~/services/googlePlaces.service";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { haversineDistance } from "~/utils/geo";

import { PlaceType } from "../../../lib/placesTypes";

const GOOGLE_PLACES_API_KEY = Config.GOOGLE_MAPS_API_KEY ?? "";
const REGION_CODES = ["ke"];
/** App brand teal — the header accent (matches the app background). */
const ACCENT_COLOR = "#0f2424";

export interface PlacePickerModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the resolved place once the user picks a result. */
  onSelect: (place: PlaceType) => void;
  /** Optional "Map" header action — opens a choose-on-map flow. */
  onChooseOnMap?: () => void;
  /** Input placeholder — default "Enter an address". */
  placeholder?: string;
  /** Origin for straight-line distances on rows. */
  origin?: { lat: number; lng: number } | null;
  /** Show the local recents list while the query is empty — default true. */
  showRecents?: boolean;
}

/** A unified row: a live prediction or a saved recent place. */
type Row =
  | { kind: "prediction"; prediction: AutocompletePrediction }
  | { kind: "recent"; place: PlaceType };

function formatDistance(meters?: number): string | null {
  if (meters == null || !isFinite(meters)) return null;
  if (meters >= 1000)
    return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
  return `${Math.round(meters)} m`;
}

/**
 * Reusable full-screen place-search modal (Places API New via
 * {@link useGoogleAutocomplete}). Colored header with a close + Map action, a
 * plain RN address input, and a results list that falls back to local recents
 * while empty. Resolves the pick to a {@link PlaceType} and logs it to recents.
 *
 * UI-only and self-contained — drop it anywhere an address is needed (the
 * AddPlaceSheet, pickup/dropoff, profile "saved places", …).
 */
export function PlacePickerModal({
  visible,
  onClose,
  onSelect,
  onChooseOnMap,
  placeholder = "Enter an address",
  origin,
  showRecents = true,
}: PlacePickerModalProps) {
  const { colors, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { recents, addRecent, removeRecent } = useSavedPlaces();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const {
    term,
    setTerm,
    predictions,
    isSearching,
    searchDetails,
    clearSearch,
  } = useGoogleAutocomplete({
    key: GOOGLE_PLACES_API_KEY,
    language: "en",
    includedRegionCodes: REGION_CODES,
    origin: origin ?? undefined,
  });

  const rows = useMemo<Row[]>(() => {
    if (term.trim().length > 0) {
      return predictions.map((prediction) => ({
        kind: "prediction",
        prediction,
      }));
    }
    if (showRecents) {
      return recents.map((place) => ({ kind: "recent", place }));
    }
    return [];
  }, [term, predictions, recents, showRecents]);

  const close = useCallback(() => {
    setTerm("");
    clearSearch();
    setResolvingId(null);
    onClose();
  }, [setTerm, clearSearch, onClose]);

  const commit = useCallback(
    (place: PlaceType) => {
      addRecent(place);
      onSelect(place);
      close();
    },
    [addRecent, onSelect, close],
  );

  const onPressPrediction = useCallback(
    async (prediction: AutocompletePrediction) => {
      if (resolvingId) return;
      setResolvingId(prediction.placeId);
      try {
        const place = await searchDetails(prediction.placeId);
        if (place) commit(place);
      } finally {
        setResolvingId(null);
      }
    },
    [resolvingId, searchDetails, commit],
  );

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      const isRecent = item.kind === "recent";
      const main =
        item.kind === "prediction"
          ? item.prediction.mainText || item.prediction.description
          : item.place.name || item.place.address || "";
      const placeId =
        item.kind === "prediction" ? item.prediction.placeId : undefined;

      let secondary: string;
      let distance: string | null;
      if (item.kind === "prediction") {
        secondary = item.prediction.secondaryText;
        distance = formatDistance(item.prediction.distanceMeters);
      } else {
        secondary =
          item.place.address && item.place.address !== main
            ? item.place.address
            : "";
        distance =
          origin && item.place.lat != null && item.place.lng != null
            ? formatDistance(
                haversineDistance(
                  { latitude: origin.lat, longitude: origin.lng },
                  { latitude: item.place.lat, longitude: item.place.lng },
                ),
              )
            : null;
      }
      const secondaryLine = [secondary, distance].filter(Boolean).join(" · ");

      return (
        <RnView style={[styles.row, { borderBottomColor: colors.gray_50 }]}>
          {/* Row body selects; the trailing X (recents) deletes — separate
              pressables so the delete tap can't also commit the row. */}
          <PressableScale
            style={styles.rowMain}
            onPress={() =>
              item.kind === "prediction"
                ? onPressPrediction(item.prediction)
                : commit(item.place)
            }
          >
            <RnView
              style={[styles.leadingIcon, { backgroundColor: colors.gray_50 }]}
            >
              <Icon
                name={isRecent ? "Clock" : "MapPin"}
                size={18}
                strokeWidth={2}
                color={colors.gray_300}
              />
            </RnView>
            <RnView style={styles.rowText}>
              <RnText
                numberOfLines={1}
                style={[
                  atoms.text_sm,
                  { color: colors.text, fontFamily: fonts.heavy.fontFamily },
                ]}
              >
                {main}
              </RnText>
              {secondaryLine ? (
                <RnText
                  numberOfLines={1}
                  style={[
                    atoms.text_xs,
                    { color: colors.gray_300, marginTop: 2 },
                  ]}
                >
                  {secondaryLine}
                </RnText>
              ) : null}
            </RnView>
          </PressableScale>
          {resolvingId && resolvingId === placeId ? (
            <ActivityIndicator size="small" color={colors.gray_300} />
          ) : (
            <>
              <Icon
                name="Bookmark"
                size={20}
                strokeWidth={2}
                color={colors.gray_100}
              />
              {item.kind === "recent" ? (
                <PressableScale
                  onPress={() => removeRecent(item.place)}
                  hitSlop={10}
                >
                  <Icon
                    name="Trash2"
                    size={20}
                    strokeWidth={2}
                    color={colors.red_500}
                  />
                </PressableScale>
              ) : null}
            </>
          )}
        </RnView>
      );
    },
    [
      colors,
      fonts.heavy.fontFamily,
      origin,
      resolvingId,
      onPressPrediction,
      commit,
      removeRecent,
    ],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <GestureHandlerRootView
        style={[styles.flex, { backgroundColor: colors.background }]}
      >
        {/* Brand-teal header: close + Map action, then the address input. */}
        <RnView
          style={[
            styles.header,
            {
              backgroundColor: ACCENT_COLOR,
              borderBottomColor: colors.gray_50,
              paddingTop: insets.top + 8,
            },
          ]}
        >
          <RnView style={styles.headerRow}>
            <PressableScale onPress={close} hitSlop={12}>
              <Icon name="X" size={26} strokeWidth={2} color="#FFFFFF" />
            </PressableScale>
            {onChooseOnMap ? (
              <PressableScale
                onPress={() => {
                  onChooseOnMap();
                  close();
                }}
                style={styles.mapAction}
                hitSlop={12}
              >
                <Icon name="Map" size={22} strokeWidth={2} color="#FFFFFF" />
                <RnText
                  style={[
                    atoms.text_xs,
                    { color: "#FFFFFF", fontFamily: fonts.heavy.fontFamily },
                  ]}
                >
                  Map
                </RnText>
              </PressableScale>
            ) : null}
          </RnView>

          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.7)"
            autoFocus
            autoCorrect={false}
            style={[
              styles.input,
              atoms.text_xl,
              { color: "#FFFFFF", fontFamily: fonts.heavy.fontFamily },
            ]}
          />
        </RnView>

        <FlatList
          data={rows}
          keyExtractor={(item, index) =>
            item.kind === "prediction"
              ? `p-${item.prediction.placeId}`
              : `r-${item.place.place_id || item.place.id || index}`
          }
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            isSearching && rows.length === 0 ? (
              <RnView style={styles.center}>
                <ActivityIndicator size="small" color={colors.gray_300} />
              </RnView>
            ) : null
          }
          ListEmptyComponent={
            !isSearching && term.trim().length > 0 ? (
              <RnView style={styles.center}>
                <RnText style={[atoms.text_sm, { color: colors.gray_300 }]}>
                  No results
                </RnText>
              </RnView>
            ) : null
          }
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  mapAction: { alignItems: "center", gap: 2 },
  input: {
    paddingVertical: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
  },
  leadingIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  center: { paddingVertical: 28, alignItems: "center" },
});
