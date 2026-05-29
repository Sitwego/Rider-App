import * as Location from "expo-location";
import { reverseGeocodeAsync } from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, Linking, Platform } from "react-native";

import { LATITUDE_DELTA, TARGET_SCREEN_PERCENTAGE } from "~/constants/GEO";

// ------------------------------------------------------------------
// Geo functions
// ------------------------------------------------------------------
import { Point } from "~/types/geoTypes";

import { PlaceType } from "../../lib/placesTypes";
type GeoPoint = Point;
export type GpsData = {
  geo_point: GeoPoint;
  accuracy?: number;
  heading?: number;
  bearing?: number;
  pitch?: number;
};

export type OnGpsData = {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number;
  distance: number;
  bearing: number;
  altitude: number;
  isMoving: boolean;
};
export function sphericalCosinesDistance(
  pos1: GeoPoint,
  pos2: GeoPoint,
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (pos1.latitude * Math.PI) / 180;
  const φ2 = (pos2.latitude * Math.PI) / 180;
  const Δλ = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;

  return (
    Math.acos(
      Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ),
    ) * R
  );
}
export function formatDistance(distanceInMeters: number): string {
  if (distanceInMeters >= 1000) {
    return `${Math.floor(distanceInMeters / 1000)}Km`;
  } else if (distanceInMeters > 0) {
    return `${distanceInMeters}M`;
  } else {
    return "0";
  }
}

/**
 * Converts degrees to radians.
 * @param deg Angle in degrees.
 * @returns Angle in radians.
 */
