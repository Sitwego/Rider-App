import { useCallback, useEffect, useMemo, useRef } from "react";
import { Keyboard } from "react-native";
import Qs from "qs";

interface UseGooglePlacesDetailsProps {
  url: string;
  query: { key?: string; language?: string; [key: string]: any } | undefined;
  GooglePlacesDetailsQuery?: Record<string, any>;
  requestUrl?: {
    url: string;
    useOnPlatform: "web" | "all";
    headers: Record<string, string>;
  };
  fetchDetails?: boolean;
  autoFillOnNotFound?: boolean;
  onPress?: (rowData: any, details: any) => void;
  onTimeout?: () => void;
  setStateText: (text: string) => void;
}

const setRequestHeaders = (
  request: XMLHttpRequest,
  headers: Record<string, string>,
) => {
  Object.keys(headers).map((headerKey) =>
    request.setRequestHeader(headerKey, headers[headerKey]),
  );
};

const getRequestHeaders = (
  requestUrl:
    | {
        url: string;
        useOnPlatform: "web" | "all";
        headers: Record<string, string>;
      }
    | undefined,
) => {
  return requestUrl?.headers || {};
};

export const useGooglePlacesDetails = ({
  url,
  query,
  GooglePlacesDetailsQuery,
  requestUrl,
  fetchDetails,
  autoFillOnNotFound,
  onTimeout,
  onPress,
  setStateText,
}: UseGooglePlacesDetailsProps) => {
  const requestsRef = useRef<XMLHttpRequest[]>([]);

  // Function to abort all active requests
  const abortRequests = useCallback(() => {
    requestsRef.current.forEach((request) => {
      request.onreadystatechange = null;
      request.abort();
    });
    requestsRef.current = [];
  }, []);

  const renderDescription = useCallback((rowData: any) => {
    return rowData.description || rowData.formatted_address || rowData.name;
  }, []);

  const requestShouldUseWithCredentials = useMemo(
    () => url === "https://maps.googleapis.com/maps/api",
    [url],
  );

  const fetchPlaceDetails = useCallback(
    (rowData: any, onBlur?: (e: any) => void) => {
      if (rowData.isLoading === true) {
        // Already requesting
        return;
      }

      Keyboard.dismiss();
      abortRequests();

      // Fetch details
      const request = new XMLHttpRequest();
      requestsRef.current.push(request);
      request.timeout = 10000; // Default timeout
      request.ontimeout =
        onTimeout || (() => console.warn("Request timed out"));

      request.onreadystatechange = () => {
        if (request.readyState !== 4) return;

        if (request.status === 200) {
          try {
            const responseJSON = JSON.parse(request.responseText);
            if (responseJSON.status === "OK" && responseJSON.result) {
              onBlur?.(null);
              setStateText(renderDescription(rowData));
              delete rowData.isLoading;
              onPress?.(rowData, responseJSON.result);
            } else {
              if (autoFillOnNotFound) {
                setStateText(renderDescription(rowData));
                delete rowData.isLoading;
              }
            }
          } catch (error) {
            console.error("Failed to parse response:", error);
          }
        } else {
          console.warn(
            "google places autocomplete: request could not be completed or has been aborted",
          );
        }
      };

      request.open(
        "GET",
        `${url}/place/details/json?` +
          Qs.stringify({
            key: query?.key,
            placeid: rowData.place_id,
            language: query?.language,
            ...GooglePlacesDetailsQuery,
          }),
      );
      request.withCredentials = requestShouldUseWithCredentials;
      setRequestHeaders(request, getRequestHeaders(requestUrl));
      request.send();
    },
    [
      abortRequests,
      onTimeout,
      url,
      query?.key,
      query?.language,
      GooglePlacesDetailsQuery,
      requestShouldUseWithCredentials,
      requestUrl,
      setStateText,
      renderDescription,
      onPress,
      autoFillOnNotFound,
    ],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRequests();
    };
  }, [abortRequests]);

  return { fetchPlaceDetails, abortRequests };
};
