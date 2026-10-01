import { describe, expect, it } from "@jest/globals";

import {
  buildTripShareMessage,
  formatCoordinates,
  mapsLink,
  type RideSnapshot,
} from "../safetyMessages";

const ride: RideSnapshot = {
  rideId: "r1",
  driverName: "Amina Otieno",
  plate: "KDA 123A",
  vehicleLine: "White Car",
  pickupName: "Lusigetti Rd",
  destinationName: "Kikuyu Town",
  carLocation: { lat: -1.2813, lng: 36.6549 },
};

describe("safety messages", () => {
  it("formats coordinates and a maps link", () => {
    expect(formatCoordinates({ lat: -1.281343, lng: 36.65491 })).toBe(
      "-1.28134, 36.65491",
    );
    expect(mapsLink({ lat: -1.2813435, lng: 36.6549102 })).toBe(
      "https://maps.google.com/?q=-1.281343,36.654910",
    );
  });

  it("shares driver, car, route and the rider's location", () => {
    expect(buildTripShareMessage(ride, { lat: -1.3, lng: 36.7 })).toBe(
      [
        "I'm on a Sitwego ride.",
        "Driver: Amina Otieno",
        "Car: White Car · KDA 123A",
        "Trip: Lusigetti Rd → Kikuyu Town",
        "Current location: https://maps.google.com/?q=-1.300000,36.700000",
      ].join("\n"),
    );
  });

  it("falls back to the car's location and skips unknown parts", () => {
    const message = buildTripShareMessage(
      { ...ride, vehicleLine: "", pickupName: null },
      null,
    );
    expect(message).toContain("Car: KDA 123A");
    expect(message).toContain("Trip: Kikuyu Town");
    expect(message).toContain("q=-1.281300,36.654900");
  });

  it("omits the location line when nothing is known", () => {
    const message = buildTripShareMessage(
      { ...ride, carLocation: null, pickupName: null, destinationName: null },
      null,
    );
    expect(message).not.toContain("Current location");
    expect(message).not.toContain("Trip:");
  });
});