function degreesToRadians(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Converts radians to degrees.
 * @param rad Angle in radians.
 * @returns Angle in degrees.
 */
function radiansToDegrees(rad: number): number {
  return rad * (180 / Math.PI);
}

// Haversine distance (meters)
export function haversineDistance(pos1: GeoPoint, pos2: GeoPoint): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (pos1.latitude * Math.PI) / 180;
  const φ2 = (pos2.latitude * Math.PI) / 180;
  const Δφ = ((pos2.latitude - pos1.latitude) * Math.PI) / 180;
  const Δλ = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Bearing in radians from point a to b
export function bearing(a: GeoPoint, b: GeoPoint): number {
  const φ1 = (a.latitude * Math.PI) / 180;
  const λ1 = (a.longitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const λ2 = (b.longitude * Math.PI) / 180;

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  return Math.atan2(y, x);
}

// Compute the perpendicular (cross-track) distance (meters)
// from point p to the segment between points a and b.
export function minimalDistanceToSegment(
  p: GeoPoint,
  a: GeoPoint,
  b: GeoPoint,
): number {
  const R = 6371e3; // Earth's radius in meters
  const dAB = haversineDistance(a, b);
  if (dAB === 0) return haversineDistance(p, a);

  const dAP = haversineDistance(a, p);
  const dBP = haversineDistance(b, p);

  // Compute bearings (in radians)
  const θAB = bearing(a, b);
  const θAP = bearing(a, p);
  const Δθ = θAP - θAB;

  // Angular distance from a to p (in radians)
  const δAP = dAP / R;
  // Perpendicular (cross-track) distance
  const dxt = Math.abs(Math.asin(Math.sin(δAP) * Math.sin(Δθ)) * R);

  // Compute along-track distance (projected distance from a)
  const δxt = dxt / R;
  const alongTrackDistance = Math.acos(Math.cos(δAP) / Math.cos(δxt)) * R;

  // If projection falls outside the segment, return the nearest endpoint distance.
  if (alongTrackDistance < 0) return dAP;
  if (alongTrackDistance > dAB) return dBP;

  // Otherwise, return the perpendicular distance.
  return dxt;
}

// Find the best insertion index for newCoord in the current route.
// The index is chosen based on the smallest perpendicular distance
// from newCoord to each segment of the route.

export function findInsertionIndexAndClosestPoint(
  route: GeoPoint[],
  newCoord: GeoPoint,
): { insertionIndex: number; minPointDistance: number } {
  // Default: if route has less than 2 points, insertionIndex will be at the end.
  let insertionIndex = route.length;
  let minSegmentDistance = Infinity;
  let minPointDistance = Infinity;

  // Loop over each point in the route
  for (let i = 0; i < route.length; i++) {
    // Update the closest point distance
    const pointDistance = sphericalCosinesDistance(newCoord, route[i]);
    if (pointDistance < minPointDistance) {
      minPointDistance = pointDistance;
    }

    // For segments: only if there's a next point
    if (i < route.length - 1) {
      const segmentDistance = minimalDistanceToSegment(
        newCoord,
        route[i],
        route[i + 1],
      );
      if (segmentDistance < minSegmentDistance) {
        minSegmentDistance = segmentDistance;
        // Insertion index is set to insert the new point between route[i] and route[i+1]
        insertionIndex = i + 1;
      }
    }
  }

  return { insertionIndex, minPointDistance };
}

/**
 * Calculates the initial bearing in degrees from start point to end point.
 *
 * @param start The start location coordinates.
 * @param end The end location coordinates.
 * @returns The bearing in degrees clockwise from True North (0° to 360°).
 */
export function calculateBearing(start: GeoPoint, end: GeoPoint): number {
  // Convert latitudes and longitudes to radians
  const phi1 = degreesToRadians(start.latitude);
  const lambda1 = degreesToRadians(start.longitude);
  const phi2 = degreesToRadians(end.latitude);
  const lambda2 = degreesToRadians(end.longitude);

  // Calculate the difference in longitude
  const deltaLambda = lambda2 - lambda1;

  // Calculate the bearing using the atan2 formula components
  const X = Math.cos(phi2) * Math.sin(deltaLambda);
  const Y =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  // Use atan2 to get the angle in radians (from -PI to +PI)
  const bearingRad = Math.atan2(X, Y);

  // Convert radians to degrees
  const bearingDeg = radiansToDegrees(bearingRad);

  // Normalize to a compass bearing (0° to 360°)
  const compassBearing = (bearingDeg + 360) % 360;

  return compassBearing;
}

/**
 * Calculates the bearing between two geographic coordinates.
 * The returned angle (in degrees) can be used to rotate a marker along a polyline.
 *
 * @param start - The starting coordinate.
 * @param end - The ending coordinate.
 * @returns The bearing angle in degrees (0-360), where 0° points North.
 */
export function getMarkerRotation(start: GeoPoint, end: GeoPoint): number {
  // Convert degrees to radians
  const startLatRad = start.latitude * (Math.PI / 180);
  const startLngRad = start.longitude * (Math.PI / 180);
  const endLatRad = end.latitude * (Math.PI / 180);
  const endLngRad = end.longitude * (Math.PI / 180);

  // Calculate differences
  const deltaLng = endLngRad - startLngRad;

  // Compute the components of the formula
  const y = Math.sin(deltaLng) * Math.cos(endLatRad);
  const x =
    Math.cos(startLatRad) * Math.sin(endLatRad) -
    Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(deltaLng);

  // Calculate the initial bearing (in radians)
  let bearing = Math.atan2(y, x);

  // Convert the bearing from radians to degrees
  bearing = (bearing * 180) / Math.PI;

  // Normalize the bearing to 0-360 degrees
  return (bearing + 360) % 360;
}

export const getDynamicBuffer = (acc: number) => {
  // 1 degree ≈ 111,000 meters
  const bufferDegrees = acc / 111000;
  // Keep buffer between 0.0001° (~11m) and 0.01° (~1.1km)
  return Math.min(Math.max(bufferDegrees, 0.0001), 0.01);
};

export async function getLocation() {
  return await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
    mayShowUserSettingsDialog: true,
  });
}

export function getCoordinatesFromLineStr(data: number[][]) {
  return data.map(([longitude, latitude]) => {
    return {
      latitude,
      longitude,
    };
  });
}

export const calculateLatOffset = (latitude: number) => {
  // Offset the center latitude to position the region at the top
  // Subtract the offset to move the center upward
  const latitudeOffset = (LATITUDE_DELTA * (1 - TARGET_SCREEN_PERCENTAGE)) / 2;
  return latitude - latitudeOffset;
};

/**
 * Function to get postal address from GPS coordinates
 * @param gpsPoint - An object containing latitude and longitude
 * @returns A promise that resolves to a postal address string or null if not found
 */

