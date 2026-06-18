// ----------------------------------------------------------------
// Pure spherical-geometry helpers for the vehicle tracking engine.
//
// This module intentionally has ZERO dependencies (no react-native,
// no expo, no google maps) so the whole tracking pipeline can run —
// and be unit-tested — in plain Node. It mirrors the parts of
// google.maps.geometry.spherical that the engine needs:
//
//   computeDistanceBetween  → haversine distance (meters)
//   computeHeading          → initial bearing (degrees, 0–360)
//   interpolate             → great-circle interpolation by fraction
//   decodePolyline          → Google encoded-polyline decoding
// ----------------------------------------------------------------

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Mean Earth radius (meters) — same constant Google's geometry lib uses. */
export const EARTH_RADIUS_M = 6371008.8;

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Great-circle (haversine) distance between two points, in meters. */
export function computeDistanceBetween(a: LatLng, b: LatLng): number {
  const phi1 = toRadians(a.latitude);
  const phi2 = toRadians(b.latitude);
  const dPhi = toRadians(b.latitude - a.latitude);
  const dLambda = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Initial bearing from `a` to `b`, in compass degrees [0, 360).
 * 0° = North, 90° = East.
 */
export function computeHeading(a: LatLng, b: LatLng): number {
  const phi1 = toRadians(a.latitude);
  const phi2 = toRadians(b.latitude);
  const dLambda = toRadians(b.longitude - a.longitude);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return normalizeHeading(toDegrees(Math.atan2(y, x)));
}

/** Normalizes any angle to the compass range [0, 360). */
export function normalizeHeading(degrees: number): number {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

/**
 * Signed shortest rotation from `from` to `to`, in degrees [-180, 180].
 * Positive = clockwise. E.g. 350° → 10° yields +20, never −340.
 */
export function shortestHeadingDelta(from: number, to: number): number {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

/**
 * Great-circle interpolation between `from` and `to` by `fraction` ∈ [0, 1].
 * Falls back to linear interpolation for near-coincident points where the
 * spherical formula loses precision.
 */
export function interpolate(
  from: LatLng,
  to: LatLng,
  fraction: number,
): LatLng {
  if (fraction <= 0) return { ...from };
  if (fraction >= 1) return { ...to };

  const phi1 = toRadians(from.latitude);
  const lambda1 = toRadians(from.longitude);
  const phi2 = toRadians(to.latitude);
  const lambda2 = toRadians(to.longitude);

  // Angular distance between the points.
  const h =
    Math.sin((phi2 - phi1) / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin((lambda2 - lambda1) / 2) ** 2;
  const delta = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  // Near-coincident points: sin(delta) → 0 makes the slerp unstable, and a
  // linear blend is indistinguishable at this scale.
  if (delta < 1e-9) {
    return {
      latitude: from.latitude + (to.latitude - from.latitude) * fraction,
      longitude: from.longitude + (to.longitude - from.longitude) * fraction,
    };
  }

  const sinDelta = Math.sin(delta);
  const a = Math.sin((1 - fraction) * delta) / sinDelta;
  const b = Math.sin(fraction * delta) / sinDelta;

  const x =
    a * Math.cos(phi1) * Math.cos(lambda1) +
    b * Math.cos(phi2) * Math.cos(lambda2);
  const y =
    a * Math.cos(phi1) * Math.sin(lambda1) +
    b * Math.cos(phi2) * Math.sin(lambda2);
  const z = a * Math.sin(phi1) + b * Math.sin(phi2);

  return {
    latitude: toDegrees(Math.atan2(z, Math.hypot(x, y))),
    longitude: toDegrees(Math.atan2(y, x)),
  };
}

/**
 * Projects `point` into a flat local east/north frame (meters) centered on
 * `origin` (equirectangular approximation). Accurate to well under a meter
 * for the sub-kilometer spans used during segment snapping, and far cheaper
 * than full spherical math inside the snapping hot loop.
 */
export function toLocalMeters(
  origin: LatLng,
  point: LatLng,
): { x: number; y: number } {
  const cosLat = Math.cos(toRadians(origin.latitude));
  return {
    x: toRadians(point.longitude - origin.longitude) * EARTH_RADIUS_M * cosLat,
    y: toRadians(point.latitude - origin.latitude) * EARTH_RADIUS_M,
  };
}

/**
 * Decodes a Google encoded polyline string into coordinates.
 * Same wire format as google.maps.geometry.encoding.decodePath.
 *
 * @param precision 5 for standard Google polylines, 6 for OSRM/Valhalla.
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const path: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const axis of ["lat", "lng"] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === "lat") lat += delta;
      else lng += delta;
    }
    path.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return path;
}
