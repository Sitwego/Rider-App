// ----------------------------------------------------------------
// Shared types and configuration for the vehicle tracking engine.
// ----------------------------------------------------------------

import type { LatLng } from "./geo";

/**
 * A raw GPS sample for one vehicle. Only coordinates are required —
 * the tracker estimates speed/heading from successive snapped positions
 * when the source (e.g. the native bridge) does not provide them.
 */
export interface GpsUpdate {
  latitude: number;
  longitude: number;
  /** Source timestamp (epoch ms). Used ONLY for out-of-order rejection. */
  timestamp?: number;
  /** Meters per second, if the source provides it. */
  speed?: number;
  /** Compass degrees, if the source provides it. Route geometry wins on-route. */
  heading?: number;
  /** GPS accuracy radius (meters), if available. */
  accuracy?: number;
}

/** Full animation state for one tracked vehicle (see architecture doc). */
export interface VehicleState {
  vehicleId: string;

  /** Last snapped progress from a real GPS update (meters). */
  currentProgress: number;

  /** Progress currently rendered on screen (meters). */
  displayedProgress: number;

  /** Dead-reckoned progress while awaiting the next update (meters). */
  predictedProgress: number;

  /** Progress the interpolation is animating toward (meters). */
  targetProgress: number;

  /** Last reported/estimated speed (meters per second). */
  speed: number;

  /** Target heading derived from route geometry (degrees). */
  heading: number;

  /** Heading currently rendered on screen (degrees). */
  displayedHeading: number;

  /** Timestamp of the last accepted GPS update (epoch ms). */
  lastGpsTimestamp: number;

  /** True while position is extrapolated rather than interpolated. */
  isPredicting: boolean;

  /** True when PREDICTION_TIMEOUT_MS has been exceeded. */
  isStale: boolean;
}

/** Per-frame render output for one vehicle, consumed by the marker layer. */
export interface VehicleFrame {
  vehicleId: string;
  latitude: number;
  longitude: number;
  /** Smoothed compass heading (degrees) for icon rotation. */
  heading: number;
  /** Displayed route progress in meters (NaN while in off-route fallback). */
  progress: number;
  isPredicting: boolean;
  isStale: boolean;
  /** True while the vehicle is animating in direct lat/lng fallback mode. */
  isOffRoute: boolean;
}

export interface TrackerConfig {
  /** Nominal GPS cadence; used as duration for the very first segment. */
  expectedUpdateIntervalMs: number;
  /** Interpolation segment duration clamps (measured inter-update gap). */
  minSegmentDurationMs: number;
  maxSegmentDurationMs: number;

  /** Stop dead-reckoning this long after the last accepted update. */
  predictionTimeoutMs: number;

  /** 1/seconds. 2.0 ≈ 86% of remaining error corrected per second. */
  correctionRate: number;
  /** 1/seconds, exponential smoothing rate for icon rotation. */
  headingRate: number;

  /** Hard-jump threshold — see Large Error Recovery. */
  maxAllowedErrorMeters: number;

  /** Ignore sub-threshold movement while speed is near zero. */
  jitterThresholdMeters: number;
  /** "Near zero" speed for the jitter filter (m/s). */
  jitterSpeedThreshold: number;

  /** Snapped point farther than this from the route counts as off-route. */
  offRouteThresholdMeters: number;
  /** Consecutive off-route updates before entering fallback mode. */
  offRouteConsecutiveUpdates: number;

  /** Windowed snapping search bounds around the last known progress. */
  snapBehindWindowMeters: number;
  snapAheadWindowMeters: number;

  /** Distance ahead along the route used to derive the target heading. */
  headingLookaheadMeters: number;
}

export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  expectedUpdateIntervalMs: 2_000,
  minSegmentDurationMs: 500,
  maxSegmentDurationMs: 6_000,
  predictionTimeoutMs: 10_000,
  correctionRate: 2.0,
  headingRate: 5.0,
  maxAllowedErrorMeters: 100,
  jitterThresholdMeters: 3,
  jitterSpeedThreshold: 0.5,
  offRouteThresholdMeters: 50,
  offRouteConsecutiveUpdates: 3,
  snapBehindWindowMeters: 250,
  snapAheadWindowMeters: 600,
  headingLookaheadMeters: 8,
};

/** Route input: decoded coordinates or a Google encoded polyline string. */
export type RouteInput = LatLng[] | string;