export async function getAddressFromGpsPoint(gpsPoint: {
  lat: number;
  long: number;
}): Promise<PlaceType | null> {
  try {
    const [location] = await reverseGeocodeAsync({
      latitude: gpsPoint.lat,
      longitude: gpsPoint.long,
    });

    if (!location) {
      return null;
    }

    const currentLocation: PlaceType = {
      lat: gpsPoint.lat,
      lng: gpsPoint.long,
      name: location.name ?? undefined,
      street: location.street ?? undefined,
      city: location.city ?? undefined,
      state: location.region ?? undefined,
      country: location.country ?? undefined,
      zipCode: location.postalCode ?? undefined,
      address: location.street ?? undefined,
      place_id: "",
      id: "",
    };

    const address: string =
      location?.formattedAddress ??
      [location?.name, location?.city, location?.region]
        .filter(Boolean)
        .join(", ");
    console.log("[GPS address request] Formatted address: ", address);

    return currentLocation;
  } catch (error) {
    console.error(
      "[GPS distance request] Failed to reverse geocode location to postal address: ",
      error,
    );
    return null;
  }
}

/**
 * Starts background location updates for the user.
 * This function configures and initiates periodic location tracking
 * even when the app is in the background.
 */
export async function startBgLocationUpdate() {
  // TODO: re-enable background permission check when ACCESS_BACKGROUND_LOCATION
  // is added to the AndroidManifest and background location is re-enabled
  // const { status } = await Location.getBackgroundPermissionsAsync();
  // if (status !== Location.PermissionStatus.GRANTED) {
  //   console.log("[Background Location] Background location permission not granted");
  //   return;
  // }

  const hasStarted = await Location.hasStartedLocationUpdatesAsync(
    "USER_LOCATION_SYNC_TASK",
  );
  if (hasStarted) {
    console.log(
      "[Background Location] Background location updates already started",
    );
    return;
  }

  await Location.startLocationUpdatesAsync("USER_LOCATION_SYNC_TASK", {
    accuracy: Location.Accuracy.Highest,
    timeInterval: 5 * 60 * 1000, // 5 minutes
    distanceInterval: 200, // 500 meters
    showsBackgroundLocationIndicator: false,
    // foregroundService: {
    //   notificationTitle: "App is using your location",
    //   notificationBody:
    //     "Your location is being used to provide better services.",
    //   notificationColor: "#FF0000",
    // },
  });

  console.log(
    "[Background Location] Started background location updates successfully",
  );
}

/**
 * Stops background location updates for the user.
 */
export async function stopBgLocationUpdate() {
  const hasPermission = await Location.hasStartedLocationUpdatesAsync(
    "USER_LOCATION_SYNC_TASK",
  );
  if (!hasPermission) {
    console.log(
      "[Background Location] Background location updates are not active",
    );
    return;
  }

  await Location.stopLocationUpdatesAsync("USER_LOCATION_SYNC_TASK");
  console.log(
    "[Background Location] Stopped background location updates successfully",
  );
}

// Interface for coordinates
interface Coordinates {
  lat: number;
  lng: number;
}

export const googleMapsNavigationLink = (
  destination: Coordinates,
  options?: {
    travelMode?: "d" | "w" | "b" | "l";
  },
): string => {
  const baseUrl = "google.navigation:";
  const travelMode = options?.travelMode ?? "d";
  const destinationStr = `${destination.lat},${destination.lng}`;

  const queryParams = new URLSearchParams({
    q: destinationStr,
    mode: travelMode,
  });

  return `${baseUrl}?${queryParams.toString()}`;
};

// ================================================================
// LOCATION PERMISSION SYSTEM
// Production-grade permission management for ride-hailing
//
// Platform behavior summary:
//   Android 10 (API 29): ACCESS_BACKGROUND_LOCATION introduced; can be
//     requested in the same prompt as foreground.
//   Android 11+ (API 30+): Background permission MUST be a separate request;
//     the OS sends the user to the app's Settings page rather than showing
//     an in-app dialog — users must manually select "Allow all the time".
//   Android 12+ (API 31+): FOREGROUND_SERVICE_LOCATION type required in
//     the manifest for foreground services (already set in app.json).
//   iOS 13+: Background ("Always") can only be granted after "When In Use"
//     is granted. The OS may show "Change to Always Allow?" once; subsequent
//     upgrades require the user to open Settings manually.
//   iOS 14+: Precise/reduced accuracy distinction via accuracy authorization.
// ================================================================

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

