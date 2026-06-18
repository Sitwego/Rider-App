// ----------------------------------------------------------------
// Route progress model.
//
// The polyline is the single source of truth for vehicle position:
// all animation runs on a 1-D "progress" axis (meters from the route
// start) and is only converted back to lat/lng at render time.
//
// prepareRoute() is called once per route and pre-computes cumulative
// segment distances, so every later progress↔coordinate conversion is
// a binary search + one interpolation (O(log n)).
// ----------------------------------------------------------------

import {
  clamp,
  computeDistanceBetween,
  computeHeading,
  decodePolyline,
  interpolate,
  type LatLng,
} from "./geo";

import type { RouteInput } from "./types";

export interface PreparedRoute {
  /** Route vertices with zero-length segments removed. */
  points: readonly LatLng[];
  /** cumulative[i] = meters from route start to points[i]; cumulative[0] = 0. */
  cumulative: readonly number[];
  /** Total route length in meters. */
  totalLength: number;
}

/** Position of a progress value inside the route's segment list. */
export interface SegmentPosition {
  /** Index of the segment start vertex (points[index] → points[index + 1]). */
  index: number;
  /** Fraction [0, 1] along that segment. */
  t: number;
}

/**
 * Builds the immutable progress model for a route.
 * Accepts decoded coordinates or a Google encoded polyline string.
 *
 * @throws if the route has fewer than 2 distinct points.
 */
export function prepareRoute(input: RouteInput): PreparedRoute {
  const raw = typeof input === "string" ? decodePolyline(input) : input;

  // Drop consecutive duplicates — zero-length segments break snapping math.
  const points: LatLng[] = [];
  for (const p of raw) {
    const prev = points[points.length - 1];
    if (prev && prev.latitude === p.latitude && prev.longitude === p.longitude)
      continue;
    points.push({ latitude: p.latitude, longitude: p.longitude });
  }

  if (points.length < 2) {
    throw new Error(
      `prepareRoute: route needs at least 2 distinct points, got ${points.length}`,
    );
  }

  const cumulative = new Array<number>(points.length);
  cumulative[0] = 0;
  for (let i = 1; i < points.length; i++) {
    cumulative[i] =
      cumulative[i - 1] + computeDistanceBetween(points[i - 1], points[i]);
  }

  return { points, cumulative, totalLength: cumulative[points.length - 1] };
}

/**
 * Locates `progress` (meters, clamped to [0, totalLength]) inside the
 * segment list via binary search on the cumulative distances.
 */
export function progressToSegment(
  route: PreparedRoute,
  progress: number,
): SegmentPosition {
  const { cumulative } = route;
  const clamped = clamp(progress, 0, route.totalLength);

  // Find the last vertex whose cumulative distance is <= clamped.
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumulative[mid] <= clamped) lo = mid;
    else hi = mid - 1;
  }

  // Progress exactly at (or past) the final vertex → end of last segment.
  if (lo >= cumulative.length - 1) {
    return { index: cumulative.length - 2, t: 1 };
  }

  const segmentLength = cumulative[lo + 1] - cumulative[lo];
  const t = segmentLength > 0 ? (clamped - cumulative[lo]) / segmentLength : 0;
  return { index: lo, t };
}

/** Converts route progress (meters) back into coordinates. */
export function progressToLatLng(
  route: PreparedRoute,
  progress: number,
): LatLng {
  const { index, t } = progressToSegment(route, progress);
  if (t <= 0) return { ...route.points[index] };
  if (t >= 1) return { ...route.points[index + 1] };
  return interpolate(route.points[index], route.points[index + 1], t);
}

/**
 * Heading of the route at `progress`, in compass degrees.
 *
 * Looks `lookaheadMeters` ahead (clamped to the route end) so the heading
 * turns smoothly through vertices instead of snapping segment-to-segment.
 * Near the route end, looks backward instead so the final heading stays
 * meaningful.
 */
export function headingAtProgress(
  route: PreparedRoute,
  progress: number,
  lookaheadMeters = 8,
): number {
  const from = clamp(progress, 0, route.totalLength);
  let ahead = from + lookaheadMeters;

  if (ahead > route.totalLength) {
    // At the route end: derive heading from the approach direction.
    const back = Math.max(0, route.totalLength - lookaheadMeters);
    return computeHeading(
      progressToLatLng(route, back),
      progressToLatLng(route, route.totalLength),
    );
  }

  // Guard against zero-distance heading (undefined direction).
  if (ahead - from < 0.01) ahead = Math.min(from + 0.01, route.totalLength);

  return computeHeading(
    progressToLatLng(route, from),
    progressToLatLng(route, ahead),
  );
}

/**
 * Maps a progress window [progress - behind, progress + ahead] to the
 * inclusive vertex index range that covers it. Used by the snapper to
 * restrict its nearest-segment search.
 */
export function progressWindowToIndexRange(
  route: PreparedRoute,
  progress: number,
  behindMeters: number,
  aheadMeters: number,
): { startIndex: number; endIndex: number } {
  const startIndex = progressToSegment(route, progress - behindMeters).index;
  const endIndex = progressToSegment(route, progress + aheadMeters).index;
  return { startIndex, endIndex };
}
