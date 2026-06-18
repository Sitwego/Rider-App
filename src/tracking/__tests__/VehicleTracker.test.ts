// End-to-end pipeline tests: GPS ingestion → snapping → interpolation →
// prediction → correction → frames, under a controlled monotonic clock.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { VehicleTracker } from "../VehicleTracker";

import type { LatLng } from "../geo";
import type { VehicleFrame } from "../types";

/** Straight route heading due north: a vertex every 0.001° (~111.2 m). */
function northRoute(vertices = 19): LatLng[] {
  return Array.from({ length: vertices }, (_, i) => ({
    latitude: i * 0.001,
    longitude: 0,
  }));
}

const METERS_PER_MILLIDEGREE = 111.195;

let now = 0;

/** Advances the fake clock and pumps animation frames at ~60 fps. */
function runFrames(
  tracker: VehicleTracker,
  ms: number,
  step = 16,
): VehicleFrame {
  let frame: VehicleFrame | undefined;
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    now += step;
    frame = tracker.getFrame(step / 1000, now);
  }
  return frame as VehicleFrame;
}

beforeEach(() => {
  now = 0;
  jest.spyOn(globalThis.performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("VehicleTracker — normal operation", () => {
  it("starts at the snapped first fix", () => {
    const tracker = new VehicleTracker("v1", northRoute());
    tracker.ingestGpsUpdate({
      latitude: 0.001,
      longitude: 0.0001,
      timestamp: 1,
    });

    const frame = tracker.getFrame(0.016, now);
    expect(frame.latitude).toBeCloseTo(0.001, 5);
    expect(frame.longitude).toBeCloseTo(0, 6); // snapped onto the road
    expect(frame.isOffRoute).toBe(false);
  });

  it("moves smoothly between updates with no per-frame jumps", () => {
    const tracker = new VehicleTracker("v1", northRoute());
    tracker.ingestGpsUpdate({ latitude: 0, longitude: 0, timestamp: 1000 });

    // Vehicle does ~40 m per 2 s update (≈ 72 km/h).
    let previousProgress = 0;
    for (let updateIndex = 1; updateIndex <= 5; updateIndex++) {
      tracker.ingestGpsUpdate({
        latitude: updateIndex * 0.00036,
        longitude: 0,
        timestamp: 1000 + updateIndex * 2000,
      });
      for (let frameIndex = 0; frameIndex < 125; frameIndex++) {
        now += 16;
        const frame = tracker.getFrame(0.016, now);
        const delta = frame.progress - previousProgress;
        // Monotonic forward movement, never more than ~2 m in one frame
        // (40 m/2 s ≈ 0.64 m per frame + correction catch-up).
        expect(delta).toBeGreaterThanOrEqual(0);
        expect(delta).toBeLessThan(2);
        previousProgress = frame.progress;
      }
    }
    // After 5 updates the displayed position must be well along the route.
    expect(previousProgress).toBeGreaterThan(100);
  });

  it("derives heading from route geometry", () => {
    // North then east.
    const tracker = new VehicleTracker("v1", [
      { latitude: 0, longitude: 0 },
      { latitude: 0.001, longitude: 0 },
      { latitude: 0.001, longitude: 0.002 },
    ]);
    tracker.ingestGpsUpdate({ latitude: 0, longitude: 0, timestamp: 1000 });
    let frame = runFrames(tracker, 100);
    expect(frame.heading).toBeCloseTo(0, 0);

    // Move past the corner; heading should swing toward east (90°).
    tracker.ingestGpsUpdate({
      latitude: 0.001,
      longitude: 0.0005,
      timestamp: 3000,
    });
    runFrames(tracker, 2000);
    tracker.ingestGpsUpdate({
      latitude: 0.001,
      longitude: 0.001,
      timestamp: 5000,
    });
    frame = runFrames(tracker, 3000);
    expect(frame.heading).toBeGreaterThan(60);
    expect(frame.heading).toBeLessThan(120);
  });
});

describe("VehicleTracker — prediction and staleness", () => {
  it("keeps moving past the segment end while the next update is late", () => {
    const tracker = new VehicleTracker("v1", northRoute());
    tracker.ingestGpsUpdate({ latitude: 0, longitude: 0, timestamp: 1000 });
    runFrames(tracker, 2000); // realistic 2 s gap so speed can be measured
    tracker.ingestGpsUpdate({
      latitude: 0.00036,
      longitude: 0,
      timestamp: 3000,
    });

    // Exhaust the 2 s interpolation segment…
    const atSegmentEnd = runFrames(tracker, 2000);
    // …then keep going with no new update: prediction must keep it moving.
    const predicted = runFrames(tracker, 2000);
    expect(predicted.isPredicting).toBe(true);
    expect(predicted.progress).toBeGreaterThan(atSegmentEnd.progress + 5);
    expect(predicted.isStale).toBe(false);
  });

  it("freezes and goes stale after the prediction timeout", () => {
    const tracker = new VehicleTracker("v1", northRoute());
    tracker.ingestGpsUpdate({ latitude: 0, longitude: 0, timestamp: 1000 });
    runFrames(tracker, 2000);
    tracker.ingestGpsUpdate({
      latitude: 0.00036,
      longitude: 0,
      timestamp: 3000,
    });

    const justStale = runFrames(tracker, 11_000);
    expect(justStale.isStale).toBe(true);

    // Long after the timeout the position must have stopped drifting.
    const muchLater = runFrames(tracker, 5_000);
    expect(muchLater.progress).toBeCloseTo(justStale.progress, 0);

    // A fresh update revives the vehicle.
    tracker.ingestGpsUpdate({
      latitude: 0.0008,
      longitude: 0,
      timestamp: 20_000,
    });
    const revived = runFrames(tracker, 1000);
    expect(revived.isStale).toBe(false);
  });
});

describe("VehicleTracker — update validation", () => {
  it("discards out-of-order updates", () => {
    const tracker = new VehicleTracker("v1", northRoute());
    tracker.ingestGpsUpdate({ latitude: 0.002, longitude: 0, timestamp: 5000 });
    const before = tracker.getState().currentProgress;

    tracker.ingestGpsUpdate({ latitude: 0, longitude: 0, timestamp: 4000 });
    expect(tracker.getState().currentProgress).toBe(before);
  });

  it("filters stationary GPS jitter but keeps the vehicle fresh", () => {
    const tracker = new VehicleTracker("v1", northRoute());
    tracker.ingestGpsUpdate({ latitude: 0.001, longitude: 0, timestamp: 1000 });
    runFrames(tracker, 2000);
    const settled = tracker.getState().displayedProgress;

    // 20 s of sub-meter jitter around the same spot (10 updates, 2 s apart).
    for (let i = 1; i <= 10; i++) {
      tracker.ingestGpsUpdate({
        latitude: 0.001 + (i % 2 === 0 ? 0.000004 : -0.000004),
        longitude: 0,
        timestamp: 1000 + i * 2000,
      });
      const frame = runFrames(tracker, 2000);
      // Marker must not creep or go stale while parked.
      expect(Math.abs(frame.progress - settled)).toBeLessThan(3);
      expect(frame.isStale).toBe(false);
    }
    expect(tracker.getState().speed).toBe(0);
  });

  it("hard-jumps on large error instead of gliding", () => {
    const tracker = new VehicleTracker("v1", northRoute());
    tracker.ingestGpsUpdate({ latitude: 0, longitude: 0, timestamp: 1000 });
    runFrames(tracker, 500);

    // Next fix is ~1112 m up the route — far beyond MAX_ALLOWED_ERROR.
    tracker.ingestGpsUpdate({ latitude: 0.01, longitude: 0, timestamp: 3000 });
    const frame = tracker.getFrame(0.016, now + 16);
    expect(frame.progress).toBeCloseTo(10 * METERS_PER_MILLIDEGREE, 0);
  });
});

describe("VehicleTracker — off-route and route replacement", () => {
  it("falls back to raw-coordinate animation after consecutive off-route fixes", () => {
    const tracker = new VehicleTracker("v1", northRoute());
    tracker.ingestGpsUpdate({ latitude: 0.001, longitude: 0, timestamp: 1000 });

    // Three consecutive fixes ~1.1 km east of the route.
    for (let i = 1; i <= 3; i++) {
      tracker.ingestGpsUpdate({
        latitude: 0.001 + i * 0.0001,
        longitude: 0.01,
        timestamp: 1000 + i * 2000,
      });
    }
    expect(tracker.isOffRoute).toBe(true);

    const frame = runFrames(tracker, 5000);
    expect(frame.isOffRoute).toBe(true);
    // The marker eases toward the raw fix instead of sticking to the route.
    expect(frame.longitude).toBeGreaterThan(0.005);

    // A fix back on the route recovers route-based tracking.
    tracker.ingestGpsUpdate({ latitude: 0.002, longitude: 0, timestamp: 9000 });
    expect(tracker.isOffRoute).toBe(false);
    const recovered = tracker.getFrame(0.016, now + 16);
    expect(recovered.longitude).toBeCloseTo(0, 6);
  });

  it("re-snaps onto a replacement route without breaking animation", () => {
    const tracker = new VehicleTracker("v1", northRoute());
    tracker.ingestGpsUpdate({ latitude: 0.002, longitude: 0, timestamp: 1000 });
    runFrames(tracker, 1000);

    // Recalculated route: same corridor, shifted slightly east.
    const newRoute = northRoute().map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude + 0.0002,
    }));
    tracker.setRoute(newRoute);
    expect(tracker.routeLength).toBeGreaterThan(0);

    const frame = runFrames(tracker, 500);
    expect(frame.isOffRoute).toBe(false);
    expect(frame.longitude).toBeCloseTo(0.0002, 6);
    expect(frame.latitude).toBeCloseTo(0.002, 4);

    // Updates keep flowing on the new route.
    tracker.ingestGpsUpdate({
      latitude: 0.0024,
      longitude: 0.0002,
      timestamp: 4000,
    });
    const moved = runFrames(tracker, 2500);
    expect(moved.latitude).toBeGreaterThan(frame.latitude);
  });
});
