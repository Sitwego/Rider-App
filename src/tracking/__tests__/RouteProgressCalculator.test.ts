import { describe, expect, it } from "@jest/globals";

import {
  headingAtProgress,
  prepareRoute,
  progressToLatLng,
  progressToSegment,
} from "../RouteProgressCalculator";

import type { LatLng } from "../geo";

/** Straight route heading due north: a vertex every 0.001° (~111.2 m). */
function northRoute(vertices = 10): LatLng[] {
  return Array.from({ length: vertices }, (_, i) => ({
    latitude: i * 0.001,
    longitude: 0,
  }));
}

const METERS_PER_MILLIDEGREE = 111.195;

describe("prepareRoute", () => {
  it("computes cumulative distances and total length", () => {
    const route = prepareRoute(northRoute(10));
    expect(route.cumulative[0]).toBe(0);
    expect(route.totalLength).toBeCloseTo(9 * METERS_PER_MILLIDEGREE, 0);
    // Cumulative distances must be strictly increasing.
    for (let i = 1; i < route.cumulative.length; i++) {
      expect(route.cumulative[i]).toBeGreaterThan(route.cumulative[i - 1]);
    }
  });

  it("drops consecutive duplicate vertices", () => {
    const points = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
      { latitude: 0.001, longitude: 0 },
    ];
    expect(prepareRoute(points).points).toHaveLength(2);
  });

  it("throws on degenerate routes", () => {
    expect(() => prepareRoute([{ latitude: 0, longitude: 0 }])).toThrow();
    expect(() =>
      prepareRoute([
        { latitude: 1, longitude: 1 },
        { latitude: 1, longitude: 1 },
      ]),
    ).toThrow();
  });

  it("accepts an encoded polyline string", () => {
    const route = prepareRoute("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(route.points).toHaveLength(3);
    expect(route.totalLength).toBeGreaterThan(100_000);
  });
});

describe("progressToSegment", () => {
  const route = prepareRoute(northRoute(10));

  it("clamps below 0 and above the route length", () => {
    expect(progressToSegment(route, -50)).toEqual({ index: 0, t: 0 });
    const end = progressToSegment(route, route.totalLength + 50);
    expect(end.index).toBe(route.points.length - 2);
    expect(end.t).toBe(1);
  });

  it("locates a mid-segment progress", () => {
    const { index, t } = progressToSegment(route, 1.5 * METERS_PER_MILLIDEGREE);
    expect(index).toBe(1);
    expect(t).toBeCloseTo(0.5, 2);
  });
});

describe("progressToLatLng", () => {
  const route = prepareRoute(northRoute(10));

  it("maps 0 and totalLength to the endpoints", () => {
    expect(progressToLatLng(route, 0)).toEqual(route.points[0]);
    const end = progressToLatLng(route, route.totalLength);
    expect(end.latitude).toBeCloseTo(0.009, 9);
  });

  it("maps half progress to the route midpoint", () => {
    const mid = progressToLatLng(route, route.totalLength / 2);
    expect(mid.latitude).toBeCloseTo(0.0045, 5);
    expect(mid.longitude).toBeCloseTo(0, 6);
  });
});

describe("headingAtProgress", () => {
  it("follows the route direction, including at the very end", () => {
    const route = prepareRoute(northRoute(10));
    expect(headingAtProgress(route, 200)).toBeCloseTo(0, 0);
    // At the end the heading is derived from the approach direction.
    expect(headingAtProgress(route, route.totalLength)).toBeCloseTo(0, 0);
  });

  it("turns through corners", () => {
    // North for ~111 m, then east for ~111 m.
    const route = prepareRoute([
      { latitude: 0, longitude: 0 },
      { latitude: 0.001, longitude: 0 },
      { latitude: 0.001, longitude: 0.001 },
    ]);
    expect(headingAtProgress(route, 10)).toBeCloseTo(0, 0);
    expect(headingAtProgress(route, 150)).toBeCloseTo(90, 0);
  });
});
