// ----------------------------------------------------------------
// Per-vehicle tracking orchestrator.
//
// Wires the pipeline together for one vehicle:
//
//   GPS update → RouteSnapper → progress → InterpolationEngine
//             → PredictionEngine → CorrectionEngine → frame output
//
// Two entry points:
//   ingestGpsUpdate()  — called whenever a GPS sample arrives (~2 s)
//   getFrame()         — called every animation frame by the shared
//                        AnimationController (~60 Hz)
//
// All movement happens on the 1-D route-progress axis; coordinates are
// derived only at the end of getFrame(). Raw lat/lng is animated
// directly only in the off-route fallback mode.
// ----------------------------------------------------------------

import { monotonicNow } from "./AnimationController";
import { stepHeading } from "./BearingInterpolator";
import {
  correctTowards,
  exceedsMaxError,
  smoothingAlpha,
} from "./CorrectionEngine";
import { getDisplayedProgress } from "./InterpolationEngine";
import { isTimedOut, predictProgress } from "./PredictionEngine";
import {
  headingAtProgress,
  prepareRoute,
  progressToLatLng,
  type PreparedRoute,
} from "./RouteProgressCalculator";
import { RouteSnapper, type SnapResult } from "./RouteSnapper";
import {
  clamp,
  computeDistanceBetween,
  computeHeading,
  type LatLng,
} from "./geo";
import {
  DEFAULT_TRACKER_CONFIG,
  type GpsUpdate,
  type RouteInput,
  type TrackerConfig,
  type VehicleFrame,
  type VehicleState,
} from "./types";

/** Active interpolation segment: displayed motion target between updates. */
interface InterpolationSegment {
  startProgress: number;
  targetProgress: number;
  /** Monotonic ms when the segment started. */
  startTimeMs: number;
  durationMs: number;
}

export class VehicleTracker {
  readonly vehicleId: string;

  private readonly config: TrackerConfig;
  private route: PreparedRoute;
  private snapper: RouteSnapper;

  private readonly state: VehicleState;
  private segment: InterpolationSegment;

  /** Monotonic time of the last ACCEPTED update (jitter updates included). */
  private lastIngestMonotonic: number | null = null;
  private readonly createdAtMonotonic: number;

  /** Off-route fallback bookkeeping. */
  private offRouteCount = 0;
  private offRouteMode = false;
  private offRouteTarget: LatLng | null = null;

  /** Last rendered coordinates — fallback animation + route replacement seed. */
  private displayedLatLng: LatLng;

  /** Progress frozen at the moment the prediction timeout was crossed. */
  private staleFrozenProgress: number | null = null;

  /** False until the first GPS fix has been ingested. */
  private hasFix = false;

  constructor(
    vehicleId: string,
    routeInput: RouteInput,
    config: Partial<TrackerConfig> = {},
    initialUpdate?: GpsUpdate,
  ) {
    this.vehicleId = vehicleId;
    this.config = { ...DEFAULT_TRACKER_CONFIG, ...config };
    this.route = prepareRoute(routeInput);
    this.snapper = this.createSnapper();
    this.createdAtMonotonic = monotonicNow();

    this.displayedLatLng = { ...this.route.points[0] };
    this.state = {
      vehicleId,
      currentProgress: 0,
      displayedProgress: 0,
      predictedProgress: 0,
      targetProgress: 0,
      speed: 0,
      heading: headingAtProgress(
        this.route,
        0,
        this.config.headingLookaheadMeters,
      ),
      displayedHeading: headingAtProgress(
        this.route,
        0,
        this.config.headingLookaheadMeters,
      ),
      lastGpsTimestamp: 0,
      isPredicting: false,
      isStale: false,
    };
    this.segment = {
      startProgress: 0,
      targetProgress: 0,
      startTimeMs: this.createdAtMonotonic,
      durationMs: 0,
    };

    if (initialUpdate) this.ingestGpsUpdate(initialUpdate);
  }

  // ----------------------------------------------------------------
  // GPS ingestion
  // ----------------------------------------------------------------