/**
 * Normalized permission state — mapped from expo-location's PermissionStatus
 * plus the canAskAgain flag.
 *
 * 'denied'  → user said no but the OS will show the dialog again
 * 'blocked' → permanently denied (Android "Never ask again" / iOS after first denial)
 *             — requires the user to open Settings manually
 */
export type PermissionState = "granted" | "denied" | "blocked" | "undetermined";

/** Combined snapshot of both foreground and background permission state. */
export interface LocationPermissionStatus {
  foreground: PermissionState;
  /** 'undetermined' when foreground is not yet granted. */
  background: PermissionState;
  /** Whether the device-level GPS / location services toggle is on. */
  servicesEnabled: boolean;
  /** Whether calling requestForegroundPermissionsAsync() would show a dialog. */
  canAskForeground: boolean;
  /** Whether calling requestBackgroundPermissionsAsync() would show a dialog. */
  canAskBackground: boolean;
  /**
   * iOS 14+ precise-location authorization.
   * Android always returns 'full'.
   * 'none' when location is not granted at all.
   */
  accuracyAuthorization: "full" | "reduced" | "none";
}

export type LocationErrorCode =
  | "SERVICES_DISABLED" // GPS toggle is off at the device level
  | "PERMISSION_DENIED" // user said no, but can be asked again
  | "PERMISSION_BLOCKED" // permanently denied — must go to Settings
  | "API_FAILURE" // expo-location API threw an unexpected error
  | "TIMEOUT" // permission dialog took too long (rare)
  | "UNSUPPORTED_PLATFORM"; // web or unknown OS

export interface LocationPermissionError {
  code: LocationErrorCode;
  message: string;
  /** True when the user can recover without reinstalling the app. */
  recoverable: boolean;
}

/** Discriminated-union result — avoids throwing across async boundaries. */
export type LocationPermissionResult =
  | { ok: true; status: LocationPermissionStatus }
  | { ok: false; error: LocationPermissionError };

// ----------------------------------------------------------------
// Hook state & action shapes
// ----------------------------------------------------------------

export interface UseLocationPermissionState {
  /** Full permission snapshot, or null before the first check completes. */
  status: LocationPermissionStatus | null;
  isLoading: boolean;
  error: LocationPermissionError | null;
  /** Convenience: foreground AND background are both 'granted'. */
  isFullyGranted: boolean;
  /** Convenience: foreground is 'granted' (sufficient for active-trip tracking). */
  isForegroundGranted: boolean;
  /** Convenience: device-level location services are on. */
  isServicesEnabled: boolean;
}

export interface UseLocationPermissionActions {
  /**
   * Show the OS foreground permission dialog.
   * Safe to call even if already granted — returns current status immediately.
   * Returns an error result (never throws) when blocked or services are off.
   */
  requestForeground: () => Promise<LocationPermissionResult>;
  /**
   * Show the OS background permission dialog.
   * Guard: silently returns an error if foreground is not yet 'granted'.
   * On Android 11+ this navigates the user to app Settings.
   * On iOS this shows "Change to Always Allow?" (may be suppressed by OS).
   */
  requestBackground: () => Promise<LocationPermissionResult>;
  /**
   * Re-read permission state from the OS.
   * Called automatically on app resume; also available for explicit refresh.
   */
  refresh: () => Promise<void>;
  /** Open the app's Settings page on both iOS and Android. */
  openSettings: () => Promise<void>;
  /**
   * Android only: show the system dialog to enable location services.
   * On iOS, `openSettings` is the only option.
   */
  promptEnableServices: () => Promise<void>;
}

// ----------------------------------------------------------------
// Private helpers (not exported — internal to this module)
// ----------------------------------------------------------------

