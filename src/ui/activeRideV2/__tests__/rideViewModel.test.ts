import { describe, expect, it } from "@jest/globals";

import {
  decodeLineStr,
  deriveRideDetails,
  formatRideHeadline,
  formatStatusMessage,
  headlineEtaSeconds,
  selectRoutePolyline,
  toRidePhase,
} from "../rideViewModel";

import type { RideRequestStatus } from "../../../types/rideRequestStatus";
import type { RideRequestData } from "../../../types/rideRequestTypes";

describe("toRidePhase", () => {
  const cases: [RideRequestStatus | null, boolean, string | null][] = [
    ["Accepted", false, "assigned"],
    ["Accepted", true, "arriving"],
    ["Arrived", false, "arrived"],
    ["Waitingforrider", true, "arrived"],
    ["Inprogress", true, "on_trip"],
    ["New", true, null],
    ["Completed", true, null],
    ["Canceled", true, null],
    ["Expired", false, null],
    ["Failed", false, null],
    [null, false, null],
  ];
  it.each(cases)("%s (fix: %s) → %s", (status, hasFix, expected) => {
    expect(toRidePhase(status, hasFix)).toBe(expected);
  });
});

describe("formatRideHeadline", () => {
  it("counts down to pickup in whole minutes", () => {
    expect(formatRideHeadline("arriving", 300, null)).toBe(
      "Driver arriving in 5 min",
    );
    expect(formatRideHeadline("arriving", 89, null)).toBe(
      "Driver arriving in 1 min",
    );
    expect(formatRideHeadline("assigned", 151, null)).toBe(
      "Driver arriving in 2 min",
    );
    expect(formatRideHeadline("arriving", 299, null)).toBe(
      "Driver arriving in 4 min",
    );
  });

  it("says arriving now under 30 s, including 0", () => {
    expect(formatRideHeadline("arriving", 0, null)).toBe("Driver arriving now");
    expect(formatRideHeadline("arriving", 29, null)).toBe(
      "Driver arriving now",
    );
    expect(formatRideHeadline("arriving", 30, null)).toBe(
      "Driver arriving in 1 min",
    );
  });

  it("falls back without an ETA", () => {
    expect(formatRideHeadline("assigned", null, null)).toBe(
      "Your driver is on the way",
    );
    expect(formatRideHeadline("arriving", Number.NaN, null)).toBe(
      "Your driver is on the way",
    );
  });

  it("covers arrived and on-trip", () => {
    expect(formatRideHeadline("arrived", 120, "X")).toBe(
      "Your driver has arrived",
    );
    expect(formatRideHeadline("on_trip", 600, "Ngong Rd")).toBe(
      "On the way to Ngong Rd",
    );
    expect(formatRideHeadline("on_trip", 600, null)).toBe("On your way");
  });
});

describe("formatStatusMessage", () => {
  it("keeps the old sheet's pickup copy", () => {
    expect(formatStatusMessage("arriving", "4 mins")).toBe(
      "Your ride is 4 mins away",
    );
  });
});

describe("decodeLineStr / selectRoutePolyline", () => {
  const p1 = [
    [36.8, -1.28],
    [36.81, -1.29],
  ];
  const pickupLeg = [{ latitude: -1.27, longitude: 36.79 }];

  it("decodes [lng, lat] tuples and skips junk", () => {
    expect(decodeLineStr([...p1, ["x", 1], [1]])).toEqual([
      { latitude: -1.28, longitude: 36.8 },
      { latitude: -1.29, longitude: 36.81 },
    ]);
    expect(decodeLineStr(undefined)).toEqual([]);
  });

  it("uses the pickup leg before the trip and p1 during it", () => {
    const ride: RideRequestData = {
      p1,
      ride_polyline: { from_to: [], driver_to_pickup_polyline: pickupLeg },
    };
    expect(selectRoutePolyline("Accepted", ride)).toBe(pickupLeg);
    expect(selectRoutePolyline("Arrived", ride)).toBe(pickupLeg);
    expect(selectRoutePolyline("Inprogress", ride)).toHaveLength(2);
  });

  it("falls back to p1 when there is no pickup leg", () => {
    expect(selectRoutePolyline("Accepted", { p1 })).toHaveLength(2);
    expect(selectRoutePolyline("Accepted", undefined)).toEqual([]);
  });
});

describe("deriveRideDetails", () => {
  it("fills safe fallbacks for a sparse payload", () => {
    const d = deriveRideDetails({});
    expect(d.driverName).toBe("Your driver");
    expect(d.ratingLabel).toBe("0.0");
    expect(d.plate).toBe("N/A");
    expect(d.fare).toBe("0");
    expect(d.distanceLabel).toBe("—");
    expect(d.otp).toBeNull();
    expect(d.destination).toBeNull();
    expect(d.arrivalTime).toBeNull();
  });

  it("maps a full payload", () => {
    const d = deriveRideDetails({
      first_name: " Jane ",
      last_name: "Doe",
      rating: 4.86,
      plate_number: "KDA 123A",
      vehicle_type: "Bike",
      fare: 344,
      estimated_distance: 3.456,
      estimated_duration_to_pickup: 240,
      otp: "4821",
      actual_arrival_time: 1_700_000_000_000,
      to: {
        street: "Ngong Rd",
        road: null,
        area: null,
        city: "Nairobi",
        lat: -1.3,
        lon: 36.78,
      } as RideRequestData["to"],
    });
    expect(d.driverName).toBe("Jane Doe");
    expect(d.ratingLabel).toBe("4.9");
    expect(d.fare).toBe("340");
    expect(d.distanceLabel).toBe("3.5 Km");
    expect(d.pickupEta).toBe("4 mins");
    expect(d.destinationName).toBe("Ngong Rd");
    expect(d.destination).toEqual({ lat: -1.3, lng: 36.78 });
    expect(d.arrivalTime).toBe(1_700_000_000_000);
  });
});

describe("headlineEtaSeconds", () => {
  const ride: RideRequestData = {
    estimated_duration: 900,
    estimated_duration_to_pickup: 180,
  };
  it("picks the pickup ETA before the trip and the trip ETA during it", () => {
    expect(headlineEtaSeconds("arriving", ride)).toBe(180);
    expect(headlineEtaSeconds("on_trip", ride)).toBe(900);
    expect(headlineEtaSeconds("arrived", ride)).toBeNull();
  });
});
