// ----------------------------------------------------------------
// useFollowVehicleCamera — map-camera companion for vehicle tracking.
//
// Two jobs:
//
// 1. FOLLOW: glide the camera after the animated vehicle with chained
//    ~1 s animateCamera() calls, navigation style: every push animates
//    the center to the car, rotates the map to the car's bearing, and
//    re-derives the pitch from the CURRENT camera zoom (so pinch-zoom
//    is preserved and the tilt adapts to it — flat when zoomed out,
//    tilted when zoomed in). Whenever follow ENGAGES (first frame on
//    start, or recenter()) it also applies DEFAULT_ZOOM, so it works
//    out of the box with no toggling. A pan gesture breaks the follow;
//    recenter() re-engages it.
//
// 2. CAMERA HEADING: keep a continuously-updated heading of the map
//    camera (read via getCamera() on every region-change tick,
//    throttled). VehicleMarker uses it to compensate icon rotation in
//    screen space, so the car always points along the polyline no
//    matter how the map is rotated or tilted.
//
// Wire the returned handlers onto the MapView:
//   <MapView onRegionChange={onRegionChange}
//            onRegionChangeComplete={onRegionChangeComplete}
//            onPanDrag={onPanDrag} ... />
// ----------------------------------------------------------------

import { useCallback, useRef, useState, type RefObject } from "react";

import type MapView from "react-native-maps";

/** Camera zoom applied whenever follow engages (start / recenter). */
export const DEFAULT_ZOOM = 17;

export interface DynamicPitchOptions {
  /** Zoom at (and below) which the camera is flat. Default 12. */
  flatZoom?: number;
  /** Zoom at (and above) which the camera is fully tilted. Default 18. */
  fullTiltZoom?: number;
  /** Tilt angle at full zoom, degrees. Default 60 (Google Maps max). */
  maxPitch?: number;
}

/**
 * Derives a camera tilt angle from zoom level.
 * Flat at zoom ≤ flatZoom (route overview), maxPitch at zoom ≥ fullTiltZoom
 * (street navigation), linear in between. Tolerates non-finite zoom and a
 * degenerate/inverted zoom band instead of returning NaN.
 */
export function calcDynamicPitch(
  zoom: number,
  { flatZoom = 12, fullTiltZoom = 18, maxPitch = 60 }: DynamicPitchOptions = {},
): number {
  if (!Number.isFinite(zoom)) return 0;
  if (fullTiltZoom <= flatZoom) return zoom >= fullTiltZoom ? maxPitch : 0;
  const t = Math.min(
    Math.max((zoom - flatZoom) / (fullTiltZoom - flatZoom), 0),
    1,
  );
  return t * maxPitch;
}

export interface DynamicZoomOptions {
  /** Distance (m) at/below which zoom is maxZoom (arrival close-up). Default 120. */
  nearDistance?: number;
  /** Distance (m) at/above which zoom is minZoom (route overview). Default 1500. */
  farDistance?: number;
  /** Zoom applied when near the target. Default 20. */
  maxZoom?: number;
  /** Zoom applied when far from the target. Default 15.5. */
  minZoom?: number;
}

/**
 * Derives a camera zoom purely from the driver's distance to the active
 * endpoint (pickup while approaching, dropoff while en route). Close in →
 * maxZoom (street-level close-up), far out → minZoom (route overview),
 * linear in between. Tolerates non-finite distance and a degenerate
 * distance band instead of returning NaN.
 */
export function calcDynamicZoom(
  distanceMeters: number,
  {
    nearDistance = 120,
    farDistance = 1500,
    maxZoom = 18,
    minZoom = 16,
  }: DynamicZoomOptions = {},
): number {
  if (!Number.isFinite(distanceMeters)) return minZoom;
  if (farDistance <= nearDistance) {
    return distanceMeters <= nearDistance ? maxZoom : minZoom;
  }
  // 1 at/inside nearDistance, 0 at/beyond farDistance.
  const t = Math.min(
    Math.max((farDistance - distanceMeters) / (farDistance - nearDistance), 0),
    1,
  );
  return minZoom + t * (maxZoom - minZoom);
}