function _mapPermStatus(
  status: Location.PermissionStatus,
  canAskAgain: boolean,
): PermissionState {
  switch (status) {
    case Location.PermissionStatus.GRANTED:
      return "granted";
    case Location.PermissionStatus.DENIED:
      // canAskAgain=false means "Never ask again" on Android,
      // or a previous denial on iOS (iOS never re-shows the dialog).
      return canAskAgain ? "denied" : "blocked";
    default:
      return "undetermined";
  }
}

function _extractAccuracyAuth(
  response: Location.LocationPermissionResponse,
): "full" | "reduced" | "none" {
  if (Platform.OS !== "ios") return "full";
  // expo-location exposes iOS-specific details under the 'ios' key
  const iosScope = (response as any).ios?.scope as
    | "whenInUse"
    | "always"
    | "none"
    | undefined;
  if (!iosScope || iosScope === "none") return "none";
  const accuracy = (response as any).ios?.accuracy as
    | "full"
    | "reduced"
    | undefined;
  return accuracy ?? "full";
}

function _makeError(
  code: LocationErrorCode,
  message: string,
  recoverable: boolean,
): LocationPermissionError {
  return { code, message, recoverable };
}

// ----------------------------------------------------------------
// LocationPermissionService
// Stateless module — safe to call outside React (e.g., native modules,
// background task handlers, one-off checks before navigation).
// ----------------------------------------------------------------

