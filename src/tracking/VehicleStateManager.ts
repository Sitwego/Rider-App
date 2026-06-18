// ----------------------------------------------------------------
// Vehicle state manager.
//
// Owns the Map<vehicleId, VehicleTracker>. Each vehicle keeps fully
// independent state/prediction/interpolation, while ONE shared
// animation loop iterates them all (see AnimationController).
// Designed for 100+ concurrent vehicles: per-frame work is one map
// iteration with O(log n) math per vehicle and zero allocation
// besides the output frames.
// ----------------------------------------------------------------

import { monotonicNow } from "./AnimationController";
import { VehicleTracker } from "./VehicleTracker";

import type { GpsUpdate, RouteInput, TrackerConfig } from "./types";

export class VehicleStateManager {
  private readonly trackers = new Map<string, VehicleTracker>();
  private readonly config: Partial<TrackerConfig>;

  constructor(config: Partial<TrackerConfig> = {}) {
    this.config = config;
  }

  /**
   * Returns the tracker for `vehicleId`, creating it (with `route`) when it
   * does not exist yet. Calling it again for an existing vehicle replaces
   * the route only when `replaceRoute` is set.
   */
  ensure(
    vehicleId: string,
    route: RouteInput,
    options: { replaceRoute?: boolean; initialUpdate?: GpsUpdate } = {},
  ): VehicleTracker {
    let tracker = this.trackers.get(vehicleId);
    if (!tracker) {
      tracker = new VehicleTracker(
        vehicleId,
        route,
        this.config,
        options.initialUpdate,
      );
      this.trackers.set(vehicleId, tracker);
    } else if (options.replaceRoute) {
      tracker.setRoute(route);
    }
    return tracker;
  }

  get(vehicleId: string): VehicleTracker | undefined {
    return this.trackers.get(vehicleId);
  }

  has(vehicleId: string): boolean {
    return this.trackers.has(vehicleId);
  }

  /** @returns false when no tracker exists for the vehicle (update dropped). */
  ingest(vehicleId: string, update: GpsUpdate): boolean {
    const tracker = this.trackers.get(vehicleId);
    if (!tracker) return false;
    tracker.ingestGpsUpdate(update);
    return true;
  }

  remove(vehicleId: string): boolean {
    return this.trackers.delete(vehicleId);
  }

  clear(): void {
    this.trackers.clear();
  }

  get size(): number {
    return this.trackers.size;
  }

  /**
   * Iterates a snapshot of the current trackers, so callbacks may safely
   * add or remove vehicles mid-iteration (e.g. eviction inside the
   * animation loop).
   */
  forEach(callback: (tracker: VehicleTracker) => void): void {
    for (const tracker of Array.from(this.trackers.values())) {
      callback(tracker);
    }
  }

  /**
   * Removes vehicles that have not received an update for `maxInactivityMs`.
   * @returns The evicted vehicle ids.
   */
  evictInactive(
    maxInactivityMs: number,
    nowMs: number = monotonicNow(),
  ): string[] {
    const evicted: string[] = [];
    for (const [vehicleId, tracker] of this.trackers) {
      if (tracker.msSinceLastUpdate(nowMs) > maxInactivityMs) {
        evicted.push(vehicleId);
      }
    }
    for (const vehicleId of evicted) this.trackers.delete(vehicleId);
    return evicted;
  }
}