  ingestGpsUpdate(update: GpsUpdate): void {
    const now = monotonicNow();

    // Out-of-order rejection: never apply a sample older than the last one.
    if (
      update.timestamp !== undefined &&
      this.state.lastGpsTimestamp > 0 &&
      update.timestamp < this.state.lastGpsTimestamp
    ) {
      return;
    }

    const point: LatLng = {
      latitude: update.latitude,
      longitude: update.longitude,
    };
    const sinceLastMs =
      this.lastIngestMonotonic === null
        ? this.config.expectedUpdateIntervalMs
        : now - this.lastIngestMonotonic;

    // Windowed snap around the last known progress; full scan when there is
    // no usable hint (first fix or off-route recovery attempts).
    const hint =
      this.hasFix && !this.offRouteMode
        ? this.state.currentProgress
        : undefined;
    const snap = this.snapper.snap(point, hint);

    // ---- Off-route detection --------------------------------------
    if (snap.distanceFromRoute > this.config.offRouteThresholdMeters) {
      this.offRouteCount++;
      if (this.offRouteCount >= this.config.offRouteConsecutiveUpdates) {
        // Confirmed off-route (snapper already tried a full scan): animate
        // raw coordinates until a recalculated route arrives.
        this.offRouteMode = true;
        this.offRouteTarget = point;
        this.state.speed = update.speed ?? this.state.speed;
        this.acceptTimestamps(update, now);
        return;
      }
      // Not confirmed yet — tolerate as noise and use the clamped snap.
    } else {
      this.offRouteCount = 0;
      if (this.offRouteMode) {
        // Back within range of the route: hard re-sync onto it.
        this.offRouteMode = false;
        this.offRouteTarget = null;
        this.hardReset(snap, update, now);
        return;
      }
    }

    if (!this.hasFix) {
      this.hardReset(snap, update, now);
      return;
    }

    const dtSeconds = sinceLastMs / 1000;
    const movedMeters = snap.routeProgress - this.state.currentProgress;
    const measuredSpeed = dtSeconds > 0 ? Math.abs(movedMeters) / dtSeconds : 0;
    // Prefer source-reported speed; otherwise blend the measurement with the
    // previous estimate to damp single-sample noise.
    const speed =
      update.speed !== undefined && update.speed >= 0
        ? update.speed
        : measuredSpeed * 0.6 + this.state.speed * 0.4;

    // ---- GPS jitter filter ----------------------------------------
    // Sub-threshold movement while effectively stationary is noise; freeze
    // motion but keep timestamps fresh so the vehicle never goes stale at a
    // red light. Genuinely slow movement (speed above threshold) passes.
    if (
      Math.abs(movedMeters) < this.config.jitterThresholdMeters &&
      speed < this.config.jitterSpeedThreshold
    ) {
      const estimate = this.authoritativeProgress(now);
      this.segment = {
        startProgress: estimate,
        targetProgress: estimate,
        startTimeMs: now,
        durationMs: 0,
      };
      this.state.currentProgress = snap.routeProgress;
      this.state.targetProgress = estimate;
      this.state.speed = 0;
      this.acceptTimestamps(update, now);
      return;
    }

    // ---- Large error recovery --------------------------------------
    // Drift beyond the threshold gets a single discrete jump — better than
    // a long, visibly wrong correction glide.
    const estimate = this.authoritativeProgress(now);
    if (
      exceedsMaxError(
        estimate,
        snap.routeProgress,
        this.config.maxAllowedErrorMeters,
      )
    ) {
      this.hardReset(snap, update, now);
      return;
    }

    // ---- Normal path: chain a new interpolation segment -------------
    // Start from the current authoritative estimate (not the raw displayed
    // value — CorrectionEngine closes that gap smoothly every frame) and
    // animate to the newly snapped progress over the measured update gap.
    //
    // Forward-only: on-route progress is monotonic, so never target a point
    // behind the current estimate. A snapped progress that regresses is GPS
    // noise (the nearest-point projection wobbling backward) or dead-reckoning
    // overshoot from a late fix — animating to it is the visible "creep
    // forward then snap back" jitter. Clamp the target to the estimate so the
    // marker holds until real forward progress passes it. A genuine large
    // reversal (re-route, big GPS jump) already hit the hard reset above.
    const targetProgress = Math.max(snap.routeProgress, estimate);
    this.segment = {
      startProgress: estimate,
      targetProgress,
      startTimeMs: now,
      durationMs: clamp(
        sinceLastMs,
        this.config.minSegmentDurationMs,
        this.config.maxSegmentDurationMs,
      ),
    };
    // currentProgress tracks the true snapped position (it seeds the next
    // snap hint), even when the displayed target is held forward.
    this.state.currentProgress = snap.routeProgress;
    this.state.targetProgress = targetProgress;
    this.state.speed = speed;
    this.acceptTimestamps(update, now);
  }

  // ----------------------------------------------------------------
  // Per-frame output
  // ----------------------------------------------------------------

