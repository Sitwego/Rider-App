import * as Location from "expo-location";
import { useEffect, useState } from "react";

import type { LatLng } from "./safetyMessages";

export type RiderLocation = {
  coords: LatLng | null;
  /** Street-level address when reverse geocoding succeeds. */
  address: string | null;
  /** True once a fresh (not last-known) fix has arrived. */
  fresh: boolean;
  permissionDenied: boolean;
};

const formatAddress = (a: Location.LocationGeocodedAddress): string | null =>
  [a.name ?? a.street, a.district ?? a.subregion, a.city]
    .filter((part): part is string => !!part)
    .filter((part, i, all) => all.indexOf(part) === i)
    .join(", ") || null;

/**
 * The rider's own position for the safety sheet: the last known fix
 * immediately, then a fresh high-accuracy one plus a street address. It
 * never prompts for permission — a system dialog mid-emergency is worse
 * than falling back to the car's location.
 */
export function useRiderLocation(): RiderLocation {
  const [state, setState] = useState<RiderLocation>({
    coords: null,
    address: null,
    fresh: false,
    permissionDenied: false,
  });

  useEffect(() => {
    let cancelled = false;
    const update = (patch: Partial<RiderLocation>) => {
      if (!cancelled) setState((s) => ({ ...s, ...patch }));
    };

    (async () => {
      const { granted } = await Location.getForegroundPermissionsAsync();
      if (!granted) {
        update({ permissionDenied: true });
        return;
      }
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        update({
          coords: { lat: last.coords.latitude, lng: last.coords.longitude },
        });
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coords = {
        lat: current.coords.latitude,
        lng: current.coords.longitude,
      };
      update({ coords, fresh: true });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: coords.lat,
        longitude: coords.lng,
      });
      if (place) update({ address: formatAddress(place) });
    })().catch((err) => console.warn("[safety] location lookup failed", err));

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
