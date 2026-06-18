// ----------------------------------------------------------------
// GPS signal simulator (dev/test utility).
//
// Drives a virtual vehicle along a route at a constant speed and
// emits GpsUpdate fixes on a fixed cadence — exactly what the real
// backend/native bridge delivers every ~2 s — with optional lateral
// GPS noise and a signal-loss switch for exercising the prediction
// and staleness paths of the tracking pipeline.
//
// Pure TypeScript: runs in the app (demo screen) and in jest
// (drive it manually with tickOnce(), no timers needed).
// ----------------------------------------------------------------

import {
  prepareRoute,
  progressToLatLng,
  type PreparedRoute,
} from "../RouteProgressCalculator";
import { EARTH_RADIUS_M, toDegrees, toRadians, type LatLng } from "../geo";

import type { GpsUpdate } from "../types";

export interface GpsSimulatorOptions {
  /** Cruising speed in m/s. Default 14 (~50 km/h). */
  speedMps?: number;
  /** Fix cadence in ms. Default 2000 — the production update interval. */
  intervalMs?: number;
  /** Max lateral GPS noise in meters (uniform ±). Default 4. */
  noiseMeters?: number;
  /** Restart from the route start after reaching the end. Default false. */
  loop?: boolean;
  /** Random source — inject a seeded generator for deterministic tests. */
  random?: () => number;
}

export type GpsFixListener = (fix: GpsUpdate) => void;

export class GpsSimulator {
  private readonly route: PreparedRoute;
  private readonly speedMps: number;
  private readonly intervalMs: number;
  private readonly noiseMeters: number;
  private readonly loop: boolean;
  private readonly random: () => number;

  private progress = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listener: GpsFixListener | null = null;
  private signalLost = false;

  constructor(routePoints: LatLng[], options: GpsSimulatorOptions = {}) {
    this.route = prepareRoute(routePoints);
    this.speedMps = options.speedMps ?? 14;
    this.intervalMs = options.intervalMs ?? 2000;
    this.noiseMeters = options.noiseMeters ?? 4;
    this.loop = options.loop ?? false;
    this.random = options.random ?? Math.random;
  }

  get routeLength(): number {
    return this.route.totalLength;
  }

  get currentProgress(): number {
    return this.progress;
  }

  get isFinished(): boolean {
    return !this.loop && this.progress >= this.route.totalLength;
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  /** Starts emitting fixes (first one immediately, then every intervalMs). */
  start(onFix: GpsFixListener): void {
    this.listener = onFix;
    this.emit(this.buildFix());
    this.resume();
  }

  /** Suspends the timer; progress is kept (use resume() to continue). */
  pause(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  resume(): void {
    if (this.timer !== null || this.listener === null) return;
    this.timer = setInterval(() => {
      const fix = this.tickOnce();
      if (fix) this.emit(fix);
    }, this.intervalMs);
  }

  stop(): void {
    this.pause();
    this.listener = null;
  }

  /** Teleports the vehicle back to the route start (progress 0). */
  reset(): void {
    this.progress = 0;
  }

  /**
   * Simulates losing the GPS/network signal: the vehicle keeps driving
   * but no fixes are emitted until the signal is restored.
   */
  setSignalLost(lost: boolean): void {
    this.signalLost = lost;
  }

  get isSignalLost(): boolean {
    return this.signalLost;
  }

  /**
   * Advances the simulation by one interval and returns the fix that
   * would be emitted (null while the signal is lost). Lets tests drive
   * the simulator deterministically without timers.
   */
  tickOnce(dtMs: number = this.intervalMs): GpsUpdate | null {
    this.progress += this.speedMps * (dtMs / 1000);
    if (this.progress >= this.route.totalLength) {
      this.progress = this.loop ? 0 : this.route.totalLength;
    }
    return this.signalLost ? null : this.buildFix();
  }

  private buildFix(): GpsUpdate {
    const onRoute = progressToLatLng(this.route, this.progress);

    // Uniform lateral noise in a local meters frame, converted to degrees.
    const eastMeters = (this.random() * 2 - 1) * this.noiseMeters;
    const northMeters = (this.random() * 2 - 1) * this.noiseMeters;
    const latitude = onRoute.latitude + toDegrees(northMeters / EARTH_RADIUS_M);
    const longitude =
      onRoute.longitude +
      toDegrees(
        eastMeters / (EARTH_RADIUS_M * Math.cos(toRadians(onRoute.latitude))),
      );

    return {
      latitude,
      longitude,
      timestamp: Date.now(),
      // Like the production feed, no speed/heading — the tracker estimates.
    };
  }

  private emit(fix: GpsUpdate): void {
    this.listener?.(fix);
  }
}
