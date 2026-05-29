import { useNavigation } from "@react-navigation/native";
import Config from "react-native-config";
import React, {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { BackHandler, FlatList, StyleSheet } from "react-native";
import { Pressable, ScrollView } from "react-native-gesture-handler";
import {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  interpolate,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { CONSTANTS } from "~/constants/CONSTANTS";
import { useGooglePlacesDetails } from "~/hooks/useGooglePlacesDetails";
import { useLocationPicker } from "~/providers/LocationPickerProvider";
import { s } from "~/styles/Common-Styles";
import RnText from "~/ui/RnText";
import { RnAnimatedView, RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

import { GooglePlacesAutocomplete } from "../../../lib/placesApi";
import { AddressInputRef, PlaceType } from "../../../lib/placesTypes";
import {
  getAddressComponents,
  getPlaceAutocompleteTerms,
} from "../../../lib/placesUtils";
import Icon from "../Icons";

import type {
  GooglePlaceData,
  GooglePlaceDetail,
} from "react-native-google-places-autocomplete";

const GOOGLE_PLACES_API_KEY = Config.GOOGLE_MAPS_API_KEY ?? "";

// Shared config for both autocomplete inputs — defined outside to avoid
// recreating on every render and invalidating fetchPlaceDetails callbacks.
const PLACES_CONFIG = {
  url: "https://maps.googleapis.com/maps/api",
  query: {
    key: GOOGLE_PLACES_API_KEY,
    language: "en",
    components: "country:ke",
  },
  requestUrl: {
    useOnPlatform: "all" as const,
    url: "https://maps.googleapis.com/maps/api",
    headers: {} as Record<string, string>,
  },
  fetchDetails: true,
  autoFillOnNotFound: false,
  GooglePlacesDetailsQuery: {},
};

const onFromTimeout = () => console.warn("From request timed out");
const onToTimeout = () => console.warn("To request timed out");

interface Props {
  children: React.ReactNode | React.ReactElement;
}

export interface RideBookingModalRef {
  open: () => void;
  close: () => void;
}

export const RideBookingModal = memo(
  React.forwardRef<RideBookingModalRef, Props>(({ children }, ref) => {
    const [isModalOpened, setIsModalOpened] = useState(false);
    const [activeInput, setActiveInput] = useState<"from" | "to" | null>(null);
    const fromRef = useRef<AddressInputRef>(null);
    const toRef = useRef<AddressInputRef>(null);
    const [fromDataSource, setFromDataSource] = useState<any[]>([]);
    const [toDataSource, setToDataSource] = useState<any[]>([]);
    const { colors, fonts } = useAppTheme();
    const modalHeight = useSharedValue(0);
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();

    const [pickup, setPickup] = useState<PlaceType>();
    const [dropOff, setDropOff] = useState<PlaceType>();
    const { openPicker } = useLocationPicker();

    const focusInput = useCallback(() => {
      fromRef.current?.focus();
    }, []);

    const close = useCallback(() => {
      modalHeight.value = withTiming(0, { duration: 300 }, (finished) => {
        if (finished) {
          scheduleOnRN(setIsModalOpened, false);
        }
      });
    }, [modalHeight]);

    useEffect(() => {
      if (pickup && dropOff) {
        close();
        //@ts-ignore
        navigation.navigate("ConfirmPickupScreen", {
          latitude: pickup.lat ?? 0,
          longitude: pickup.lng ?? 0,
          dropOff,
        });
        setFromDataSource([]);
        setToDataSource([]);
        setDropOff(undefined);
        setPickup(undefined);
      }
    }, [close, dropOff, navigation, pickup]);

    const open = useCallback(() => {
      setIsModalOpened(true);
      modalHeight.value = 0;
      modalHeight.value = withTiming(1, { duration: 300 }, (finished) => {
        if (finished) {
          scheduleOnRN(focusInput);
        }
      });
    }, [focusInput, modalHeight]);

    const saveLocationDetails = useCallback(
      (
        autocompleteData: GooglePlaceData,
        details: GooglePlaceDetail | null,
      ) => {
        const addressComponents = details?.address_components;
        if (!addressComponents) {
          return;
        }

        const {
          street_number: streetNumber,
          route: streetName,
          subpremise,
          locality,
          sublocality,
          postal_town: postalTown,
          postal_code: zipCode,
          administrative_area_level_1: state,
          country: countryPrimary,
        } = getAddressComponents(addressComponents, {
          street_number: "long_name",
          route: "long_name",
          subpremise: "long_name",
          locality: "long_name",
          sublocality: "long_name",
          postal_town: "long_name",
          postal_code: "long_name",
          administrative_area_level_1: "short_name",
          administrative_area_level_2: "long_name",
          country: "short_name",
        });

        const { administrative_area_level_1: longStateName } =
          getAddressComponents(addressComponents, {
            administrative_area_level_1: "long_name",
          });

        const {
          country: countryFallbackLongName = "",
          state: stateAutoCompleteFallback = "",
          city: cityAutocompleteFallback = "",
          street: streetAutocompleteFallback = "",
          streetNumber: streetNumberAutocompleteFallback = "",
        } = getPlaceAutocompleteTerms(
          autocompleteData.structured_formatting?.terms ?? [],
        );

        const countryFallback = Object.keys(CONSTANTS.ALL_COUNTRIES).find(
          (country) => country === countryFallbackLongName,
        );

        const country = countryPrimary || countryFallback || "";

        const values = {
          street:
            `${streetNumber || streetNumberAutocompleteFallback} ${streetName || streetAutocompleteFallback}`.trim(),
          name: details.name ?? "",
          street2: subpremise,
          country: "",
          state: state || stateAutoCompleteFallback,
          city:
            locality || postalTown || sublocality || cityAutocompleteFallback,
          zipCode,
          lat: details.geometry.location.lat ?? 0,
          lng: details.geometry.location.lng ?? 0,
          address:
            autocompleteData.description || details.formatted_address || "",
          place_id: details.place_id,
          id: details.id,
        };

        values.state = longStateName;
        if (!values.state) {
          values.state = values.city;
        }

        if (!values.street && details.adr_address) {
          const streetAddressRegex =
            /<span class="street-address">([^<]*)<\/span>/;
          const adrAddress = details.adr_address.match(streetAddressRegex);
          const streetAddressFallback = adrAddress ? adrAddress[1] : null;
          if (streetAddressFallback) {
            values.street = streetAddressFallback;
          }
        }

        const isValidCountryCode = !!Object.keys(CONSTANTS.ALL_COUNTRIES).find(
          (foundCountry) => foundCountry === country,
        );
        if (isValidCountryCode) {
          values.country = country;
        }
        return values;
      },
      [],
    );

    const onFromPress = useCallback(
      (data: GooglePlaceData, details: GooglePlaceDetail | null) => {
        const place = saveLocationDetails(data, details);
        setPickup(place);
      },
      [saveLocationDetails],
    );

    const onToPress = useCallback(
      (data: GooglePlaceData, details: GooglePlaceDetail | null) => {
        const place = saveLocationDetails(data, details);
        setDropOff(place);
      },
      [saveLocationDetails],
    );

    // Stable refs for setStateText to avoid invalidating fetchPlaceDetails
    const fromSetStateText = useCallback(
      (text: string) => fromRef.current?.setAddressText(text),
      [],
    );
    const toSetStateText = useCallback(
      (text: string) => toRef.current?.setAddressText(text),
      [],
    );

    const { fetchPlaceDetails: fromFetchPlaceDetails } = useGooglePlacesDetails(
      {
        ...PLACES_CONFIG,
        onPress: onFromPress,
        onTimeout: onFromTimeout,
        setStateText: fromSetStateText,
      },
    );

    const { fetchPlaceDetails: toFetchPlaceDetails } = useGooglePlacesDetails({
      ...PLACES_CONFIG,
      onPress: onToPress,
      onTimeout: onToTimeout,
      setStateText: toSetStateText,
    });

    useImperativeHandle(ref, () => ({ open, close }), [open, close]);

    const getIsModalOpened = useCallback(
      () => modalHeight.value === 1,
      [modalHeight],
    );

    const translateYStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateY: interpolate(modalHeight.value, [0, 1, 2], [100, 0, 100]),
        },
      ],
    }));

    const opacityStyle = useAnimatedStyle(() => ({
      opacity: interpolate(modalHeight.value, [0, 1, 2], [0, 1, 0]),
    }));

    const drawerContainerProps = useAnimatedProps(() => ({
      pointerEvents:
        modalHeight.value === 1 ? ("auto" as const) : ("none" as const),
    }));

    useEffect(() => {
      const handleBackPress = () => {
        if (getIsModalOpened()) {
          close();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener(
        "hardwareBackPress",
        handleBackPress,
      );
      return () => sub.remove();
    }, [getIsModalOpened, close]);

    const _onPress = useCallback(
      (rowData: any) => {
        switch (activeInput) {
          case "from":
            fromFetchPlaceDetails(rowData, () => {
              setFromDataSource([]);
              setActiveInput(null);
            });
            break;
          case "to":
            toFetchPlaceDetails(rowData, () => {
              setToDataSource([]);
              setActiveInput(null);
            });
            break;
          default:
            console.log("UNKNOWN......!!!!!", rowData);
            break;
        }
      },
      [activeInput, fromFetchPlaceDetails, toFetchPlaceDetails],
    );

    const _renderSeparator = useCallback(
      (sectionID: any, rowID: any) => (
        <RnView
          key={`${sectionID}-${rowID}`}
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: "#c8c7cc",
          }}
        />
      ),
      [],
    );

    const _renderRow = useCallback(
      (rowData: any, _index: number) => {
        const description =
          rowData.description || rowData.formatted_address || rowData.name;
        return (
          <ScrollView
            contentContainerStyle={{ minWidth: "100%" }}
            scrollEnabled={true}
            keyboardShouldPersistTaps="always"
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              style={{ minWidth: "100%", justifyContent: "center" }}
              onPress={() => _onPress(rowData)}
            >
              <RnView
                style={{
                  padding: 13,
                  minHeight: 44,
                  flexDirection: "row",
                  borderRadius: 5,
                }}
              >
                <RnText numberOfLines={2}>{description}</RnText>
              </RnView>
            </Pressable>
          </ScrollView>
        );
      },
      [_onPress],
    );

    const _dataSource = activeInput === "from" ? fromDataSource : toDataSource;

    const _fromLeftButton = useCallback(
      () => (
        <RnView
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.gray_50,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon
            name="MapPinPlusInside"
            size={24}
            strokeWidth={2}
            color={colors.text}
          />
        </RnView>
      ),
      [colors.gray_50, colors.text],
    );

    const _stopLeftButton = useCallback(
      () => (
        <RnView
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.gray_50,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon
            name="CircleStop"
            strokeWidth={2}
            size={24}
            color={colors.red_300}
          />
        </RnView>
      ),
      [colors.gray_50, colors.red_300],
    );

    // Memoize styles that depend on theme to avoid new object refs each render
    const sharedInputStyles = useMemo(
      () => ({
        textInputContainer: {
          backgroundColor: colors.bg_50,
          borderTopWidth: 0,
          borderBottomWidth: 0,
        },
        textInput: { height: 44, color: colors.text, fontSize: 16 },
        predefinedPlacesDescription: { color: colors.bg_50 },
        container: {},
      }),
      [colors.bg_50, colors.text],
    );

    return (
      <React.Fragment>
        {children}
        {isModalOpened && (
          <RnAnimatedView
            animatedProps={drawerContainerProps}
            style={[
              {
                width: "100%",
                display: "flex",
                height: "100%",
                paddingHorizontal: 10,
                paddingTop: insets.top + 16,
                paddingBottom: insets.bottom + 16 + 50,
                position: "absolute",
                bottom: 0,
                backgroundColor: colors.bg_50,
              },
              translateYStyle,
              opacityStyle,
            ]}
          >
            <RnView
              style={[
                atoms.gap_lg,
                {
                  width: "100%",
                  justifyContent: "flex-start",
                  flexDirection: "column",
                },
              ]}
            >
              <GooglePlacesAutocomplete
                setFromDataSource={setFromDataSource}
                ref={fromRef}
                placeholder="Pickup Location"
                predefinedPlaces={[]}
                textInputProps={{
                  onFocus: () => setActiveInput("from"),
                  onBlur: () => {
                    if (activeInput === "from") {
                      setActiveInput(null);
                      setFromDataSource([]);
                    }
                  },
                }}
                isNewPlacesAPI={false}
                minLength={3}
                query={PLACES_CONFIG.query}
                requestUrl={PLACES_CONFIG.requestUrl}
                renderLeftButton={_fromLeftButton}
                styles={sharedInputStyles}
                fetchDetails={true}
                onFail={(error: any) => console.error(error)}
              />
              <GooglePlacesAutocomplete
                setFromDataSource={setToDataSource}
                ref={toRef}
                placeholder="DropOff Location"
                predefinedPlaces={[]}
                textInputProps={{
                  onFocus: () => setActiveInput("to"),
                  onBlur: () => {
                    if (activeInput === "to") {
                      setActiveInput(null);
                      setToDataSource([]);
                    }
                  },
                }}
                isNewPlacesAPI={false}
                minLength={3}
                query={PLACES_CONFIG.query}
                requestUrl={PLACES_CONFIG.requestUrl}
                renderLeftButton={_stopLeftButton}
                styles={sharedInputStyles}
                fetchDetails={true}
                onFail={(error: any) => console.error(error)}
              />
              <Pressable
                disabled={!activeInput}
                style={{
                  width: "100%",
                  paddingHorizontal: 16,
                  paddingVertical: 4,
                  opacity: activeInput ? 1 : 0.4,
                }}
                onPress={() => {
                  openPicker((result) => {
                    const place: PlaceType = {
                      address: result.address,
                      name: result.address,
                      lat: result.latitude,
                      lng: result.longitude,
                    };
                    if (activeInput === "from") {
                      setPickup(place);
                      fromRef.current?.setAddressText(result.address);
                    } else {
                      setDropOff(place);
                      toRef.current?.setAddressText(result.address);
                    }
                  });
                }}
              >
                <RnView
                  style={[
                    s.w100pct,
                    s.flexDirectionRow,
                    s.gap16,
                    s.alignCenter,
                  ]}
                >
                  <Icon
                    name="MapPlus"
                    size={28}
                    strokeWidth={2}
                    color={colors.primary_400}
                  />
                  <RnText
                    style={[
                      atoms.text_xs,
                      { fontFamily: fonts.heavy.fontFamily },
                    ]}
                  >
                    Choose on Map
                  </RnText>
                </RnView>
              </Pressable>
            </RnView>
            {activeInput && _dataSource.length > 0 && (
              <RnAnimatedView style={{ flexBasis: 1, flexGrow: 1 }}>
                <FlatList
                  nativeID="result-list-id"
                  style={{ borderBottomWidth: 0, flex: 1, borderRadius: 0 }}
                  contentContainerStyle={{ paddingTop: 20, flex: 1 }}
                  data={_dataSource}
                  keyExtractor={(item: any) =>
                    item.place_id ?? item.description
                  }
                  renderItem={({ item, index }) => _renderRow(item, index)}
                  //@ts-expect-error
                  ItemSeparatorComponent={_renderSeparator}
                />
              </RnAnimatedView>
            )}
          </RnAnimatedView>
        )}
      </React.Fragment>
    );
  }),
);
