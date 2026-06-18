import {
  Host,
  TextField,
  Text as ComposeText,
  useNativeState,
  type TextFieldRef,
} from "@expo/ui/jetpack-compose";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import Qs from "qs";
// import { v4 as uuidv4 } from "uuid";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useCallback,
  useMemo,
  SetStateAction,
} from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useDebouncedCallback } from "use-debounce";

import { borderRadius } from "~/constants/styles-token";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

import { AddressInputRef, GooglePlacesAutocompleteProps } from "./placesTypes";

const defaultStyles = {
  container: {
    flex: 1,
  },
  textInputContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  textInput: {
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flex: 1,
  },
  listView: {
    borderBottomWidth: 0,
    flex: 1,
    borderRadius: 0,
  },
  row: {
    padding: 13,
    minHeight: 44,
    flexDirection: "row",
    borderRadius: 5,
  },
  loader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    height: 20,
  },
  description: {},
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#c8c7cc",
  },
  powered: {},
};

// Module-level pure helpers — no need to recreate on every render
const getRequestHeaders = (
  requestUrl:
    | {
        url: string;
        useOnPlatform: "web" | "all";
        headers: Record<string, string>;
      }
    | undefined,
) => requestUrl?.headers || {};

const setRequestHeaders = (
  request: XMLHttpRequest,
  headers: Record<string, string>,
) => {
  Object.keys(headers).forEach((headerKey) =>
    request.setRequestHeader(headerKey, headers[headerKey]),
  );
};

const filterResultsByTypes = (unfilteredResults: any[], types: any[]) => {
  if (types.length === 0) return unfilteredResults;
  return unfilteredResults.filter((result) =>
    types.some((type) => result.types.indexOf(type) !== -1),
  );
};

const filterResultsByPlacePredictions = (unfilteredResults: any[]) =>
  unfilteredResults
    .filter((r) => r.placePrediction)
    .map((r) => ({
      description: r.placePrediction.text?.text,
      place_id: r.placePrediction.placeId,
      reference: r.placePrediction.placeId,
      structured_formatting: {
        main_text: r.placePrediction.structuredFormat?.mainText?.text,
        secondary_text: r.placePrediction.structuredFormat?.secondaryText?.text,
      },
      types: r.placePrediction.types ?? [],
    }));

const isNewFocusInAutocompleteResultList = ({ relatedTarget }: any) => {
  if (!relatedTarget) return false;
  let node = relatedTarget.parentNode;
  while (node) {
    if (node.id === "result-list-id") return true;
    node = node.parentNode;
  }
  return false;
};

export const GooglePlacesAutocomplete = forwardRef<
  AddressInputRef,
  GooglePlacesAutocompleteProps
