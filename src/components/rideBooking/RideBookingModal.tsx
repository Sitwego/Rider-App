import { useNavigation } from "@react-navigation/native";
import React, {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, BackHandler, Keyboard } from "react-native";
import Config from "react-native-config";
import { Pressable } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  interpolate,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { AddPlaceSheet } from "~/components/savedPlaces/AddPlaceSheet";
import { CONSTANTS } from "~/constants/CONSTANTS";
import { useCurrentPlace } from "~/hooks/useCurrentPlace";
import { useGooglePlacesDetails } from "~/hooks/useGooglePlacesDetails";
import { useSavedPlaces } from "~/hooks/useSavedPlaces";
import { useLocationPicker } from "~/providers/LocationPickerProvider";
import { ShortcutKind } from "~/storage/savedPlaces";
import { s } from "~/styles/Common-Styles";
import RnText from "~/ui/RnText";
import { RnAnimatedView, RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { LocationPermissionService } from "~/utils/geo";

import { GooglePlacesAutocomplete } from "../../../lib/placesApi";
import { AddressInputRef, PlaceType } from "../../../lib/placesTypes";
import {
  getAddressComponents,
  getPlaceAutocompleteTerms,
} from "../../../lib/placesUtils";
import Icon from "../Icons";

import { PlacesSuggestionList } from "./PlacesSuggestionList";
import { QuickDestinations } from "./QuickDestinations";

import type {
  GooglePlaceData,
  GooglePlaceDetail,
} from "react-native-google-places-autocomplete";

const GOOGLE_PLACES_API_KEY = Config.GOOGLE_MAPS_API_KEY ?? "";

// Shared config for both autocomplete inputs — defined outside to avoid
// recreating on every render and invalidating fetchPlaceDetails callbacks.
const PLACES_CONFIG = {
  // Places API (New) — https://places.googleapis.com/v1/places:autocomplete
  // and /v1/places/{placeId}. See useGooglePlacesDetails + lib/placesApi.
  url: "https://places.googleapis.com",
  isNewPlacesAPI: true,
  query: {
    key: GOOGLE_PLACES_API_KEY,
    language: "en",
    components: "country:ke",
  },
  requestUrl: {
    useOnPlatform: "all" as const,
    url: "https://places.googleapis.com",
    headers: {} as Record<string, string>,
  },
  fetchDetails: true,
  autoFillOnNotFound: false,
  GooglePlacesDetailsQuery: {},
};

const onFromTimeout = () => console.warn("From request timed out");
const onToTimeout = () => console.warn("To request timed out");
const onStopTimeout = () => console.warn("Stop request timed out");

// Shared layout transition so siblings glide (rather than jump) when the
// stop input mounts/unmounts. Timed easing — no spring overshoot.
const stopLayoutTransition = LinearTransition.duration(220).easing(
  Easing.out(Easing.cubic),
);

// Auto-prefill the pickup only when the fix is at least this accurate (metres).
// A coarse fix (emulator last-known, cell-only tower) would drop a misleading
// pin; below this bar we leave the field for the user to fill by search.
const PICKUP_ACCURACY_GATE_M = 150;

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
    const [activeInput, setActiveInput] = useState<
      "from" | "to" | "stop" | null
    >(null);
    const fromRef = useRef<AddressInputRef>(null);
    const toRef = useRef<AddressInputRef>(null);
    const stopRef = useRef<AddressInputRef>(null);
    const [fromDataSource, setFromDataSource] = useState<any[]>([]);
    const [toDataSource, setToDataSource] = useState<any[]>([]);
    const [stopDataSource, setStopDataSource] = useState<any[]>([]);
    const { colors, fonts } = useAppTheme();
    const modalHeight = useSharedValue(0);
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();

    const [pickup, setPickup] = useState<PlaceType>();
    const [dropOff, setDropOff] = useState<PlaceType>();
    // One optional intermediate stop (Pickup → Stop → DropOff). Max one for
    // now (backend enforces the same cap on its `stops` array).
    const [stop, setStop] = useState<PlaceType>();
    const [stopVisible, setStopVisible] = useState(false);
    const { openPicker } = useLocationPicker();

    const {
      home,
      work,
      airport,
      recents,
      setShortcut,
      addRecent,
      removeRecent,
    } = useSavedPlaces();
    // Current-location resolution (permission → last-known → fresh fix →
    // reverse-geocode). Feeds both the pickup default and the straight-line
    // distance on suggestion rows. Only touches GPS while the sheet is open.
    const {
      coords: currentCoords,
      place: currentPlace,
      accuracy: currentAccuracy,
      status: currentLocationStatus,
      isRefining: currentLocationIsRefining,
      errorCode: currentLocationErrorCode,
      refresh: refreshCurrentPlace,
    } = useCurrentPlace({ enabled: isModalOpened });
    // The pickup auto-fills to the current location, but only while the user
    // hasn't set it themselves. Any manual pickup action flips this permanently
    // for the session so a late fix/geocode can't clobber their choice.
    const pickupTouchedRef = useRef(false);
    // When the user taps an unset Home/Work/Airport chip, we focus the search
    // and remember which shortcut the next picked place should be saved as.
    const pendingShortcutRef = useRef<ShortcutKind | null>(null);
    // Tapping an unset shortcut opens the Add Place sheet; this tracks which
    // shortcut the picked place should be saved as.
    const [addPlaceKind, setAddPlaceKind] = useState<ShortcutKind | null>(null);

    const focusInput = useCallback(() => {
      fromRef.current?.focus();
    }, []);

    const close = useCallback(
      (onClosed?: () => void) => {
        modalHeight.value = withTiming(0, { duration: 300 }, (finished) => {
          if (finished) {
            scheduleOnRN(setIsModalOpened, false);
            if (onClosed) scheduleOnRN(onClosed);
          }
        });
      },
      [modalHeight],
    );

    useEffect(() => {
      if (pickup && dropOff) {
        //@ts-ignore
        navigation.navigate("ConfirmPickupScreen", {
          latitude: pickup.lat ?? 0,
          longitude: pickup.lng ?? 0,
          dropOff,
          // An empty-but-visible stop input never blocks booking — only a
          // chosen stop travels with the request.
          stop,
        });
        // Defer the session reset until the drawer has finished animating
        // closed (and the inner view has unmounted). Clearing synchronously
        // wiped pickup/dropOff ~300ms before the unmount, which flashed the
        // empty state and re-triggered the auto-pickup effect mid-close.
        close(() => {
          setFromDataSource([]);
          setToDataSource([]);
          setStopDataSource([]);
          setDropOff(undefined);
          setPickup(undefined);
          setStop(undefined);
          setStopVisible(false);
          // New session: let the next open re-default the pickup to current
          // location and clear the previous trip's field text.
          pickupTouchedRef.current = false;
          fromRef.current?.setAddressText("");
          toRef.current?.setAddressText("");
        });
      }
    }, [close, dropOff, navigation, pickup, stop]);

    const open = useCallback(() => {
      setIsModalOpened(true);
      modalHeight.value = 0;
      modalHeight.value = withTiming(1, { duration: 300 }, (finished) => {
        if (finished) {
          scheduleOnRN(focusInput);
        }
      });
    }, [focusInput, modalHeight]);

    // Default the pickup to the user's current location — but only into an
    // empty, untouched field, and only when the fix is trustworthy (accuracy
    // gate). A late-arriving fix or geocode never clobbers a pickup the user
    // has set; `currentCoords`/`currentPlace` are stable state refs, so this
    // fires on real resolution steps, not every render.
    useEffect(() => {
      if (!isModalOpened) return;
      if (pickupTouchedRef.current || pickup) return;
      if (!currentCoords || !currentPlace) return;
      if (currentAccuracy != null && currentAccuracy > PICKUP_ACCURACY_GATE_M) {
        return;
      }
      const label =
        currentPlace.name || currentPlace.address || "Current location";
      setPickup({
        ...currentPlace,
        lat: currentCoords.latitude,
        lng: currentCoords.longitude,
      });
      fromRef.current?.setAddressText(label);
    }, [isModalOpened, pickup, currentCoords, currentPlace, currentAccuracy]);

    // CTA shown when current-location resolution was denied: recover per the
    // failure mode (enable GPS / open settings / re-request), then re-resolve.
    const handleEnableLocation = useCallback(async () => {
      if (currentLocationErrorCode === "SERVICES_DISABLED") {
        await LocationPermissionService.promptEnableLocationServices();
      } else if (currentLocationErrorCode === "PERMISSION_BLOCKED") {
        await LocationPermissionService.openAppSettings();
      }
      refreshCurrentPlace();
    }, [currentLocationErrorCode, refreshCurrentPlace]);

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

    // Persist a picked place to recents and, if the user came from tapping an
    // unset Home/Work/Airport chip, save it as that shortcut.
    const commitPickedPlace = useCallback(
      (place: PlaceType | undefined) => {
        if (!place) return;
        addRecent(place);
        if (pendingShortcutRef.current) {
          setShortcut(pendingShortcutRef.current, place);
          pendingShortcutRef.current = null;
        }
      },
      [addRecent, setShortcut],
    );

    const onFromPress = useCallback(
      (data: GooglePlaceData, details: GooglePlaceDetail | null) => {
        const place = saveLocationDetails(data, details);
        pickupTouchedRef.current = true;
        setPickup(place);
        commitPickedPlace(place);
      },
      [saveLocationDetails, commitPickedPlace],
    );

    const onToPress = useCallback(
      (data: GooglePlaceData, details: GooglePlaceDetail | null) => {
        const place = saveLocationDetails(data, details);
        setDropOff(place);
        commitPickedPlace(place);
      },
      [saveLocationDetails, commitPickedPlace],
    );

    const onStopPress = useCallback(
      (data: GooglePlaceData, details: GooglePlaceDetail | null) => {
        const place = saveLocationDetails(data, details);
        setStop(place);
        commitPickedPlace(place);
      },
      [saveLocationDetails, commitPickedPlace],
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
    const stopSetStateText = useCallback(
      (text: string) => stopRef.current?.setAddressText(text),
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

    const { fetchPlaceDetails: stopFetchPlaceDetails } = useGooglePlacesDetails(
      {
        ...PLACES_CONFIG,
        onPress: onStopPress,
        onTimeout: onStopTimeout,
        setStateText: stopSetStateText,
      },
    );

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
        // The Add Place sheet layers above the booking modal — back closes
        // it first; the next back press closes the modal itself.
        if (addPlaceKind != null) {
          setAddPlaceKind(null);
          return true;
        }
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
    }, [addPlaceKind, getIsModalOpened, close]);

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
          case "stop":
            stopFetchPlaceDetails(rowData, () => {
              setStopDataSource([]);
              setActiveInput(null);
            });
            break;
          default:
            console.log("UNKNOWN......!!!!!", rowData);
            break;
        }
      },
      [
        activeInput,
        fromFetchPlaceDetails,
        toFetchPlaceDetails,
        stopFetchPlaceDetails,
      ],
    );

    // Fill whichever input is active with a place chosen from the suggestions
    // panel (recent or saved shortcut), mirroring the "Choose on Map" flow.
    const fillActiveInput = useCallback(
      (place: PlaceType) => {
        const label = place.name || place.address || "";
        if (activeInput === "to") {
          setDropOff(place);
          toRef.current?.setAddressText(label);
          setToDataSource([]);
        } else if (activeInput === "stop") {
          setStop(place);
          stopRef.current?.setAddressText(label);
          setStopDataSource([]);
        } else {
          pickupTouchedRef.current = true;
          setPickup(place);
          fromRef.current?.setAddressText(label);
          setFromDataSource([]);
        }
        setActiveInput(null);
      },
      [activeInput],
    );

    const handleSelectRecent = useCallback(
      (place: PlaceType) => {
        fillActiveInput(place);
        commitPickedPlace(place);
      },
      [fillActiveInput, commitPickedPlace],
    );

    const handleSelectShortcut = useCallback((kind: ShortcutKind) => {
      // The search input keeps the keyboard up when a chip is tapped
      // (keyboardShouldPersistTaps); presenting the sheet mid-keyboard-resize
      // is flaky on some OEMs, and the sheet has its own inputs anyway.
      Keyboard.dismiss();
      setAddPlaceKind(kind);
    }, []);

    // The currently-saved place for the shortcut being edited (prefills the
    // Add Place sheet), or null when setting a fresh one.
    const addPlaceShortcut =
      addPlaceKind === "home"
        ? home
        : addPlaceKind === "work"
          ? work
          : addPlaceKind === "airport"
            ? airport
            : null;

    // Drop every recents entry carrying a shortcut's label (plus the saved
    // place itself) so only ONE "Home"/"Work" row can ever show in the list.
    const removeRecentsForShortcut = useCallback(
      (label: string, place: PlaceType | null) => {
        if (place) removeRecent(place);
        const lowered = label.trim().toLowerCase();
        if (!lowered) return;
        recents
          .filter((p) => (p.name || "").toLowerCase() === lowered)
          .forEach(removeRecent);
      },
      [recents, removeRecent],
    );

    // Save the address the user picked in the Add Place sheet as the shortcut
    // they tapped, then log it to recents (replacing any same-named entry).
    const handleAddPlaceSave = useCallback(
      (place: PlaceType, name: string) => {
        if (!addPlaceKind) return;
        const labeled: PlaceType = { ...place, name: name || place.name };
        removeRecentsForShortcut(labeled.name || "", addPlaceShortcut);
        setShortcut(addPlaceKind, labeled);
        addRecent(labeled);
        setAddPlaceKind(null);
      },
      [
        addPlaceKind,
        addPlaceShortcut,
        setShortcut,
        addRecent,
        removeRecentsForShortcut,
      ],
    );

    const _dataSource =
      activeInput === "from"
        ? fromDataSource
        : activeInput === "stop"
          ? stopDataSource
          : toDataSource;
    // The autocomplete dropdown takes over only once an input has live results;
    // otherwise the SUGGESTIONS panel fills the empty state. Decoupled from
    // `activeInput` so it's visible the moment the sheet opens (programmatic
    // focus doesn't reliably fire the autocomplete's onFocus).
    const _hasDropdown = !!activeInput && _dataSource.length > 0;
    const _showSuggestions = !_hasDropdown;

    // Spinner in the pickup input while current-location resolution is in
    // flight and hasn't yet produced (or been superseded by) a pickup.
    const isResolvingPickup =
      !pickup &&
      !pickupTouchedRef.current &&
      (currentLocationStatus === "locating" || currentLocationIsRefining);

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
          {isResolvingPickup ? (
            <ActivityIndicator size="small" color={colors.primary_400} />
          ) : (
            <Icon
              name="MapPinPlusInside"
              size={24}
              strokeWidth={2}
              color={colors.text}
            />
          )}
        </RnView>
      ),
      [colors.gray_50, colors.text, colors.primary_400, isResolvingPickup],
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

    // Reveal the single intermediate-stop input and focus it. (UI only.)
    const addStop = useCallback(() => {
      setStopVisible(true);
      setActiveInput("stop");
      requestAnimationFrame(() => stopRef.current?.focus());
    }, []);

    // Remove the intermediate-stop input and clear its chosen place.
    const removeStop = useCallback(() => {
      setStopVisible(false);
      setStop(undefined);
      setStopDataSource([]);
      stopRef.current?.setAddressText("");
      setActiveInput((cur) => (cur === "stop" ? null : cur));
    }, []);

    // Small circular waypoint dot for the stop input's left slot.
    const _waypointLeftButton = useCallback(
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
            name="CircleDot"
            size={22}
            strokeWidth={2}
            color={colors.text}
          />
        </RnView>
      ),
      [colors.gray_50, colors.text],
    );

    // "—" affordance on the right of the stop input to remove it.
    const _stopRemoveButton = useCallback(
      () => (
        <Pressable onPress={removeStop} hitSlop={10} style={{ padding: 4 }}>
          <Icon
            name="Minus"
            size={22}
            strokeWidth={2}
            color={colors.gray_300}
          />
        </Pressable>
      ),
      [removeStop, colors.gray_300],
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
                  // Fires only on real user typing (programmatic setAddressText
                  // bypasses it) — a clean "user is setting pickup" signal.
                  onChangeText: () => {
                    pickupTouchedRef.current = true;
                  },
                  onFocus: () => setActiveInput("from"),
                  onBlur: () => {
                    if (activeInput === "from") {
                      setActiveInput(null);
                      setFromDataSource([]);
                    }
                  },
                }}
                isNewPlacesAPI={PLACES_CONFIG.isNewPlacesAPI}
                minLength={3}
                query={PLACES_CONFIG.query}
                requestUrl={PLACES_CONFIG.requestUrl}
                renderLeftButton={_fromLeftButton}
                styles={sharedInputStyles}
                fetchDetails={true}
                onFail={(error: any) => console.error(error)}
              />
              {stopVisible && (
                <Animated.View
                  entering={FadeInDown.duration(220).easing(
                    Easing.out(Easing.cubic),
                  )}
                  exiting={FadeOutUp.duration(160)}
                  layout={stopLayoutTransition}
                >
                  <GooglePlacesAutocomplete
                    setFromDataSource={setStopDataSource}
                    ref={stopRef}
                    placeholder="Add a stop"
                    predefinedPlaces={[]}
                    textInputProps={{
                      onFocus: () => setActiveInput("stop"),
                      onBlur: () => {
                        if (activeInput === "stop") {
                          setActiveInput(null);
                          setStopDataSource([]);
                        }
                      },
                    }}
                    isNewPlacesAPI={PLACES_CONFIG.isNewPlacesAPI}
                    minLength={3}
                    query={PLACES_CONFIG.query}
                    requestUrl={PLACES_CONFIG.requestUrl}
                    renderLeftButton={_waypointLeftButton}
                    renderRightButton={_stopRemoveButton}
                    styles={sharedInputStyles}
                    fetchDetails={true}
                    onFail={(error: any) => console.error(error)}
                  />
                </Animated.View>
              )}
              <Animated.View layout={stopLayoutTransition}>
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
                  isNewPlacesAPI={PLACES_CONFIG.isNewPlacesAPI}
                  minLength={3}
                  query={PLACES_CONFIG.query}
                  requestUrl={PLACES_CONFIG.requestUrl}
                  renderLeftButton={_stopLeftButton}
                  styles={sharedInputStyles}
                  fetchDetails={true}
                  onFail={(error: any) => console.error(error)}
                />
              </Animated.View>
              <Animated.View
                layout={stopLayoutTransition}
                style={[
                  s.flexDirectionRow,
                  s.alignCenter,
                  {
                    justifyContent: "space-between",
                    paddingHorizontal: 16,
                    paddingVertical: 4,
                  },
                ]}
              >
                <Pressable
                  disabled={!activeInput}
                  style={{ opacity: activeInput ? 1 : 0.4 }}
                  onPress={() => {
                    openPicker((result) => {
                      // result.name carries the POI label when the pin landed on
                      // one (else the address); prefer it for display + name.
                      const label = result.name || result.address;
                      const place: PlaceType = {
                        address: result.address,
                        name: label,
                        lat: result.latitude,
                        lng: result.longitude,
                      };
                      if (activeInput === "from") {
                        pickupTouchedRef.current = true;
                        setPickup(place);
                        fromRef.current?.setAddressText(label);
                      } else if (activeInput === "stop") {
                        setStop(place);
                        stopRef.current?.setAddressText(label);
                      } else {
                        setDropOff(place);
                        toRef.current?.setAddressText(label);
                      }
                      commitPickedPlace(place);
                    });
                  }}
                >
                  <RnView style={[s.flexDirectionRow, s.gap16, s.alignCenter]}>
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
                {!stopVisible && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(120)}
                  >
                    <Pressable onPress={addStop}>
                      <RnView
                        style={[s.flexDirectionRow, s.gap16, s.alignCenter]}
                      >
                        <Icon
                          name="Plus"
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
                          Add a stop
                        </RnText>
                      </RnView>
                    </Pressable>
                  </Animated.View>
                )}
              </Animated.View>
            </RnView>
            {_hasDropdown && (
              <PlacesSuggestionList items={_dataSource} onSelect={_onPress} />
            )}
            {_showSuggestions && currentLocationStatus === "denied" && (
              <Pressable
                onPress={handleEnableLocation}
                style={[
                  s.flexDirectionRow,
                  s.alignCenter,
                  s.gap16,
                  { paddingHorizontal: 16, paddingVertical: 12 },
                ]}
              >
                <Icon
                  name="LocateFixed"
                  size={22}
                  strokeWidth={2}
                  color={colors.primary_400}
                />
                <RnText
                  style={[atoms.text_xs, { color: colors.text, flex: 1 }]}
                >
                  Turn on location to set your pickup automatically
                </RnText>
              </Pressable>
            )}
            {_showSuggestions && (
              <QuickDestinations
                shortcuts={{ home, work, airport }}
                recents={recents}
                origin={currentCoords}
                disabledShortcuts={AIRPORT_DISABLED}
                onSelectPlace={handleSelectRecent}
                onSelectShortcut={handleSelectShortcut}
              />
            )}
          </RnAnimatedView>
        )}
        <AddPlaceSheet
          open={addPlaceKind != null}
          onClose={() => setAddPlaceKind(null)}
          title={
            addPlaceKind
              ? `${addPlaceShortcut ? "Edit" : "Add"} ${capitalize(addPlaceKind)}`
              : "Add Place"
          }
          initialName={addPlaceKind ? capitalize(addPlaceKind) : ""}
          initialPlace={addPlaceShortcut}
          origin={
            currentCoords
              ? { lat: currentCoords.latitude, lng: currentCoords.longitude }
              : null
          }
          onSave={handleAddPlaceSave}
        />
      </React.Fragment>
    );
  }),
);

/** Airport is disabled until its flow is wired up. */
const AIRPORT_DISABLED: ShortcutKind[] = ["airport"];

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