export interface UseFollowVehicleCameraOptions {
  /** Min ms between camera-follow pushes (spam guard). Default 1000. */
  followIntervalMs?: number;
  /**
   * Duration of each follow glide (ms). Match the GPS update cadence so
   * chained glides read as continuous motion. Default 2000.
   */
  followDurationMs?: number;
  /** Zoom applied when follow engages. Default DEFAULT_ZOOM (16). */
  defaultZoom?: number;
  /** Duration of the engage/recenter glide (ms). Default 1500. */
  recenterDurationMs?: number;
  /** Min ms between camera-heading reads during gestures. */
  headingSyncIntervalMs?: number;
  /** Start in follow mode. Default true. */
  followOnStart?: boolean;
}

export interface UseFollowVehicleCameraApi {
  /** True while the camera is chasing the vehicle. */
  isFollowing: boolean;
  /**
   * Call on every NEW GPS coordinate (with the vehicle's bearing when
   * known) — each call glides the camera there, rotates the map to the
   * bearing and re-derives pitch from the current zoom. Throttles itself.
   * Pass `zoom` to drive the zoom from distance-to-endpoint: it is applied
   * on every push (overriding pinch) and the pitch is derived from it.
   */
  followTo: (
    latitude: number,
    longitude: number,
    heading?: number,
    zoom?: number,
  ) => void;
  /** Re-engage follow mode (e.g. from a "recenter" button). */
  recenter: () => void;
  /** Latest known camera heading in degrees — safe to call per frame. */
  getCameraHeading: () => number;
  /** Attach to MapView.onRegionChange (fires continuously during gestures). */
  onRegionChange: () => void;
  /** Attach to MapView.onRegionChangeComplete. */
  onRegionChangeComplete: () => void;
  /** Attach to MapView.onPanDrag — a pan gesture breaks the follow. */
  onPanDrag: () => void;
}