>((props, ref) => {
  const {
    requestUrl,
    minLength,
    timeout,
    onTimeout,
    nearbyPlacesAPI,
    filterReverseGeocodingByTypes,
    setFromDataSource,
    onFail,
    preProcess,
    isNewPlacesAPI,
    query,
    suppressDefaultStyles,
    styles: propStyles,
    textInputHide,
    placeholder,
    renderLeftButton,
    renderRightButton,
    textInputProps,
  } = props;

  // Use a ref so in-flight requests survive re-renders and can always be aborted
  const _requestsRef = useRef<XMLHttpRequest[]>([]);

  const { colors, fonts } = useAppTheme();
  // Native observable state shared between JS and the Jetpack Compose TextField.
  // It is the single source of truth for the field's displayed value.
  const textState = useNativeState("");
  const inputRef = useRef<TextFieldRef>(null);
  const isFocusedRef = useRef(false);

  // Derive url directly instead of useState + useEffect to avoid an extra render cycle
  const url = useMemo(() => {
    if (requestUrl) {
      if (requestUrl.useOnPlatform === "all") return requestUrl.url;
      if (requestUrl.useOnPlatform === "web") {
        return Platform.select({
          web: requestUrl.url,
          default: "https://maps.googleapis.com/maps/api",
        });
      }
    }
    return "https://maps.googleapis.com/maps/api";
  }, [requestUrl]);

  const requestShouldUseWithCredentials =
    url === "https://maps.googleapis.com/maps/api";

  const _abortRequests = useCallback(() => {
    _requestsRef.current.forEach((i) => {
      i.onreadystatechange = null;
      i.abort();
    });
    _requestsRef.current = [];
  }, []);

  useEffect(() => {
    return () => _abortRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    setAddressText: (address: SetStateAction<string>) => {
      const next =
        typeof address === "function" ? address(textState.get()) : address;
      textState.set(next);
      // Place the caret at the end of the newly set text (e.g. after a
      // location is picked) instead of leaving it where the user last was.
      inputRef.current?.setSelection(next.length, next.length);
    },
    getAddressText: () => textState.get(),
    blur: () => inputRef.current?.blur(),
    focus: () => inputRef.current?.focus(),
    isFocused: () => isFocusedRef.current,
    clear: () => {
      inputRef.current?.clear();
      textState.set("");
    },
  }));

  const supportedPlatform = useCallback(() => {
    if (Platform.OS === "web" && !requestUrl) {
      console.warn(
        "This library cannot be used for the web unless you specify the requestUrl prop.",
      );
      return false;
    }
    return true;
  }, [requestUrl]);

  const _request = useCallback(
    (text: any) => {
      _abortRequests();
      if (!url) {
        console.error("URL is undefined");
        return;
      }
      if (supportedPlatform() && text && text.length >= (minLength ?? 0)) {
        const request = new XMLHttpRequest();
        _requestsRef.current.push(request);
        request.timeout = timeout ?? 10000;
        request.ontimeout =
          onTimeout ?? (() => console.warn("Request timed out"));

        request.onreadystatechange = () => {
          if (request.readyState !== 4) return;

          if (request.status === 200) {
            try {
              const responseJSON = JSON.parse(request.responseText);
              if (responseJSON.predictions) {
                const results =
                  nearbyPlacesAPI === "GoogleReverseGeocoding"
                    ? filterResultsByTypes(
                        responseJSON.predictions,
                        filterReverseGeocodingByTypes ?? [],
                      )
                    : responseJSON.predictions;
                setFromDataSource?.(results);
              } else if (responseJSON.suggestions) {
                setFromDataSource?.(
                  filterResultsByPlacePredictions(responseJSON.suggestions),
                );
              } else if (responseJSON.error_message) {
                onFail?.(responseJSON.error_message) ||
                  console.warn("google places autocomplete: " + responseJSON);
              }
            } catch (error) {
              console.error("Failed to parse response:", error);
            }
          } else {
            console.warn(
              "google places autocomplete: request failed with status " +
                request.status,
            );
          }
        };

        if (preProcess) {
          textState.set(preProcess(text));
        }

        if (isNewPlacesAPI) {
          if (!query?.key) {
            console.error("API key is missing");
            return;
          }
          const keyQueryParam = "?" + Qs.stringify({ key: query.key });
          request.open(
            "POST",
            `${url}/v1/places:autocomplete${keyQueryParam}`,
            true,
          );
          request.withCredentials = requestShouldUseWithCredentials;
          setRequestHeaders(request, getRequestHeaders(requestUrl));
          if (query.language) {
            request.setRequestHeader("Accept-Language", query.language);
          }
          request.setRequestHeader("Content-Type", "application/json");
          request.send(JSON.stringify({ input: text }));
        } else {
          request.open(
            "GET",
            `${url}/place/autocomplete/json?input=` +
              encodeURIComponent(text) +
              "&" +
              Qs.stringify(query),
          );
          request.withCredentials = requestShouldUseWithCredentials;
          setRequestHeaders(request, getRequestHeaders(requestUrl));
          request.send();
        }
      }
    },
    [
      _abortRequests,
      url,
      supportedPlatform,
      minLength,
      timeout,
      onTimeout,
      nearbyPlacesAPI,
      filterReverseGeocodingByTypes,
      setFromDataSource,
      onFail,
      preProcess,
      isNewPlacesAPI,
      query,
      requestUrl,
      requestShouldUseWithCredentials,
      textState,
    ],
  );

  const debounceData = useDebouncedCallback(_request, 500, { maxWait: 2000 });

  useEffect(() => {
    return () => {
      debounceData.flush();
    };
  }, [debounceData]);

  const onChangeTextProp = textInputProps?.onChangeText;
  // The native TextField already writes the new value into `textState`, so we
  // only need to kick off the debounced request and notify the consumer.
  const _handleValueChange = useCallback(
    (text: string) => {
      debounceData(text);
      onChangeTextProp?.(text);
    },
    [debounceData, onChangeTextProp],
  );

  const _onBlur = useCallback((e?: any) => {
    if (e && isNewFocusInAutocompleteResultList(e)) return;
    inputRef?.current?.blur();
  }, []);

  const _renderLeftButton = useCallback(
    () => renderLeftButton?.(),
    [renderLeftButton],
  );

  const _renderRightButton = useCallback(
    () => renderRightButton?.(),
    [renderRightButton],
  );

  // Guard against undefined textInputProps to prevent destructuring crash.
  // Only focus/blur are bridged to the Compose TextField; the remaining RN
  // TextInput props are not forwarded since they don't map to a native view.
  const { onFocus, onBlur } = textInputProps ?? {};

  // The Compose TextField reports focus through a single boolean callback
  // instead of the RN focus/blur event pair.
  const _handleFocusChanged = useCallback(
    (focused: boolean) => {
      isFocusedRef.current = focused;
      if (focused) {
        onFocus?.(undefined as any);
      } else {
        _onBlur();
        onBlur?.(undefined as any);
      }
    },
    [onFocus, onBlur, _onBlur],
  );

  return (
    <React.Fragment>
      {!textInputHide && (
        <View
          style={[
            atoms.gap_sm,
            suppressDefaultStyles ? {} : defaultStyles.textInputContainer,
            propStyles?.textInputContainer,
            {
              borderColor: colors.gray_50,
              borderWidth: 1,
              borderRadius: borderRadius.sm,
              backgroundColor: colors.bg_50,
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              shadowColor: colors.gray_700,
              shadowOffset: {
                width: 0,
                height: 2,
              },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
              elevation: 5,
            },
          ]}
        >
          {_renderLeftButton()}
          <Host
            style={defaultStyles.textInput}
            matchContents={{ vertical: true }}
          >
            <TextField
              ref={inputRef}
              value={textState}
              singleLine
              autoFocus={false}
              modifiers={[fillMaxWidth()]}
              keyboardOptions={{
                autoCorrectEnabled: false,
                capitalization: "none",
              }}
              textStyle={{
                ...atoms.text_sm,
                color: colors.text,
                fontFamily: fonts.medium.fontFamily,
              }}
              colors={{
                focusedContainerColor: "rgba(15, 36, 36, 0.05)",
                unfocusedContainerColor: "rgba(15, 36, 36, 0.05)",
                focusedIndicatorColor: "transparent",
                unfocusedIndicatorColor: "transparent",
                cursorColor: colors.text,
                focusedPlaceholderColor: colors.gray_300,
                unfocusedPlaceholderColor: colors.gray_300,
              }}
              onValueChange={_handleValueChange}
              onFocusChanged={_handleFocusChanged}
            >
              {placeholder ? (
                <TextField.Placeholder>
                  <ComposeText
                    color={colors.gray_300}
                    style={{
                      ...atoms.text_sm,
                      fontFamily: fonts.medium.fontFamily,
                    }}
                  >
                    {placeholder}
                  </ComposeText>
                </TextField.Placeholder>
              ) : null}
            </TextField>
          </Host>
          {_renderRightButton()}
        </View>
      )}
    </React.Fragment>
  );
});

GooglePlacesAutocomplete.displayName = "GooglePlacesAutocomplete";

export default { GooglePlacesAutocomplete };
