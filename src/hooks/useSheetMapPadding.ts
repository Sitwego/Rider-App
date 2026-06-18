// ----------------------------------------------------------------
// useSheetMapPadding — keeps the followed content (the vehicle marker)
// framed in the visible map area ABOVE the active-ride TrueSheet.
//
// Approach mirrors the captain app's MapScreen: react-native-maps only
// re-positions the camera on a camera op, NOT when `mapPadding` changes on
// its own — so driving padding per-frame does nothing until the next
// GPS-driven follow push (the "map doesn't move while I drag the sheet"
// bug). Instead we react to the sheet SNAPPING to a new detent:
//
//   1. set `mapPadding.bottom` to the sheet's resting visible height (+gap)
//      so every subsequent follow push centers the vehicle above the sheet;
//   2. immediately re-center on the follow target so the map reframes right
//      away rather than waiting ~2 s for the next GPS fix.
//
// The reframe re-centers on the EXPLICIT focus coordinate (the driver
// point), never on `getCamera().center`: under padding that getter returns
// the view's true-center point (south of the target), so reading it and
// writing it back drifts the camera further every open/close cycle (the
// "padding keeps growing" bug). The focus coordinate is padding-independent,
// so the reframe is idempotent.
//
//   const mapPadding = useSheetMapPadding(mapRef, driverPoint);
//   <MapView mapPadding={mapPadding} ... />
// ----------------------------------------------------------------

import { useReanimatedTrueSheet } from "@lodev09/react-native-true-sheet/reanimated";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { height as SCREEN_HEIGHT } from "~/utils/dimensions";

import type MapView from "react-native-maps";

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface UseSheetMapPaddingOptions {
  /** Detent fractions of the sheet (must match the sheet's `detents`). */
  detents?: number[];
  /** Extra px to keep between the focal point area and the sheet. */
  gap?: number;
  /** Duration of the reframe glide on each snap (ms). */
  reframeDurationMs?: number;
}

export function useSheetMapPadding(
  mapRef: RefObject<MapView | null>,
  /** Coordinate the camera follows — the reframe re-centers on this. */
  focus: LatLng | undefined,
  {
    detents = [0.5, 1],
    gap = 20,
    reframeDurationMs = 600,
  }: UseSheetMapPaddingOptions = {},
): MapPadding {
  const { animatedIndex } = useReanimatedTrueSheet();
  const [bottom, setBottom] = useState(0);

  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  // Map a settled detent index to the bottom padding. We derive the resting
  // visible sheet height from the detent FRACTION (not the live animated
  // position, which is still mid-flight when the index snaps), so the padding
  // is exact and stable. Index -1 = dismissed.
  const onSnap = useCallback(
    (index: number) => {
      if (index < 0) {
        setBottom(0);
        return;
      }
      const rawFraction = detents[index] ?? detents[detents.length - 1] ?? 0;
      // Clamp so the camera never lifts too little (0.3) or too much (0.4),
      // regardless of the sheet's actual detent height.
      const fraction = Math.min(0.4, Math.max(0.3, rawFraction));
      const visibleSheet = SCREEN_HEIGHT * fraction;
      setBottom(visibleSheet > 0 ? Math.round(visibleSheet + gap) : 0);
    },
    [detents, gap],
  );

  // Fire once per snap, not per frame: round the continuously-animated index
  // float (e.g. 0.73) to the nearest detent and only react when it changes.
  useAnimatedReaction(
    () => Math.round(animatedIndex.value),
    (current, previous) => {
      if (current !== previous) scheduleOnRN(onSnap, current);
    },
  );

  // After the new padding commits, re-center on the follow target so it lands
  // in the freshly-padded viewport. Deferred one frame so the `mapPadding`
  // prop is flushed to the native map BEFORE we animate — otherwise collapsing
  // the sheet animates against the old (larger) padding and pins the map at
  // the top. A partial camera ({ center }) preserves the current zoom / pitch /
  // heading.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const center = focusRef.current;
      if (center) {
        mapRef.current?.animateCamera(
          { center },
          { duration: reframeDurationMs },
        );
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [bottom, mapRef, reframeDurationMs]);

  return useMemo(() => ({ top: 0, right: 0, bottom, left: 0 }), [bottom]);
}
