import { useCallback, useState } from "react";
import { Pressable, StyleSheet, TextInput } from "react-native";

import Icon from "~/components/Icons";
import { PlacePickerModal } from "~/components/placePicker/PlacePickerModal";
import { AppBottomSheet } from "~/ui/BottomSheet";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

import { PlaceType } from "../../../lib/placesTypes";

/** App brand teal — the primary action accent (matches the app background). */
const ACCENT_COLOR = "#0f2424";

export interface AddPlaceSheetProps {
  /** Whether the sheet is open. Caller owns this. */
  open: boolean;
  /** Called on every dismiss path — the caller should set `open` to false. */
  onClose: () => void;
  /** Called with the picked place + the (trimmed) label the user entered. */
  onSave: (place: PlaceType, name: string) => void;
  /** Header title — default "Add Place". */
  title?: string;
  /** Pre-fill the name field (e.g. "Work"). */
  initialName?: string;
  /** Pre-fill the address (editing an existing saved place). */
  initialPlace?: PlaceType | null;
  /** Lock the name field (for fixed shortcuts like Home/Work). */
  nameEditable?: boolean;
  /** Origin for distances shown in the picker. */
  origin?: { lat: number; lng: number } | null;
  /** Optional Map action forwarded to the picker. */
  onChooseOnMap?: () => void;
}

type AddPlaceFormProps = Omit<AddPlaceSheetProps, "open">;

/**
 * Reusable "Add Place" bottom sheet: a name field, an address row that opens
 * the {@link PlacePickerModal}, and an Add button. Framework for any
 * saved-address input (Work/Home/Airport shortcuts, profile saved places).
 *
 * Built on the app's shared {@link AppBottomSheet} (never the underlying sheet
 * library directly). The form body lives in {@link AddPlaceForm}, which the
 * sheet mounts fresh on each present so a new Add flow starts clean.
 */
export function AddPlaceSheet({
  open,
  onClose,
  ...formProps
}: AddPlaceSheetProps) {
  const { colors } = useAppTheme();
  return (
    <AppBottomSheet
      open={open}
      onDismiss={onClose}
      detents={[0, "content"]}
      keyboardBehavior="padding"
      // Window-level overlay: the default in-window portal path can present
      // invisibly on some devices (seen on HMD — the deferred "content"-detent
      // open never resolves), while the overlay path works everywhere.
      nativeOverlay
      surface={{ backgroundColor: colors.bg_50 }}
    >
      <AddPlaceForm {...formProps} onClose={onClose} />
    </AppBottomSheet>
  );
}

function AddPlaceForm({
  onClose,
  onSave,
  title = "Add Place",
  initialName = "",
  initialPlace = null,
  nameEditable = true,
  origin,
  onChooseOnMap,
}: AddPlaceFormProps) {
  const { colors, fonts } = useAppTheme();

  const [name, setName] = useState(initialName);
  const [place, setPlace] = useState<PlaceType | null>(initialPlace);
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleSelect = useCallback((selected: PlaceType) => {
    setPlace(selected);
  }, []);

  const canAdd = !!place;

  const handleAdd = useCallback(() => {
    if (!place) return;
    onSave(place, name.trim() || place.name || place.address || "");
    onClose();
  }, [place, name, onSave, onClose]);

  const addressLabel = place?.address || place?.name || "";

  return (
    <>
      <RnView style={styles.container}>
        <RnText
          style={[
            atoms.text_lg,
            {
              color: colors.text,
              fontFamily: fonts.heavy.fontFamily,
              marginBottom: 20,
            },
          ]}
        >
          {title}
        </RnText>

        {/* Name */}
        <RnText
          style={[atoms.text_xs, styles.label, { color: colors.gray_300 }]}
        >
          NAME
        </RnText>
        <RnView
          style={[
            styles.field,
            { backgroundColor: colors.bg_50, borderColor: colors.gray_50 },
          ]}
        >
          <Icon name="Tag" size={18} strokeWidth={2} color={colors.gray_300} />
          <TextInput
            value={name}
            onChangeText={setName}
            editable={nameEditable}
            placeholder="e.g. Work, Mom's house"
            placeholderTextColor={colors.gray_300}
            style={[
              styles.fieldInput,
              atoms.text_sm,
              { color: colors.text, fontFamily: fonts.medium.fontFamily },
            ]}
          />
        </RnView>

        {/* Address — opens the picker */}
        <RnText
          style={[
            atoms.text_xs,
            styles.label,
            { color: colors.gray_300, marginTop: 16 },
          ]}
        >
          ADDRESS
        </RnText>
        {/* RN Pressable, not a gesture-handler pressable: this sheet presents
            in the native-overlay window, where touches reach the JS responder
            system but never the main window's gesture-handler root. */}
        <Pressable
          onPress={() => setPickerVisible(true)}
          style={[
            styles.field,
            { backgroundColor: colors.bg_50, borderColor: colors.gray_50 },
          ]}
        >
          <Icon
            name="MapPin"
            size={18}
            strokeWidth={2}
            color={colors.gray_300}
          />
          <RnText
            numberOfLines={1}
            style={[
              atoms.text_sm,
              styles.fieldInput,
              {
                color: addressLabel ? colors.text : colors.gray_300,
                fontFamily: fonts.medium.fontFamily,
              },
            ]}
          >
            {addressLabel || "Enter an address"}
          </RnText>
          <Icon
            name="ChevronRight"
            size={18}
            strokeWidth={2}
            color={colors.gray_300}
          />
        </Pressable>

        {/* Add */}
        <Pressable
          onPress={handleAdd}
          style={[
            styles.addButton,
            {
              backgroundColor: canAdd ? ACCENT_COLOR : colors.gray_50,
              borderColor: colors.gray_100,
              opacity: canAdd ? 1 : 0.6,
            },
          ]}
        >
          <RnText
            style={[
              atoms.text_md,
              {
                color: canAdd ? "#FFFFFF" : colors.gray_300,
                fontFamily: fonts.heavy.fontFamily,
              },
            ]}
          >
            Add
          </RnText>
        </Pressable>
      </RnView>

      <PlacePickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleSelect}
        onChooseOnMap={onChooseOnMap}
        origin={origin}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
  },
  label: {
    letterSpacing: 1,
    marginBottom: 8,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  fieldInput: {
    flex: 1,
    paddingVertical: 0,
  },
  addButton: {
    marginTop: 28,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
