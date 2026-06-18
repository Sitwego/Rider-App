// Public surface of the real-time vehicle tracking engine.
// Everything in src/tracking is pure TypeScript with no React Native /
// Expo / Google Maps dependencies — see docs/Real_Time_Vehicle_Tracking.md.

export {
  AnimationController,
  monotonicNow,
  sharedAnimationController,
  type FrameCallback,
} from "./AnimationController";
export { stepHeading } from "./BearingInterpolator";
export {
  correctTowards,
  exceedsMaxError,
  smoothingAlpha,
} from "./CorrectionEngine";
export {
  clamp,
  computeDistanceBetween,
  computeHeading,
  decodePolyline,
  interpolate,
  normalizeHeading,
  shortestHeadingDelta,
  type LatLng,
} from "./geo";
export {
  Easing,
  getDisplayedProgress,
  type EasingFn,
} from "./InterpolationEngine";
export {
  isTimedOut,
  predictDistance,
  predictProgress,
} from "./PredictionEngine";
export {
  headingAtProgress,
  prepareRoute,
  progressToLatLng,
  progressToSegment,
  type PreparedRoute,
} from "./RouteProgressCalculator";
export { RouteSnapper, type SnapResult } from "./RouteSnapper";
export {
  DEFAULT_TRACKER_CONFIG,
  type GpsUpdate,
  type RouteInput,
  type TrackerConfig,
  type VehicleFrame,
  type VehicleState,
} from "./types";
export { VehicleStateManager } from "./VehicleStateManager";
export { VehicleTracker } from "./VehicleTracker";
