// ----------------------------------------------------------------
// Route snapping engine.
//
// Snaps noisy GPS fixes onto the route polyline so the vehicle is
// always rendered on the road. Segment projection runs in a flat
// local frame (meters) centered on the GPS fix — accurate to well
// under a meter at segment scale and much cheaper than spherical
// math in the hot loop.
//
// Performance: when a progress hint is available (every update after
// the first), only segments inside a window around the hint are
// scanned — O(k) instead of O(n). The full polyline is scanned only
// when there is no hint or the windowed result looks off-route
// (re-route / GPS recovery cases).
// ----------------------------------------------------------------

import {
  progressWindowToIndexRange,
  type PreparedRoute,
} from "./RouteProgressCalculator";
import { toLocalMeters, type LatLng } from "./geo";

export interface SnapResult {
  /** Snapped coordinates, guaranteed to lie on the polyline. */
  position: LatLng;
  /** Meters from the route start to the snapped point. */
  routeProgress: number;
  /** Perpendicular distance from the raw fix to the route (meters). */
  distanceFromRoute: number;
  /** Index of the segment the point snapped onto. */
  segmentIndex: number;
}

export interface RouteSnapperOptions {
  /** Window behind the hinted progress, meters. */
  behindWindowMeters?: number;
  /** Window ahead of the hinted progress, meters. */
  aheadWindowMeters?: number;
  /**
   * If the windowed search ends up farther than this from the route,
   * retry with a full scan (handles re-routes and GPS recovery).
   */
  fullScanFallbackMeters?: number;
}

export class RouteSnapper {
  private readonly route: PreparedRoute;
  private readonly behindWindow: number;
  private readonly aheadWindow: number;
  private readonly fullScanFallback: number;

  constructor(route: PreparedRoute, options: RouteSnapperOptions = {}) {
    this.route = route;
    this.behindWindow = options.behindWindowMeters ?? 250;
    this.aheadWindow = options.aheadWindowMeters ?? 600;
    this.fullScanFallback = options.fullScanFallbackMeters ?? 50;
  }

  /**
   * Snaps a GPS fix to the route.
   *
   * @param point        Raw GPS coordinates.
   * @param hintProgress Last known route progress (meters). When provided,
   *                     the search is restricted to a window around it.
   */
  snap(point: LatLng, hintProgress?: number): SnapResult {
    if (hintProgress !== undefined) {
      const { startIndex, endIndex } = progressWindowToIndexRange(
        this.route,
        hintProgress,
        this.behindWindow,
        this.aheadWindow,
      );
      const windowed = this.scanSegments(point, startIndex, endIndex);

      // Window missed (vehicle re-routed, long GPS gap, …) → full scan.
      if (windowed.distanceFromRoute <= this.fullScanFallback) {
        return windowed;
      }
      const full = this.scanSegments(point, 0, this.route.points.length - 2);
      return full.distanceFromRoute < windowed.distanceFromRoute
        ? full
        : windowed;
    }

    return this.scanSegments(point, 0, this.route.points.length - 2);
  }

  /** Nearest-point search over segments [startIndex, endIndex] inclusive. */
  private scanSegments(
    point: LatLng,
    startIndex: number,
    endIndex: number,
  ): SnapResult {
    const { points, cumulative } = this.route;

    let bestDistSq = Infinity;
    let bestIndex = startIndex;
    let bestT = 0;

    // Project everything into a flat frame centered on the GPS fix; the
    // fix itself is then the origin, so point-to-segment distance is just
    // the norm of the projected closest point.
    for (let i = startIndex; i <= endIndex; i++) {
      const a = toLocalMeters(point, points[i]);
      const b = toLocalMeters(point, points[i + 1]);

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;

      // t = projection of origin onto segment a→b, clamped to the segment.
      let t = 0;
      if (lengthSq > 0) {
        t = -(a.x * dx + a.y * dy) / lengthSq;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }

      const cx = a.x + t * dx;
      const cy = a.y + t * dy;
      const distSq = cx * cx + cy * cy;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestIndex = i;
        bestT = t;
      }
    }

    const segStart = points[bestIndex];
    const segEnd = points[bestIndex + 1];
    // Linear lat/lng blend is fine here: polyline segments are short and
    // the projection itself was planar.
    const position: LatLng = {
      latitude:
        segStart.latitude + (segEnd.latitude - segStart.latitude) * bestT,
      longitude:
        segStart.longitude + (segEnd.longitude - segStart.longitude) * bestT,
    };
    const segmentLength = cumulative[bestIndex + 1] - cumulative[bestIndex];

    return {
      position,
      routeProgress: cumulative[bestIndex] + segmentLength * bestT,
      distanceFromRoute: Math.sqrt(bestDistSq),
      segmentIndex: bestIndex,
    };
  }
}
