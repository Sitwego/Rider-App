// Unit tests for the four small per-frame engines: interpolation,
// prediction, correction, and bearing smoothing.

import { describe, expect, it } from "@jest/globals";

import { stepHeading } from "../BearingInterpolator";
import {
  correctTowards,
  exceedsMaxError,
  smoothingAlpha,
} from "../CorrectionEngine";
import { Easing, getDisplayedProgress } from "../InterpolationEngine";
import {
  isTimedOut,
  predictDistance,
  predictProgress,
} from "../PredictionEngine";

describe("InterpolationEngine", () => {
  it("interpolates linearly by default", () => {
    expect(getDisplayedProgress(3220, 3250, 0, 2000)).toBe(3220);
    expect(getDisplayedProgress(3220, 3250, 1000, 2000)).toBe(3235);
    expect(getDisplayedProgress(3220, 3250, 2000, 2000)).toBe(3250);
  });

  it("clamps past the duration and handles zero duration", () => {
    expect(getDisplayedProgress(0, 100, 5000, 2000)).toBe(100);
    expect(getDisplayedProgress(0, 100, 0, 0)).toBe(100);
  });

  it("supports backward targets (vehicle reversed)", () => {
    expect(getDisplayedProgress(100, 80, 1000, 2000)).toBe(90);
  });

  it("applies a custom easing function", () => {
    const half = getDisplayedProgress(0, 100, 1000, 2000, Easing.easeInOutQuad);
    expect(half).toBe(50); // symmetric easing passes through the midpoint
    const quarter = getDisplayedProgress(
      0,
      100,
      500,
      2000,
      Easing.easeInOutQuad,
    );
    expect(quarter).toBeLessThan(25); // slow start
  });
});

describe("PredictionEngine", () => {
  it("integrates linearly-decaying speed", () => {
    // v = 10 m/s decaying to 0 over 8 s: after 1 s → 10·(1 − 1/16) = 9.375 m
    expect(predictDistance(10, 1, 8)).toBeCloseTo(9.375, 6);
    // Decay complete: total distance = v·T/2
    expect(predictDistance(10, 8, 8)).toBeCloseTo(40, 6);
    expect(predictDistance(10, 100, 8)).toBeCloseTo(40, 6);
  });

  it("never moves backward or with zero/negative inputs", () => {
    expect(predictDistance(0, 5, 8)).toBe(0);
    expect(predictDistance(-3, 5, 8)).toBe(0);
    expect(predictDistance(10, 0, 8)).toBe(0);
  });

  it("clamps predicted progress to the route bounds", () => {
    expect(predictProgress(990, 20, 5, 8, 1000)).toBe(1000);
    expect(predictProgress(500, 10, 1, 8, 1000)).toBeCloseTo(509.375, 3);
  });

  it("detects the prediction timeout", () => {
    expect(isTimedOut(9_999, 10_000)).toBe(false);
    expect(isTimedOut(10_001, 10_000)).toBe(true);
  });
});

describe("CorrectionEngine", () => {
  it("computes the time-scaled smoothing factor", () => {
    expect(smoothingAlpha(2, 0.5)).toBeCloseTo(1 - Math.exp(-1), 9);
    expect(smoothingAlpha(2, 0)).toBe(0);
    expect(smoothingAlpha(0, 1)).toBe(0);
  });

  it("is frame-rate independent: one 100 ms step ≡ two 50 ms steps", () => {
    const oneStep = correctTowards(0, 100, 0.1, 2);
    const twoSteps = correctTowards(
      correctTowards(0, 100, 0.05, 2),
      100,
      0.05,
      2,
    );
    expect(twoSteps).toBeCloseTo(oneStep, 9);
  });

  it("converges toward the target without overshooting", () => {
    let displayed = 0;
    for (let i = 0; i < 600; i++)
      displayed = correctTowards(displayed, 50, 1 / 60, 2);
    expect(displayed).toBeGreaterThan(49.9);
    expect(displayed).toBeLessThanOrEqual(50);
  });

  it("flags only errors beyond the threshold", () => {
    expect(exceedsMaxError(3400, 3200, 100)).toBe(true);
    expect(exceedsMaxError(3285, 3281, 100)).toBe(false);
    expect(exceedsMaxError(0, 100, 100)).toBe(false); // boundary is inclusive
  });
});

describe("BearingInterpolator", () => {
  it("rotates across the 0°/360° wrap by the short path", () => {
    // 350° → 10° must pass through 0°, i.e. increase past 360, not sweep back.
    let heading = 350;
    let previousDelta = 0;
    for (let i = 0; i < 120; i++) {
      const next = stepHeading(heading, 10, 1 / 60, 5);
      // Never takes the long way: heading stays out of the 90°–270° band.
      expect(next > 270 || next < 90).toBe(true);
      heading = next;
      previousDelta = next;
    }
    expect(previousDelta).toBeCloseTo(10, 0);
  });

  it("converges to the target and stays normalized", () => {
    let heading = 90;
    for (let i = 0; i < 300; i++)
      heading = stepHeading(heading, 270, 1 / 60, 5);
    expect(heading).toBeCloseTo(270, 0);
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(heading).toBeLessThan(360);
  });

  it("does nothing when already on target", () => {
    expect(stepHeading(123, 123, 1 / 60, 5)).toBe(123);
  });
});