export const LocationPermissionService = {
  /**
   * Read the current permission state without triggering any OS dialog.
   * Use this for passive checks (e.g., on app resume, before starting a trip).
   */
  async getFullStatus(): Promise<LocationPermissionResult> {
    try {
      const [fgResponse, servicesEnabled] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.hasServicesEnabledAsync(),
      ]);

      return {
        ok: true,
        status: {
          foreground: _mapPermStatus(fgResponse.status, fgResponse.canAskAgain),
          background: "undetermined",
          servicesEnabled,
          canAskForeground: fgResponse.canAskAgain,
          canAskBackground: false,
          accuracyAuthorization: _extractAccuracyAuth(fgResponse),
        },
      };
    } catch (e) {
      return {
        ok: false,
        error: _makeError(
          "API_FAILURE",
          e instanceof Error ? e.message : "Failed to read permission status",
          true,
        ),
      };
    }
  },

  /**
   * Request foreground (When In Use) location permission.
   *
   * Checks GPS services first — returns SERVICES_DISABLED immediately so
   * the caller can prompt the user to enable GPS before the permission dialog.
   *
   * Returns PERMISSION_BLOCKED without calling requestForegroundPermissionsAsync
   * when the OS would silently ignore the call (canAskAgain=false), preventing
   * the subtle bug where a no-op request leaves the UI stuck in a loading state.
   */
  async requestForegroundPermission(): Promise<LocationPermissionResult> {
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        return {
          ok: false,
          error: _makeError(
            "SERVICES_DISABLED",
            "Location services are disabled. Please enable GPS to continue.",
            true,
          ),
        };
      }

      // Pre-check: skip the OS call entirely when already blocked
      const existing = await Location.getForegroundPermissionsAsync();
      if (
        existing.status === Location.PermissionStatus.DENIED &&
        !existing.canAskAgain
      ) {
        return {
          ok: false,
          error: _makeError(
            "PERMISSION_BLOCKED",
            "Location permission is permanently denied. Please enable it in Settings.",
            true,
          ),
        };
      }

      // Already granted — return full status immediately
      if (existing.status === Location.PermissionStatus.GRANTED) {
        return this.getFullStatus();
      }

      const response = await Location.requestForegroundPermissionsAsync();
      const foreground = _mapPermStatus(response.status, response.canAskAgain);

      if (foreground === "blocked") {
        return {
          ok: false,
          error: _makeError(
            "PERMISSION_BLOCKED",
            "Location permission is permanently denied. Please enable it in Settings.",
            true,
          ),
        };
      }

      if (foreground === "denied") {
        return {
          ok: false,
          error: _makeError(
            "PERMISSION_DENIED",
            "Location permission was denied.",
            true,
          ),
        };
      }

      // Foreground granted — read full snapshot now that background may be readable
      return this.getFullStatus();
    } catch (e) {
      return {
        ok: false,
        error: _makeError(
          "API_FAILURE",
          e instanceof Error
            ? e.message
            : "Foreground permission request failed",
          true,
        ),
      };
    }
  },

  /**
   * Request background (Always / Allow all the time) location permission.
   *
   * This MUST be called ONLY after foreground is 'granted'. Calling it earlier
   * is undefined behavior on both platforms.
   *
   * Android 11+: requestBackgroundPermissionsAsync takes the user to app Settings
   *   rather than showing an in-app dialog. Show a rationale screen explaining
   *   the required setting BEFORE calling this function.
   *
   * iOS: The system may show "Change to Always Allow?" once. If the user already
   *   dismissed this, they must go to Settings > [App] > Location > "Always".
   *   There is no programmatic fallback — always pair with openSettings CTA.
   */
  async requestBackgroundPermission(): Promise<LocationPermissionResult> {
    try {
      // Guard: foreground must be granted
      const fgResponse = await Location.getForegroundPermissionsAsync();
      if (fgResponse.status !== Location.PermissionStatus.GRANTED) {
        return {
          ok: false,
          error: _makeError(
            "PERMISSION_DENIED",
            "Foreground location must be granted before requesting background access.",
            true,
          ),
        };
      }

      const existing = await Location.getBackgroundPermissionsAsync();

      // Already granted
      if (existing.status === Location.PermissionStatus.GRANTED) {
        return this.getFullStatus();
      }

      // Permanently blocked — direct to settings
      if (
        existing.status === Location.PermissionStatus.DENIED &&
        !existing.canAskAgain
      ) {
        return {
          ok: false,
          error: _makeError(
            "PERMISSION_BLOCKED",
            Platform.OS === "android"
              ? 'Background location is permanently denied. Open Settings and select "Allow all the time".'
              : 'Background location is denied. Open Settings > Location and select "Always".',
            true,
          ),
        };
      }

      const response = await Location.requestBackgroundPermissionsAsync();
      const background = _mapPermStatus(response.status, response.canAskAgain);

      if (background === "blocked" || background === "denied") {
        return {
          ok: false,
          error: _makeError(
            background === "blocked"
              ? "PERMISSION_BLOCKED"
              : "PERMISSION_DENIED",
            Platform.OS === "android"
              ? 'Background location was not granted. Select "Allow all the time" in Settings.'
              : 'Background location was not granted. Select "Always" in Location Settings.',
            true,
          ),
        };
      }

      return this.getFullStatus();
    } catch (e) {
      return {
        ok: false,
        error: _makeError(
          "API_FAILURE",
          e instanceof Error
            ? e.message
            : "Background permission request failed",
          true,
        ),
      };
    }
  },

  /** Opens the OS app settings page on both iOS and Android. */
  async openAppSettings(): Promise<void> {
    await Linking.openSettings();
  },

  /**
   * Android only: shows the system "Enable location services?" dialog.
   * Resolves after the dialog is dismissed (accepted or rejected).
   * On iOS, the only option is openAppSettings().
   */
  async promptEnableLocationServices(): Promise<void> {
    if (Platform.OS !== "android") return;
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      // User dismissed or device does not support the dialog — non-fatal
    }
  },

  /** Human-readable fallback message for each error code. */
  getErrorMessage(code: LocationErrorCode): string {
    const messages: Record<LocationErrorCode, string> = {
      SERVICES_DISABLED:
        "Your device's location services are turned off. Please enable GPS to continue.",
      PERMISSION_DENIED:
        "Location access was denied. This app needs your location to find nearby rides.",
      PERMISSION_BLOCKED:
        "Location access is blocked. Please go to Settings to enable it.",
      API_FAILURE:
        "Something went wrong while checking location permissions. Please try again.",
      TIMEOUT: "Location permission request timed out. Please try again.",
      UNSUPPORTED_PLATFORM:
        "Location permissions are not supported on this platform.",
    };
    return messages[code];
  },
} as const;

// ----------------------------------------------------------------
// useLocationPermission
//
// Uses expo-location's built-in permission hooks so the native OS
// dialog is triggered by the Expo permission system (the only way
// to reliably show the Android runtime permission popup).
//
// useForegroundPermissions / useBackgroundPermissions handle their
// own state; we only manage the GPS services check separately.
// ----------------------------------------------------------------