  getFrame(dtSeconds: number, nowMs: number): VehicleFrame {
    if (!this.hasFix) {
      return this.buildFrame(false, false, false, NaN);
    }

    if (this.offRouteMode && this.offRouteTarget) {
      return this.getOffRouteFrame(dtSeconds, nowMs);
    }

    const sinceIngestMs =
      this.lastIngestMonotonic === null
        ? Infinity
        : nowMs - this.lastIngestMonotonic;
    const elapsedMs = nowMs - this.segment.startTimeMs;

    // 1. Authoritative estimate: interpolation inside the segment window,
    //    decaying dead-reckoning beyond it, frozen after the timeout.
    let estimate: number;
    let isPredicting = false;
    if (elapsedMs <= this.segment.durationMs) {
      estimate = getDisplayedProgress(
        this.segment.startProgress,
        this.segment.targetProgress,
        elapsedMs,
        this.segment.durationMs,
      );
      this.state.isStale = false;
      this.staleFrozenProgress = null;
    } else {
      isPredicting = true;
      if (isTimedOut(sinceIngestMs, this.config.predictionTimeoutMs)) {
        // Hold position: predicting indefinitely would show the vehicle
        // confidently driving a route it may have left.
        if (this.staleFrozenProgress === null) {
          this.staleFrozenProgress = this.state.predictedProgress;
        }
        this.state.isStale = true;
        estimate = this.staleFrozenProgress;
      } else {
        const overshootSeconds = (elapsedMs - this.segment.durationMs) / 1000;
        const decayWindowSeconds = Math.max(
          1,
          (this.config.predictionTimeoutMs - this.segment.durationMs) / 1000,
        );
        estimate = predictProgress(
          this.segment.targetProgress,
          this.state.speed,
          overshootSeconds,
          decayWindowSeconds,
          this.route.totalLength,
        );
      }
      this.state.predictedProgress = estimate;
    }
    this.state.isPredicting = isPredicting;

    // 2. Smooth, frame-rate-independent correction toward the estimate.
    this.state.displayedProgress = correctTowards(
      this.state.displayedProgress,
      estimate,
      dtSeconds,
      this.config.correctionRate,
    );

    // 3. Heading from route geometry (noisy GPS heading is ignored
    //    on-route). Only steer while moving so the icon doesn't spin from
    //    micro-corrections at rest.
    const remainingError = Math.abs(estimate - this.state.displayedProgress);
    if (
      this.state.speed >= this.config.jitterSpeedThreshold ||
      remainingError > 0.5
    ) {
      this.state.heading = headingAtProgress(
        this.route,
        this.state.displayedProgress,
        this.config.headingLookaheadMeters,
      );
    }
    this.state.displayedHeading = stepHeading(
      this.state.displayedHeading,
      this.state.heading,
      dtSeconds,
      this.config.headingRate,
    );

    // 4. Back to coordinates, following the polyline through curves.
    this.displayedLatLng = progressToLatLng(
      this.route,
      this.state.displayedProgress,
    );

    return this.buildFrame(
      isPredicting,
      this.state.isStale,
      false,
      this.state.displayedProgress,
    );
  }

  /** Direct lat/lng smoothing while off-route (no usable polyline). */
  private getOffRouteFrame(dtSeconds: number, nowMs: number): VehicleFrame {
    const target = this.offRouteTarget as LatLng;
    const alpha = smoothingAlpha(this.config.correctionRate, dtSeconds);
    this.displayedLatLng = {
      latitude:
        this.displayedLatLng.latitude +
        (target.latitude - this.displayedLatLng.latitude) * alpha,
      longitude:
        this.displayedLatLng.longitude +
        (target.longitude - this.displayedLatLng.longitude) * alpha,
    };

    // Steer toward the raw fix while it is meaningfully away.
    if (computeDistanceBetween(this.displayedLatLng, target) > 2) {
      this.state.heading = computeHeading(this.displayedLatLng, target);
    }
    this.state.displayedHeading = stepHeading(
      this.state.displayedHeading,
      this.state.heading,
      dtSeconds,
      this.config.headingRate,
    );

    const sinceIngestMs =
      this.lastIngestMonotonic === null
        ? Infinity
        : nowMs - this.lastIngestMonotonic;
    this.state.isStale = isTimedOut(
      sinceIngestMs,
      this.config.predictionTimeoutMs,
    );
    this.state.isPredicting = false;

    return this.buildFrame(false, this.state.isStale, true, NaN);
  }

  // ----------------------------------------------------------------
  // Route replacement (recalculation)
  // ----------------------------------------------------------------

