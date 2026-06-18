import { describe, expect, it } from "@jest/globals";

import {
  clamp,
  computeDistanceBetween,
  computeHeading,
  decodePolyline,
  interpolate,
  normalizeHeading,
  shortestHeadingDelta,
  toLocalMeters,
} from "../geo";

// 1° of latitude (or of longitude at the equator) on the mean-radius sphere.
const METERS_PER_DEGREE = 111_194.93;

describe("computeDistanceBetween", () => {
  it("measures 1° of longitude at the equator", () => {
    const d = computeDistanceBetween(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    );
    expect(d).toBeCloseTo(METERS_PER_DEGREE, -1);
  });

  it("is zero for identical points", () => {
    const p = { latitude: -1.2676, longitude: 36.6095 };
    expect(computeDistanceBetween(p, p)).toBe(0);
  });

  it("is symmetric", () => {
    const a = { latitude: -1.2, longitude: 36.6 };
    const b = { latitude: -1.3, longitude: 36.7 };
    expect(computeDistanceBetween(a, b)).toBeCloseTo(
      computeDistanceBetween(b, a),
      6,
    );
  });
});

describe("computeHeading", () => {
  const origin = { latitude: 0, longitude: 0 };

  it("returns the four cardinal directions", () => {
    expect(computeHeading(origin, { latitude: 1, longitude: 0 })).toBeCloseTo(
      0,
    );
    expect(computeHeading(origin, { latitude: 0, longitude: 1 })).toBeCloseTo(
      90,
    );
    expect(computeHeading(origin, { latitude: -1, longitude: 0 })).toBeCloseTo(
      180,
    );
    expect(computeHeading(origin, { latitude: 0, longitude: -1 })).toBeCloseTo(
      270,
    );
  });
});

describe("normalizeHeading / shortestHeadingDelta", () => {
  it("normalizes into [0, 360)", () => {
    expect(normalizeHeading(-90)).toBe(270);
    expect(normalizeHeading(370)).toBe(10);
    expect(normalizeHeading(360)).toBe(0);
  });

  it("takes the short way across the 0°/360° wrap", () => {
    expect(shortestHeadingDelta(350, 10)).toBe(20);
    expect(shortestHeadingDelta(10, 350)).toBe(-20);
    expect(shortestHeadingDelta(0, 90)).toBe(90);
    expect(shortestHeadingDelta(90, 0)).toBe(-90);
  });
});

describe("interpolate", () => {
  const a = { latitude: 0, longitude: 0 };
  const b = { latitude: 0, longitude: 1 };

  it("returns the endpoints at fraction 0 and 1", () => {
    expect(interpolate(a, b, 0)).toEqual(a);
    expect(interpolate(a, b, 1)).toEqual(b);
  });

  it("returns the geographic midpoint at fraction 0.5", () => {
    const mid = interpolate(a, b, 0.5);
    expect(mid.latitude).toBeCloseTo(0, 6);
    expect(mid.longitude).toBeCloseTo(0.5, 6);
  });

  it("handles near-coincident points without NaN", () => {
    const c = { latitude: 1.0000000001, longitude: 1.0000000001 };
    const d = { latitude: 1.0000000002, longitude: 1.0000000002 };
    const mid = interpolate(c, d, 0.5);
    expect(Number.isFinite(mid.latitude)).toBe(true);
    expect(Number.isFinite(mid.longitude)).toBe(true);
  });

  it("distance grows linearly with fraction", () => {
    const quarter = interpolate(a, b, 0.25);
    expect(computeDistanceBetween(a, quarter)).toBeCloseTo(
      0.25 * computeDistanceBetween(a, b),
      0,
    );
  });
});

describe("toLocalMeters", () => {
  it("projects north and east displacements", () => {
    const origin = { latitude: 0, longitude: 0 };
    const north = toLocalMeters(origin, { latitude: 0.001, longitude: 0 });
    expect(north.x).toBeCloseTo(0, 6);
    expect(north.y).toBeCloseTo(0.001 * METERS_PER_DEGREE, 0);

    const east = toLocalMeters(origin, { latitude: 0, longitude: 0.001 });
    expect(east.y).toBeCloseTo(0, 6);
    expect(east.x).toBeCloseTo(0.001 * METERS_PER_DEGREE, 0);
  });
});

describe("decodePolyline", () => {
  it("decodes Google's documented example", () => {
    const path = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(path).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  it("returns an empty path for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("clamp", () => {
  it("clamps to the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
