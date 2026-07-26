import { PlaceType } from "../../lib/placesTypes";

import { Storage } from "./index";

/**
 * Quick-destination shortcut kinds shown as pill chips in the ride-booking
 * suggestions panel. Each maps to a single saved place (or null when unset).
 */
export type ShortcutKind = "home" | "work" | "airport";

export type SavedPlacesSchema = {
  home: PlaceType | null;
  work: PlaceType | null;
  airport: PlaceType | null;
  /** Most-recent-first list of places the user has picked (pickup/dropoff). */
  recents: PlaceType[];
};

const SAVED_PLACES_STORAGE_KEY = "saved-places-storage";

/** How many recent places we keep locally. */
export const MAX_RECENTS = 8;

/**
 * Local (MMKV) store for the booking suggestions panel: Home/Work/Airport
 * shortcuts + an auto-logged list of recently picked places.
 *
 * This is intentionally local-only — it captures name + address + coordinates
 * + place_id at selection time (everything a tappable suggestion needs),
 * works offline, and costs no network calls. If cross-device recents are
 * needed later, add a backend sync alongside `addRecent` (see useSavedPlaces).
 */
export const savedPlacesStorage = new Storage<[], SavedPlacesSchema>(
  SAVED_PLACES_STORAGE_KEY,
);

/** Stable identity for de-duplicating recents. */
export function placeKey(place: PlaceType): string {
  return (
    place.place_id ||
    place.id ||
    place.address ||
    place.name ||
    `${place.lat},${place.lng}`
  );
}
