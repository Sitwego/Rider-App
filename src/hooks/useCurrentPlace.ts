import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getAddressFromGpsPoint,
  LocationErrorCode,
  LocationPermissionService,
} from "~/utils/geo";

import { PlaceType } from "../../lib/placesTypes";

export type CurrentPlaceStatus =
  | "idle"
  | "locating"
  | "resolved"
  | "denied" // permission denied/blocked or GPS services off — caller shows a CTA
  | "unavailable"; // permission ok but no fix could be obtained

export interface CurrentPlaceCoords {
  latitude: number;
  longitude: number;
}

export interface UseCurrentPlaceResult {
  status: CurrentPlaceStatus;
  /** Freshest known position. Available as soon as a fix (last-known or fresh) lands. */
  coords: CurrentPlaceCoords | null;
  /** Horizontal accuracy of `coords` in metres, when the platform reports it. */
  accuracy: number | null;
  /** Reverse-geocoded place for `coords`. Lags `coords` — it's resolved separately. */
  place: PlaceType | null;
  /** A fresh high-accuracy fix is still in flight after an initial last-known fix. */
  isRefining: boolean;
  /** Set when `status` is "denied"/"unavailable", so the caller can branch its CTA. */
  errorCode: LocationErrorCode | null;
  /** Force a re-resolve (e.g. after the user enables permission/GPS). */
  refresh: () => void;
}

interface UseCurrentPlaceOptions {
  /** Gate resolution — pass the modal's open state so GPS isn't touched while hidden. */
  enabled: boolean;
  /** Reuse a cached fix younger than this instead of re-resolving on re-enable. */
  maxAgeMs?: number;
  /** Accept a last-known fix only if it is younger than this (passed to the OS). */
  lastKnownMaxAgeMs?: number;
}

const DEFAULT_MAX_AGE_MS = 60_000;
const DEFAULT_LAST_KNOWN_MAX_AGE_MS = 300_000;
/** Hard cap on the fresh-fix wait so a stalled GPS can never hang resolution. */
const FRESH_FIX_TIMEOUT_MS = 12_000;

/** Rejects with "timeout" if `promise` doesn't settle within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

/**
 * Resolves the user's current place for pre-filling a pickup field, the proper
 * (non-naive) way:
 *
 *  1. Permission/GPS first — via {@link LocationPermissionService}. A non-granted
 *     outcome resolves to `status: "denied"` (never a silent blank) so the caller
 *     can render an actionable CTA.
 *  2. Two-phase fix — emit `getLastKnownPositionAsync` immediately (never blank
 *     when a cached fix exists), then upgrade to a fresh `BestForNavigation` fix.
 *  3. Coords before label — expose `coords` the instant a fix lands (that's all a
 *     booking needs); the reverse-geocoded `place` sharpens the text a beat later
 *     and never blocks usability.
 *
 * Stale async results are dropped via a monotonic sequence guard, so a slow fix
 * or geocode can never clobber a newer one. Auto-prefill policy (don't overwrite
 * the user, gate on accuracy) belongs to the caller — this hook only answers
 * "where is the user right now".
 */
export function useCurrentPlace({
  enabled,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  lastKnownMaxAgeMs = DEFAULT_LAST_KNOWN_MAX_AGE_MS,
}: UseCurrentPlaceOptions): UseCurrentPlaceResult {
  const [status, setStatus] = useState<CurrentPlaceStatus>("idle");
  const [coords, setCoords] = useState<CurrentPlaceCoords | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [place, setPlace] = useState<PlaceType | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [errorCode, setErrorCode] = useState<LocationErrorCode | null>(null);

  // Bumped on every resolve cycle; async callbacks compare against it and bail
  // if a newer cycle has started, so late results never overwrite fresh ones.
  const seqRef = useRef(0);
  // Wall-clock time of the last successful fix, for the maxAge cache check.
  const resolvedAtRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reverseGeocode = useCallback(
    async (seq: number, latitude: number, longitude: number) => {
      try {
        const resolved = await getAddressFromGpsPoint({
          lat: latitude,
          long: longitude,
        });
        if (!mountedRef.current || seq !== seqRef.current || !resolved) return;
        setPlace(resolved);
      } catch {
        // Label is cosmetic — a geocode failure leaves `coords` usable.
      }
    },
    [],
  );

  const resolve = useCallback(async () => {
    const seq = ++seqRef.current;
    setStatus("locating");
    setIsRefining(true);
    setErrorCode(null);

    // 1. Permission + GPS services. A non-granted result is terminal for this
    //    cycle; the caller reacts to `status: "denied"` + `errorCode`.
    const perm = await LocationPermissionService.requestForegroundPermission();
    if (!mountedRef.current || seq !== seqRef.current) return;
    if (!perm.ok) {
      setStatus("denied");
      setErrorCode(perm.error.code);
      setIsRefining(false);
      return;
    }

    let haveFix = false;

    // 2a. Last-known: instant, possibly stale — fill immediately if present.
    try {
      const last = await Location.getLastKnownPositionAsync({
        maxAge: lastKnownMaxAgeMs,
      });
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (last) {
        haveFix = true;
        setCoords({
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
        });
        setAccuracy(last.coords.accuracy ?? null);
        setStatus("resolved");
        void reverseGeocode(seq, last.coords.latitude, last.coords.longitude);
      }
    } catch {
      // Ignore — the fresh fix below is the authoritative attempt.
    }

    // 2b. Fresh fix — upgrades the last-known coords/label. `High` (not
    //     BestForNavigation, which is turn-by-turn grade and slow) is ample for
    //     a pickup pin; a timeout guard guarantees this can never hang.
    try {
      const fresh = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          mayShowUserSettingsDialog: true,
        }),
        FRESH_FIX_TIMEOUT_MS,
      );
      if (!mountedRef.current || seq !== seqRef.current) return;
      haveFix = true;
      resolvedAtRef.current = Date.now();
      setCoords({
        latitude: fresh.coords.latitude,
        longitude: fresh.coords.longitude,
      });
      setAccuracy(fresh.coords.accuracy ?? null);
      setStatus("resolved");
      void reverseGeocode(seq, fresh.coords.latitude, fresh.coords.longitude);
    } catch {
      if (!mountedRef.current || seq !== seqRef.current) return;
      // Keep a last-known fix if we got one; only report failure when we have
      // nothing to show at all.
      if (!haveFix) {
        setStatus("unavailable");
        setErrorCode("API_FAILURE");
      }
    } finally {
      if (mountedRef.current && seq === seqRef.current) setIsRefining(false);
    }
  }, [lastKnownMaxAgeMs, reverseGeocode]);

  const refresh = useCallback(() => {
    void resolve();
  }, [resolve]);

  // Resolve when first enabled, and re-resolve on re-enable only if the cached
  // fix has aged out. Never touches GPS while disabled (modal hidden).
  useEffect(() => {
    if (!enabled) return;
    const isStale = Date.now() - resolvedAtRef.current > maxAgeMs;
    if (
      status === "idle" ||
      (status === "resolved" && isStale) ||
      status === "denied" ||
      status === "unavailable"
    ) {
      // Re-attempt denied/unavailable too: the user may have granted permission
      // or enabled GPS from settings while the sheet was closed.
      void resolve();
    }
    // `status` intentionally omitted: this should fire on enable transitions and
    // reuse the cache otherwise, not loop as status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, maxAgeMs, resolve]);

  return {
    status,
    coords,
    accuracy,
    place,
    isRefining,
    errorCode,
    refresh,
  };
}
