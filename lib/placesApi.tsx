import Qs from "qs";
// import { v4 as uuidv4 } from "uuid";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  useMemo,
  SetStateAction,
} from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useDebouncedCallback } from "use-debounce";

import { borderRadius } from "~/constants/styles-token";
import RnTextInput, { AnimatedTextInputRef } from "~/ui/RnTextInput";
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
  const [stateText, setStateText] = useState("");
  const inputRef = useRef<AnimatedTextInputRef>(null);

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
      setStateText(address);
    },
    getAddressText: () => stateText,
    blur: () => inputRef.current?.blur(),
    focus: () => inputRef.current?.focus(),
    isFocused: () => !!inputRef.current?.isFocused(),
    clear: () => inputRef.current?.clear(),
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
          setStateText(preProcess(text));
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
    ],
  );

  const debounceData = useDebouncedCallback(_request, 500, { maxWait: 2000 });

  useEffect(() => {
    return () => {
      debounceData.flush();
    };
  }, [debounceData]);

  const onChangeTextProp = textInputProps?.onChangeText;
  const _handleChangeText = useCallback(
    (text: any) => {
      setStateText(text);
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

  // Guard against undefined textInputProps to prevent destructuring crash
  const {
    onFocus,
    onBlur,
    onChangeText: _onChangeText, // destructuring stops this overriding onChangeText={_handleChangeText}
    clearButtonMode,
    InputComp,
    ...userProps
  } = textInputProps ?? {};

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
          <RnTextInput
            ref={inputRef}
            style={[
              suppressDefaultStyles ? {} : defaultStyles.textInput,
              propStyles?.textInput,
              atoms.text_sm,
              {
                backgroundColor: colors.gray_50,
                color: colors.text,
                fontFamily: fonts.medium.fontFamily,
              },
            ]}
            value={stateText}
            autoComplete="off"
            placeholder={placeholder}
            onFocus={(e) => onFocus?.(e)}
            onBlur={
              onBlur
                ? (e) => {
                    _onBlur(e);
                    onBlur(e);
                  }
                : _onBlur
            }
            clearButtonMode={clearButtonMode || "while-editing"}
            onChangeText={_handleChangeText}
            {...userProps}
          />
          {_renderRightButton()}
        </View>
      )}
    </React.Fragment>
  );
});

GooglePlacesAutocomplete.displayName = "GooglePlacesAutocomplete";

export default { GooglePlacesAutocomplete };
