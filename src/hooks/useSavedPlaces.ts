import { useCallback, useEffect, useState } from "react";

import {
  MAX_RECENTS,
  placeKey,
  savedPlacesStorage,
  ShortcutKind,
} from "~/storage/savedPlaces";

import { PlaceType } from "../../lib/placesTypes";

/**
 * Reactive access to the local saved-places store (Home/Work/Airport
 * shortcuts + auto-logged recents). Subscribes to MMKV change listeners so
 * multiple mounted consumers stay in sync.
 */
export function useSavedPlaces() {
  const [home, setHome] = useState<PlaceType | null>(() =>
    savedPlacesStorage.get(["home"]),
  );
  const [work, setWork] = useState<PlaceType | null>(() =>
    savedPlacesStorage.get(["work"]),
  );
  const [airport, setAirport] = useState<PlaceType | null>(() =>
    savedPlacesStorage.get(["airport"]),
  );
  const [recents, setRecents] = useState<PlaceType[]>(
    () => savedPlacesStorage.get(["recents"]) ?? [],
  );

  useEffect(() => {
    const listeners = [
      savedPlacesStorage.addOnValueChangedListener(["home"], setHome),
      savedPlacesStorage.addOnValueChangedListener(["work"], setWork),
      savedPlacesStorage.addOnValueChangedListener(["airport"], setAirport),
      savedPlacesStorage.addOnValueChangedListener(["recents"], (value) =>
        setRecents(value ?? []),
      ),
    ];
    return () => listeners.forEach((l) => l.remove());
  }, []);

  /** Save (or clear) a Home/Work/Airport shortcut. */
  const setShortcut = useCallback(
    (kind: ShortcutKind, place: PlaceType | null) => {
      savedPlacesStorage.set([kind], place);
    },
    [],
  );

  /**
   * Prepend a picked place to recents, de-duplicated by identity and capped.
   * Local-only for now — the seam to also POST to a backend recents endpoint
   * would go here.
   */
  const addRecent = useCallback((place: PlaceType) => {
    if (!place || (!place.name && !place.address)) return;
    const key = placeKey(place);
    const existing = savedPlacesStorage.get(["recents"]) ?? [];
    const deduped = existing.filter((p) => placeKey(p) !== key);
    const next = [place, ...deduped].slice(0, MAX_RECENTS);
    savedPlacesStorage.set(["recents"], next);
  }, []);

  /** Remove a single place from recents (matched by identity). */
  const removeRecent = useCallback((place: PlaceType) => {
    const key = placeKey(place);
    const existing = savedPlacesStorage.get(["recents"]) ?? [];
    const next = existing.filter((p) => placeKey(p) !== key);
    if (next.length !== existing.length) {
      savedPlacesStorage.set(["recents"], next);
    }
  }, []);

  const clearRecents = useCallback(() => {
    savedPlacesStorage.set(["recents"], []);
  }, []);

  return {
    home,
    work,
    airport,
    recents,
    setShortcut,
    addRecent,
    removeRecent,
    clearRecents,
  };
}