  /**
   * Swaps the route at runtime (re-route / recalculation). The vehicle is
   * re-snapped from its currently displayed coordinates, progress and route
   * length are recomputed, and interpolation/prediction state is rebuilt.
   */
  setRoute(routeInput: RouteInput): void {
    this.route = prepareRoute(routeInput);
    this.snapper = this.createSnapper();
    this.offRouteCount = 0;

    const now = monotonicNow();
    const snap = this.snapper.snap(this.displayedLatLng);

    if (snap.distanceFromRoute <= this.config.offRouteThresholdMeters) {
      this.offRouteMode = false;
      this.offRouteTarget = null;
      this.resetProgressState(snap, now);
    } else if (this.hasFix) {
      // New route is still far from the vehicle — stay in (or enter) the
      // raw-coordinate fallback until GPS confirms the new route.
      this.offRouteMode = true;
      this.offRouteTarget = this.offRouteTarget ?? { ...this.displayedLatLng };
    }
  }

  // ----------------------------------------------------------------
  // Accessors
  // ----------------------------------------------------------------

  /** Read-only snapshot of the internal animation state. */
  getState(): Readonly<VehicleState> {
    return this.state;
  }

  get routeLength(): number {
    return this.route.totalLength;
  }

  get isOffRoute(): boolean {
    return this.offRouteMode;
  }

  /** Milliseconds since the last accepted update (creation time if none). */
  msSinceLastUpdate(nowMs: number = monotonicNow()): number {
    return nowMs - (this.lastIngestMonotonic ?? this.createdAtMonotonic);
  }

  // ----------------------------------------------------------------
  // Internals
  // ----------------------------------------------------------------

  private createSnapper(): RouteSnapper {
    return new RouteSnapper(this.route, {
      behindWindowMeters: this.config.snapBehindWindowMeters,
      aheadWindowMeters: this.config.snapAheadWindowMeters,
      fullScanFallbackMeters: this.config.offRouteThresholdMeters,
    });
  }

  private acceptTimestamps(update: GpsUpdate, nowMonotonic: number): void {
    this.state.lastGpsTimestamp = update.timestamp ?? Date.now();
    this.lastIngestMonotonic = nowMonotonic;
    this.state.isStale = false;
    this.staleFrozenProgress = null;
    this.hasFix = true;
  }

  /** Re-seeds every progress value at the snapped point (discrete jump). */
  private hardReset(snap: SnapResult, update: GpsUpdate, now: number): void {
    this.resetProgressState(snap, now);
    this.state.speed = update.speed ?? this.state.speed;
    this.acceptTimestamps(update, now);
  }

  private resetProgressState(snap: SnapResult, now: number): void {
    this.state.currentProgress = snap.routeProgress;
    this.state.displayedProgress = snap.routeProgress;
    this.state.predictedProgress = snap.routeProgress;
    this.state.targetProgress = snap.routeProgress;
    this.segment = {
      startProgress: snap.routeProgress,
      targetProgress: snap.routeProgress,
      startTimeMs: now,
      durationMs: 0,
    };
    this.state.heading = headingAtProgress(
      this.route,
      snap.routeProgress,
      this.config.headingLookaheadMeters,
    );
    this.state.displayedHeading = this.state.heading;
    this.state.isPredicting = false;
    this.displayedLatLng = { ...snap.position };
  }

  /**
   * The pipeline's best estimate of true progress right now — interpolated
   * inside the segment window, dead-reckoned (with decay) beyond it.
   * Used as the start of the next segment and for large-error checks.
   */
  private authoritativeProgress(nowMs: number): number {
    const elapsedMs = nowMs - this.segment.startTimeMs;
    if (elapsedMs <= this.segment.durationMs) {
      return getDisplayedProgress(
        this.segment.startProgress,
        this.segment.targetProgress,
        elapsedMs,
        this.segment.durationMs,
      );
    }
    if (this.staleFrozenProgress !== null) return this.staleFrozenProgress;

    const overshootSeconds = (elapsedMs - this.segment.durationMs) / 1000;
    const decayWindowSeconds = Math.max(
      1,
      (this.config.predictionTimeoutMs - this.segment.durationMs) / 1000,
    );
    return predictProgress(
      this.segment.targetProgress,
      this.state.speed,
      overshootSeconds,
      decayWindowSeconds,
      this.route.totalLength,
    );
  }

  private buildFrame(
    isPredicting: boolean,
    isStale: boolean,
    isOffRoute: boolean,
    progress: number,
  ): VehicleFrame {
    return {
      vehicleId: this.vehicleId,
      latitude: this.displayedLatLng.latitude,
      longitude: this.displayedLatLng.longitude,
      heading: this.state.displayedHeading,
      progress,
      isPredicting,
      isStale,
      isOffRoute,
    };
  }
}
