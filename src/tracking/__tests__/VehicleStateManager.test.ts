import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { VehicleStateManager } from "../VehicleStateManager";

import type { LatLng } from "../geo";

function route(): LatLng[] {
  return [
    { latitude: 0, longitude: 0 },
    { latitude: 0.01, longitude: 0 },
  ];
}

let now = 0;

beforeEach(() => {
  now = 0;
  jest.spyOn(globalThis.performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("VehicleStateManager", () => {
  it("creates trackers on ensure() and keeps them independent", () => {
    const manager = new VehicleStateManager();
    const a = manager.ensure("a", route());
    const b = manager.ensure("b", route());
    expect(a).not.toBe(b);
    expect(manager.size).toBe(2);
    expect(manager.ensure("a", route())).toBe(a); // idempotent
  });

  it("drops GPS updates for unknown vehicles", () => {
    const manager = new VehicleStateManager();
    expect(manager.ingest("ghost", { latitude: 0, longitude: 0 })).toBe(false);

    manager.ensure("v1", route());
    expect(manager.ingest("v1", { latitude: 0, longitude: 0 })).toBe(true);
  });

  it("replaces the route only when asked", () => {
    const manager = new VehicleStateManager();
    const tracker = manager.ensure("v1", route());
    const longRoute: LatLng[] = [
      { latitude: 0, longitude: 0 },
      { latitude: 0.02, longitude: 0 },
    ];
    manager.ensure("v1", longRoute); // no replaceRoute flag → unchanged
    const originalLength = tracker.routeLength;
    manager.ensure("v1", longRoute, { replaceRoute: true });
    expect(tracker.routeLength).toBeGreaterThan(originalLength);
  });

  it("supports safe removal during iteration", () => {
    const manager = new VehicleStateManager();
    manager.ensure("a", route());
    manager.ensure("b", route());

    const visited: string[] = [];
    manager.forEach((tracker) => {
      visited.push(tracker.vehicleId);
      manager.remove("b");
    });
    expect(visited).toEqual(["a", "b"]);
    expect(manager.size).toBe(1);
  });

  it("evicts vehicles after the inactivity window", () => {
    const manager = new VehicleStateManager();
    manager.ensure("fresh", route());
    manager.ensure("stale", route());

    now = 10_000;
    manager.ingest("fresh", { latitude: 0.001, longitude: 0, timestamp: 1 });

    const evicted = manager.evictInactive(5_000, now);
    expect(evicted).toEqual(["stale"]);
    expect(manager.has("fresh")).toBe(true);
    expect(manager.has("stale")).toBe(false);
  });
});