export function useFollowVehicleCamera(
  mapRef: RefObject<MapView | null>,
  options: UseFollowVehicleCameraOptions = {},
): UseFollowVehicleCameraApi {
  const {
    followIntervalMs = 1000,
    followDurationMs = 2000,
    defaultZoom = DEFAULT_ZOOM,
    recenterDurationMs = 1500,
    headingSyncIntervalMs = 120,
    followOnStart = true,
  } = options;

  const followRef = useRef(followOnStart);
  const [isFollowing, setIsFollowing] = useState(followOnStart);

  const headingRef = useRef(0);
  const zoomRef = useRef(defaultZoom);
  const lastFollowAtRef = useRef(0);
  const lastHeadingSyncAtRef = useRef(0);
  const lastTargetRef = useRef<{
    latitude: number;
    longitude: number;
    heading?: number;
    zoom?: number;
  } | null>(null);
  // True while the next follow push must apply the default zoom too,
  // not just center/bearing/pitch. Set on start and on recenter().
  const needsEngageCameraRef = useRef(followOnStart);

  const syncCameraState = useCallback(() => {
    mapRef.current
      ?.getCamera()
      .then((camera) => {
        if (typeof camera?.heading === "number") {
          headingRef.current = camera.heading;
        }
        // Track the live zoom so follow pushes derive their pitch from
        // whatever zoom the user has pinched to.
        if (typeof camera?.zoom === "number" && Number.isFinite(camera.zoom)) {
          zoomRef.current = camera.zoom;
        }
      })
      .catch(() => {
        // Map not laid out yet — keep the previous camera state.
      });
  }, [mapRef]);

  // Full default navigation view: center on the vehicle at the default
  // zoom, rotated to its bearing, with the matching dynamic pitch.
  // Follow pushes are held back until this glide finishes so they
  // cannot cancel the zoom animation.
  const engageCamera = useCallback(
    (target: {
      latitude: number;
      longitude: number;
      heading?: number;
      zoom?: number;
    }) => {
      needsEngageCameraRef.current = false;
      lastFollowAtRef.current =
        Date.now() + recenterDurationMs - followIntervalMs;
      // Engage at the distance-driven zoom when supplied, else the default.
      const targetZoom =
        typeof target.zoom === "number" && Number.isFinite(target.zoom)
          ? target.zoom
          : defaultZoom;
      zoomRef.current = targetZoom;
      const pitch = calcDynamicPitch(targetZoom);
      mapRef.current?.animateCamera(
        {
          center: { latitude: target.latitude, longitude: target.longitude },
          zoom: targetZoom,
          pitch,
          heading: target.heading ?? headingRef.current,
        },
        { duration: recenterDurationMs },
      );
    },
    [mapRef, defaultZoom, recenterDurationMs, followIntervalMs],
  );

  const followTo = useCallback(
    (latitude: number, longitude: number, heading?: number, zoom?: number) => {
      lastTargetRef.current = { latitude, longitude, heading, zoom };
      if (!followRef.current) return;

      if (needsEngageCameraRef.current) {
        engageCamera({ latitude, longitude, heading, zoom });
        return;
      }

      const now = Date.now();
      if (now - lastFollowAtRef.current < followIntervalMs) return;
      lastFollowAtRef.current = now;

      // Distance-driven zoom: when a zoom is supplied it sets the zoom on
      // every push (overriding pinch) and the pitch is derived from it, so
      // the camera tightens as the driver nears pickup/dropoff. Without it
      // we keep the user's pinch zoom and only adapt the tilt.
      const targetZoom =
        typeof zoom === "number" && Number.isFinite(zoom) ? zoom : undefined;
      if (targetZoom !== undefined) zoomRef.current = targetZoom;

      // Navigation-style push per GPS fix: glide the center to the new
      // coordinate, rotate the map to the vehicle bearing. One glide spans
      // one GPS interval, so chained pushes read as continuous motion.
      mapRef.current?.animateCamera(
        {
          center: { latitude, longitude },
          pitch: calcDynamicPitch(zoomRef.current),
          ...(targetZoom !== undefined ? { zoom: targetZoom } : null),
          ...(typeof heading === "number" && Number.isFinite(heading)
            ? { heading }
            : null),
        },
        { duration: followDurationMs },
      );
    },
    [mapRef, followIntervalMs, followDurationMs, engageCamera],
  );

  const recenter = useCallback(() => {
    followRef.current = true;
    setIsFollowing(true);
    const target = lastTargetRef.current;
    if (target) {
      engageCamera(target);
    } else {
      // No GPS coordinate seen yet — engage on the first one.
      needsEngageCameraRef.current = true;
    }
  }, [engageCamera]);

  const onPanDrag = useCallback(() => {
    if (!followRef.current) return;
    followRef.current = false;
    setIsFollowing(false);
  }, []);

  const onRegionChange = useCallback(() => {
    // Fires continuously while the user rotates/tilts/pans — keep the
    // heading fresh so marker rotation compensation tracks the gesture.
    const now = Date.now();
    if (now - lastHeadingSyncAtRef.current < headingSyncIntervalMs) return;
    lastHeadingSyncAtRef.current = now;
    syncCameraState();
  }, [syncCameraState, headingSyncIntervalMs]);

  const onRegionChangeComplete = useCallback(() => {
    lastHeadingSyncAtRef.current = Date.now();
    syncCameraState();
  }, [syncCameraState]);

  const getCameraHeading = useCallback(() => headingRef.current, []);

  return {
    isFollowing,
    followTo,
    recenter,
    getCameraHeading,
    onRegionChange,
    onRegionChangeComplete,
    onPanDrag,
  };
}
