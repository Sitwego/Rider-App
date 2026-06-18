// End-to-end simulation over the REAL demo route: a GpsSimulator drives
// a virtual vehicle along ~1.6 km of actual road geometry, feeding noisy
// 2 s fixes into a VehicleTracker pumped at 60 fps — the same wiring the
// TrackingDemo screen uses on-device, here under a deterministic clock.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { prepareRoute } from "../RouteProgressCalculator";
import { RouteSnapper } from "../RouteSnapper";
import { VehicleTracker } from "../VehicleTracker";
import { computeDistanceBetween } from "../geo";
import { GpsSimulator } from "../testing/GpsSimulator";
import { mockRoute } from "../testing/mockRoute";

/** Deterministic random source (mulberry32) so noise is reproducible. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let now = 0;

beforeEach(() => {
  now = 0;
  jest.spyOn(globalThis.performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("simulated drive along the real demo route", () => {
  it("tracks the full route smoothly, on-road, at 60 fps", () => {
    const route = prepareRoute(mockRoute);
    const snapper = new RouteSnapper(route);
    const tracker = new VehicleTracker("sim", mockRoute);
    const simulator = new GpsSimulator(mockRoute, {
      speedMps: 14,
      intervalMs: 2000,
      noiseMeters: 4,
      random: seededRandom(42),
    });

    // First fix at the route start.
    tracker.ingestGpsUpdate({
      latitude: mockRoute[0].latitude,
      longitude: mockRoute[0].longitude,
      timestamp: now,
    });

    let previous = tracker.getFrame(0.016, now);
    let maxFrameJumpMeters = 0;
    let maxOffRoadMeters = 0;

    // Drive until the simulator reaches the route end (~115 s of travel).
    while (!simulator.isFinished) {
      const fix = simulator.tickOnce();
      if (fix) {
        tracker.ingestGpsUpdate({ ...fix, timestamp: now });
      }

      // 125 frames × 16 ms = 2 s of animation between fixes.
      for (let i = 0; i < 125; i++) {
        now += 16;
        const frame = tracker.getFrame(0.016, now);

        const jump = computeDistanceBetween(
          { latitude: previous.latitude, longitude: previous.longitude },
          { latitude: frame.latitude, longitude: frame.longitude },
        );
        maxFrameJumpMeters = Math.max(maxFrameJumpMeters, jump);

        // The rendered position must hug the road even though every
        // input fix carried up to ±4 m of lateral noise.
        const offRoad = snapper.snap({
          latitude: frame.latitude,
          longitude: frame.longitude,
        }).distanceFromRoute;
        maxOffRoadMeters = Math.max(maxOffRoadMeters, offRoad);

        expect(frame.isOffRoute).toBe(false);
        previous = frame;
      }
    }

    // Give the tracker time to glide to the final fix.
    const finalFix = simulator.tickOnce();
    if (finalFix) tracker.ingestGpsUpdate({ ...finalFix, timestamp: now });
    for (let i = 0; i < 250; i++) {
      now += 16;
      previous = tracker.getFrame(0.016, now);
    }

    // Smooth: at 14 m/s a 16 ms frame is ~0.22 m; corrections may add a
    // little, but nothing close to a visible jump.
    expect(maxFrameJumpMeters).toBeLessThan(1.5);
    // On-road: rendered output never leaves the polyline.
    expect(maxOffRoadMeters).toBeLessThan(0.5);
    // Completed: displayed position reached the route end.
    expect(previous.progress).toBeGreaterThan(route.totalLength - 40);
  });

  it("predicts through signal loss and goes stale, then recovers", () => {
    const tracker = new VehicleTracker("sim", mockRoute);
    const simulator = new GpsSimulator(mockRoute, {
      speedMps: 14,
      intervalMs: 2000,
      noiseMeters: 0,
      random: seededRandom(7),
    });

    // Warm up with four clean fixes so speed is established.
    for (let i = 0; i < 4; i++) {
      const fix = simulator.tickOnce();
      if (fix) tracker.ingestGpsUpdate({ ...fix, timestamp: now });
      for (let f = 0; f < 125; f++) {
        now += 16;
        tracker.getFrame(0.016, now);
      }
    }

    // Signal drops: vehicle keeps driving, no fixes arrive.
    simulator.setSignalLost(true);
    let frame = tracker.getFrame(0.016, now);
    const atSignalLoss = frame.progress;

    for (let f = 0; f < 250; f++) {
      now += 16;
      simulator.tickOnce(16);
      frame = tracker.getFrame(0.016, now);
    }
    // 4 s in: prediction is carrying the marker forward.
    expect(frame.isPredicting).toBe(true);
    expect(frame.progress).toBeGreaterThan(atSignalLoss + 10);

    for (let f = 0; f < 500; f++) {
      now += 16;
      simulator.tickOnce(16);
      frame = tracker.getFrame(0.016, now);
    }
    // 12 s in: past the 10 s timeout — frozen and flagged stale.
    expect(frame.isStale).toBe(true);

    // Signal restored.
    simulator.setSignalLost(false);
    const fix = simulator.tickOnce();
    if (fix) tracker.ingestGpsUpdate({ ...fix, timestamp: now });
    for (let f = 0; f < 125; f++) {
      now += 16;
      frame = tracker.getFrame(0.016, now);
    }
    expect(frame.isStale).toBe(false);
    expect(frame.progress).toBeGreaterThan(atSignalLoss);
  });
});
