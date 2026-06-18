import { describe, expect, it } from "@jest/globals";

import { prepareRoute } from "../RouteProgressCalculator";
import { RouteSnapper } from "../RouteSnapper";

import type { LatLng } from "../geo";

/** Straight route heading due north: a vertex every 0.001° (~111.2 m). */
function northRoute(vertices = 19): LatLng[] {
  return Array.from({ length: vertices }, (_, i) => ({
    latitude: i * 0.001,
    longitude: 0,
  }));
}

const METERS_PER_MILLIDEGREE = 111.195;

describe("RouteSnapper", () => {
  const route = prepareRoute(northRoute());
  const snapper = new RouteSnapper(route);

  it("snaps a noisy fix onto the polyline", () => {
    // ~389 m up the route, displaced ~11 m east of the road.
    const result = snapper.snap({ latitude: 0.0035, longitude: 0.0001 });

    expect(result.position.longitude).toBeCloseTo(0, 6);
    expect(result.position.latitude).toBeCloseTo(0.0035, 5);
    expect(result.routeProgress).toBeCloseTo(3.5 * METERS_PER_MILLIDEGREE, 0);
    expect(result.distanceFromRoute).toBeCloseTo(
      0.1 * METERS_PER_MILLIDEGREE,
      0,
    );
  });

  it("clamps to the nearest endpoint beyond the route ends", () => {
    const before = snapper.snap({ latitude: -0.001, longitude: 0 });
    expect(before.routeProgress).toBe(0);

    const after = snapper.snap({ latitude: 0.02, longitude: 0 });
    expect(after.routeProgress).toBeCloseTo(route.totalLength, 5);
  });

  it("windowed search (with hint) matches the full scan on-route", () => {
    const point = { latitude: 0.0061, longitude: 0.00005 };
    const full = snapper.snap(point);
    const hinted = snapper.snap(point, 6 * METERS_PER_MILLIDEGREE);
    expect(hinted.routeProgress).toBeCloseTo(full.routeProgress, 4);
    expect(hinted.distanceFromRoute).toBeCloseTo(full.distanceFromRoute, 4);
  });

  it("falls back to a full scan when the fix is far outside the hint window", () => {
    // Fix near the route end while the hint claims the route start.
    const result = snapper.snap({ latitude: 0.017, longitude: 0 }, 0);
    expect(result.routeProgress).toBeCloseTo(17 * METERS_PER_MILLIDEGREE, 0);
    expect(result.distanceFromRoute).toBeLessThan(1);
  });

  it("reports a large distance for genuinely off-route fixes", () => {
    const result = snapper.snap({ latitude: 0.002, longitude: 0.01 });
    expect(result.distanceFromRoute).toBeGreaterThan(1000);
  });
});
