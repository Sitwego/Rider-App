import { useCallback, useImperativeHandle, useMemo, useState } from "react";
import { Keyboard } from "react-native";
import DatePicker from "react-native-date-picker";

import { useAppTheme } from "~/ui/theme";
import { toSimpleDateString } from "~/utils/math/times";

import { DateFieldButton } from "./DateButton";

export type DateFieldRef = {
  focus: () => void;
  blur: () => void;
};
export type DateFieldProps = {
  value: string | Date;
  onChangeDate: (date: string) => void;
  label: string;
  inputRef?: React.Ref<DateFieldRef>;
  isInvalid?: boolean;
  testID?: string;
  accessibilityHint?: string;
  maximumDate?: string | Date;
  minimumDate?: string | Date;
};

export function DateInputField({
  value,
  inputRef,
  onChangeDate,
  label,
  isInvalid,
  maximumDate,
  minimumDate,
}: DateFieldProps) {
  const { colors, fonts, themeMode } = useAppTheme();
  const [open, setOpen] = useState(false);

  // Memoize parsed dates — avoids new Date() on every render
  const parsedDate = useMemo(
    () => (value ? new Date(value) : new Date()),
    [value],
  );

  const parsedMinDate = useMemo(
    () => (minimumDate ? new Date(toSimpleDateString(minimumDate)) : undefined),
    [minimumDate],
  );

  const parsedMaxDate = useMemo(
    () => (maximumDate ? new Date(toSimpleDateString(maximumDate)) : undefined),
    [maximumDate],
  );

  // setOpen is stable (guaranteed by React) — not needed in dep array
  const onConfirmDate = useCallback(
    (date: Date) => {
      setOpen(false);
      onChangeDate(toSimpleDateString(date));
    },
    [onChangeDate],
  );

  useImperativeHandle(
    inputRef,
    () => ({
      focus: () => {
        Keyboard.dismiss();
        setOpen(true);
      },
      blur: () => {
        setOpen(false);
      },
    }),
    [],
  );

  const onPress = useCallback(() => {
    setOpen(true);
  }, []);

  const onCancel = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <DateFieldButton
        label={label}
        value={value}
        onPress={onPress}
        isInvalid={isInvalid}
      />

      {/* Always mounted — avoids tearing down/re-initializing the native module on every open/close */}
      <DatePicker
        modal
        open={open}
        timeZoneOffsetInMinutes={0}
        theme={themeMode as any}
        buttonColor={colors.text}
        date={parsedDate}
        onConfirm={onConfirmDate}
        onCancel={onCancel}
        mode="date"
        locale="en"
        is24hourSource="locale"
        minimumDate={parsedMinDate}
        maximumDate={parsedMaxDate}
      />
    </>
  );
}