export function useLocationPermission(): UseLocationPermissionState &
  UseLocationPermissionActions {
  // These are the proper Expo hooks — calling requestPermission() from
  // either one is what actually triggers the native Android/iOS dialog.
  const [fgPermission, requestFgPermission, getFgPermission] =
    Location.useForegroundPermissions();
  // TODO: re-enable when background location is added to the AndroidManifest
  // const [bgPermission, requestBgPermission] = Location.useBackgroundPermissions();
  const bgPermission = null as Location.PermissionResponse | null;
  const requestBgPermission = useCallback(
    async () => null as unknown as Location.PermissionResponse,
    [],
  );

  // GPS/location services toggle — no Expo hook for this, poll manually.
  const [servicesEnabled, setServicesEnabled] = useState<boolean | null>(null);

  // Prevents a second dialog opening if the user double-taps a CTA.
  const isRequestingRef = useRef(false);
  // Debounce handle for AppState-triggered re-checks.
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ---- GPS services check ----------------------------------------

  const checkServices = useCallback(async () => {
    try {
      setServicesEnabled(await Location.hasServicesEnabledAsync());
    } catch {
      setServicesEnabled(false);
    }
  }, []);

  useEffect(() => {
    checkServices();
  }, [checkServices]);

  // ---- AppState: re-check on resume from background / settings ---
  // getFgPermission() re-reads the current permission without showing a
  // dialog — it updates fgPermission state which triggers a re-render.

  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        const prev = prevAppStateRef.current;
        prevAppStateRef.current = nextState;

        if (nextState !== "active") return;
        if (prev !== "background" && prev !== "inactive") return;

        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = setTimeout(async () => {
          await Promise.all([checkServices(), getFgPermission()]);
          resumeTimerRef.current = null;
        }, 350);
      },
    );

    return () => {
      sub.remove();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [checkServices, getFgPermission]);

  // ---- Derive unified status from hook state ---------------------

  const foreground: PermissionState = fgPermission
    ? _mapPermStatus(fgPermission.status, fgPermission.canAskAgain)
    : "undetermined";

  const background: PermissionState = bgPermission
    ? _mapPermStatus(bgPermission.status, bgPermission.canAskAgain)
    : "undetermined";

  // isLoading until both expo hooks and the services check have resolved.
  const isLoading = fgPermission === null || servicesEnabled === null;

  const status: LocationPermissionStatus | null =
    fgPermission !== null && servicesEnabled !== null
      ? {
          foreground,
          background,
          servicesEnabled,
          canAskForeground: fgPermission.canAskAgain,
          canAskBackground: bgPermission?.canAskAgain ?? false,
          accuracyAuthorization: _extractAccuracyAuth(
            fgPermission as Location.LocationPermissionResponse,
          ),
        }
      : null;

  const isForegroundGranted = foreground === "granted";
  // Background location is not required for now — treat foreground-only as fully granted.
  // TODO: restore `&& background === "granted"` when background location is re-enabled
  const isFullyGranted = isForegroundGranted;

  // ---- Request handlers ------------------------------------------

  const requestForeground =
    useCallback(async (): Promise<LocationPermissionResult> => {
      if (isRequestingRef.current) {
        return {
          ok: false,
          error: _makeError(
            "API_FAILURE",
            "A permission request is already in progress.",
            true,
          ),
        };
      }

      // Bail early if GPS is off — asking for permission while services are
      // disabled shows a confusing UI on some Android versions.
      const servEnabled = await Location.hasServicesEnabledAsync();
      setServicesEnabled(servEnabled);
      if (!servEnabled) {
        return {
          ok: false,
          error: _makeError(
            "SERVICES_DISABLED",
            "Location services are disabled. Please enable GPS first.",
            true,
          ),
        };
      }

      // Already permanently blocked — skip the OS call entirely.
      if (
        fgPermission?.status === Location.PermissionStatus.DENIED &&
        !fgPermission.canAskAgain
      ) {
        return {
          ok: false,
          error: _makeError(
            "PERMISSION_BLOCKED",
            "Location permission is permanently denied. Please enable it in Settings.",
            true,
          ),
        };
      }

      isRequestingRef.current = true;
      try {
        // ↓ This is the call that shows the native OS permission popup.
        const result = await requestFgPermission();
        const state = _mapPermStatus(result.status, result.canAskAgain);

        if (state === "blocked") {
          return {
            ok: false,
            error: _makeError(
              "PERMISSION_BLOCKED",
              "Location permission is permanently denied. Please enable it in Settings.",
              true,
            ),
          };
        }
        if (state === "denied") {
          return {
            ok: false,
            error: _makeError(
              "PERMISSION_DENIED",
              "Location permission was denied.",
              true,
            ),
          };
        }

        // Granted — return foreground-only snapshot.
        // TODO: re-read background state here when background location is re-enabled
        return {
          ok: true,
          status: {
            foreground: "granted",
            background: "undetermined",
            servicesEnabled: servEnabled,
            canAskForeground: result.canAskAgain,
            canAskBackground: false,
            accuracyAuthorization: _extractAccuracyAuth(
              result as Location.LocationPermissionResponse,
            ),
          },
        };
      } catch (e) {
        return {
          ok: false,
          error: _makeError(
            "API_FAILURE",
            e instanceof Error ? e.message : "Permission request failed",
            true,
          ),
        };
      } finally {
        isRequestingRef.current = false;
      }
    }, [fgPermission, requestFgPermission]);

  const requestBackground =
    useCallback(async (): Promise<LocationPermissionResult> => {
      if (isRequestingRef.current) {
        return {
          ok: false,
          error: _makeError(
            "API_FAILURE",
            "A permission request is already in progress.",
            true,
          ),
        };
      }

      if (!isForegroundGranted) {
        return {
          ok: false,
          error: _makeError(
            "PERMISSION_DENIED",
            "Foreground location must be granted before requesting background access.",
            true,
          ),
        };
      }

      if (
        bgPermission?.status === Location.PermissionStatus.DENIED &&
        !bgPermission.canAskAgain
      ) {
        return {
          ok: false,
          error: _makeError(
            "PERMISSION_BLOCKED",
            Platform.OS === "android"
              ? 'Background location is permanently denied. Open Settings and select "Allow all the time".'
              : 'Background location is denied. Open Settings > Location and select "Always".',
            true,
          ),
        };
      }

      isRequestingRef.current = true;
      try {
        // ↓ This is the call that shows the native background permission popup.
        const result = await requestBgPermission();
        const state = _mapPermStatus(result.status, result.canAskAgain);

        if (state === "blocked" || state === "denied") {
          return {
            ok: false,
            error: _makeError(
              state === "blocked" ? "PERMISSION_BLOCKED" : "PERMISSION_DENIED",
              Platform.OS === "android"
                ? 'Background location was not granted. Select "Allow all the time" in Settings.'
                : 'Background location was not granted. Select "Always" in Location Settings.',
              true,
            ),
          };
        }

        return LocationPermissionService.getFullStatus();
      } catch (e) {
        return {
          ok: false,
          error: _makeError(
            "API_FAILURE",
            e instanceof Error
              ? e.message
              : "Background permission request failed",
            true,
          ),
        };
      } finally {
        isRequestingRef.current = false;
      }
    }, [isForegroundGranted, bgPermission, requestBgPermission]);

  const refresh = useCallback(async () => {
    await Promise.all([checkServices(), getFgPermission()]);
  }, [checkServices, getFgPermission]);

  const openSettings = useCallback(async () => {
    await LocationPermissionService.openAppSettings();
  }, []);

  // Android only: shows the "Turn on location?" system dialog.
  // After the dialog resolves (accepted or dismissed), re-check services
  // so the gate updates immediately without waiting for AppState.
  const promptEnableServices = useCallback(async () => {
    await LocationPermissionService.promptEnableLocationServices();
    await checkServices();
  }, [checkServices]);

  return {
    status,
    isLoading,
    error: null,
    isFullyGranted,
    isForegroundGranted,
    isServicesEnabled: servicesEnabled ?? false,
    requestForeground,
    requestBackground,
    refresh,
    openSettings,
    promptEnableServices,
  };
}
