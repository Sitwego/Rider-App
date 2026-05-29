import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Keyboard, StyleSheet } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { LocationResult } from "react-native-place-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import LocationPicker from "~/components/LocationPicker";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";

type OnLocationSelected = (result: LocationResult) => void;

type LocationPickerApi = {
  openPicker: (onSelected: OnLocationSelected) => void;
};

const LocationPickerContext = createContext<LocationPickerApi>({
  openPicker: () => {
    throw new Error(
      "useLocationPicker must be used within LocationPickerProvider",
    );
  },
});

export const LocationPickerProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const onSelectedRef = useRef<OnLocationSelected | null>(null);
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const openPicker = useCallback((onSelected: OnLocationSelected) => {
    Keyboard.dismiss();
    onSelectedRef.current = onSelected;
    setIsOpen(true);
  }, []);

  const handleLocationSelected = useCallback((result: LocationResult) => {
    onSelectedRef.current?.(result);
    setIsOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <LocationPickerContext.Provider value={{ openPicker }}>
      {children}
      {isOpen && (
        <RnView style={StyleSheet.absoluteFillObject}>
          <LocationPicker onLocationSelected={handleLocationSelected} />
          <Pressable
            style={{
              position: "absolute",
              top: insets.top + 16,
              left: 16,
              padding: 8,
            }}
            onPress={handleClose}
          >
            <Icon
              name="ArrowLeft"
              size={24}
              strokeWidth={2}
              color={colors.text}
            />
          </Pressable>
        </RnView>
      )}
    </LocationPickerContext.Provider>
  );
};

export const useLocationPicker = () => useContext(LocationPickerContext);
