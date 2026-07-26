import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import {
  AutocompletePrediction,
  getPlaceDetails,
  searchPlaces,
} from "~/services/googlePlaces.service";

import { PlaceType } from "../../lib/placesTypes";

export interface UseGoogleAutocompleteOptions {
  /** Google Places API key. */
  key: string;
  /** Minimum input length before a request fires — default 2. */
  minLength?: number;
  /** Debounce in ms before a request fires — default 300. */
  debounce?: number;
  /** BCP-47 language for results — default "en". */
  language?: string;
  /** ISO region codes to bias/restrict to, e.g. ["ke"]. */
  includedRegionCodes?: string[];
  /** Origin for straight-line `distanceMeters` on each prediction. */
  origin?: { lat: number; lng: number };
  /** Extra headers (e.g. key-restriction headers). */
  headers?: Record<string, string>;
}

export interface UseGoogleAutocompleteResult {
  /** Current (immediate) search term — controlled by the input. */
  term: string;
  setTerm: (value: string) => void;
  /** Predictions for the debounced term. Empty below `minLength`. */
  predictions: AutocompletePrediction[];
  isSearching: boolean;
  searchError: Error | null;
  /** Clear predictions and cancel any in-flight request. */
  clearSearch: () => void;
  /** Resolve a prediction's full details into a {@link PlaceType}. */
  searchDetails: (placeId: string) => Promise<PlaceType | null>;
}

/**
 * Headless Google Places (New) autocomplete. Ported from
 * `@appandflow/react-native-google-autocomplete` and hardened for this app:
 * debounced term, in-flight abort + a monotonic sequence guard so a slow
 * response can never overwrite a newer one, and details resolved straight into
 * the app's {@link PlaceType}. UI-agnostic — drive it from any TextInput.
 */
export function useGoogleAutocomplete(
  options: UseGoogleAutocompleteOptions,
): UseGoogleAutocompleteResult {
  const { minLength = 2, debounce = 300 } = options;

  const [term, setTermState] = useState("");
  const [predictions, setPredictions] = useState<AutocompletePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Bumped per request; late responses compare against it and bail.
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Latest request params, read at call time so a debounced search never fires
  // with stale `origin`/`headers`. Synced in an effect (not during render).
  const paramsRef = useRef(options);
  useEffect(() => {
    paramsRef.current = options;
  });

  const runSearch = useCallback(async (value: string) => {
    const seq = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);
    try {
      const { key, language, includedRegionCodes, origin, headers } =
        paramsRef.current;
      const results = await searchPlaces(value, {
        key,
        language,
        includedRegionCodes,
        origin,
        headers,
        signal: controller.signal,
      });
      if (!mountedRef.current || seq !== seqRef.current) return;
      setPredictions(results);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!mountedRef.current || seq !== seqRef.current) return;
      setSearchError(err instanceof Error ? err : new Error(String(err)));
      setPredictions([]);
    } finally {
      if (mountedRef.current && seq === seqRef.current) setIsSearching(false);
    }
  }, []);

  // Debounced from the input handler (not a value-effect), so the search fires
  // off the user's keystroke path — no setState-in-effect cascade.
  const debouncedSearch = useDebouncedCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed.length >= minLength) {
      void runSearch(trimmed);
    } else {
      abortRef.current?.abort();
      seqRef.current++; // invalidate any in-flight response
      setPredictions([]);
      setIsSearching(false);
    }
  }, debounce);

  const setTerm = useCallback(
    (value: string) => {
      setTermState(value);
      debouncedSearch(value);
    },
    [debouncedSearch],
  );

  const searchDetails = useCallback((placeId: string) => {
    const { key, language, headers } = paramsRef.current;
    return getPlaceDetails(placeId, { key, language, headers });
  }, []);

  const clearSearch = useCallback(() => {
    debouncedSearch.cancel();
    abortRef.current?.abort();
    seqRef.current++; // invalidate any in-flight response
    setTermState("");
    setPredictions([]);
    setIsSearching(false);
    setSearchError(null);
  }, [debouncedSearch]);

  // Abort any pending request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    term,
    setTerm,
    predictions,
    isSearching,
    searchError,
    clearSearch,
    searchDetails,
  };
}
