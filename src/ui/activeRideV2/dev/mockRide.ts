// Dev-only mock ride: drives the real active-ride store (never persisted)
// through Accepted → Arrived → Inprogress → removed, with driver locations
// from the existing GpsSimulator, so the ride screens can be exercised
// without a backend or a driver app.

import { useCallback } from "react";

import {
  useActiveRide,
  useActiveRideState,
} from "~/providers/ActiveRideProvider";
import { GpsSimulator } from "~/tracking/testing/GpsSimulator";
import { mockRoute } from "~/tracking/testing/mockRoute";

import { isMockRideId, MOCK_RIDE_PREFIX } from "./mockRideId";

import type { Point } from "~/types/geoTypes";
import type { LocationInfo } from "~/types/loactionAddress";
import type { RideRequestData } from "~/types/rideRequestTypes";

const SPEED_MPS = 14;
const FIX_INTERVAL_MS = 2000;

const splitAt = Math.floor(mockRoute.length / 2);
const PICKUP_LEG: Point[] = mockRoute.slice(0, splitAt + 1);
const TRIP_LEG: Point[] = mockRoute.slice(splitAt);

const place = (p: Point, street: string): LocationInfo => ({
  area: null,
  area_code: null,
  building: null,
  city: "Nairobi",
  country: "KE",
  created_at: null,
  door: null,
  extras: null,
  floor: null,
  id: null,
  instructions: null,
  lat: p.latitude,
  lon: p.longitude,
  place_id: null,
  road: null,
  state: null,
  street,
  updated_at: null,
  ward: null,
});

function fixtureRide(): RideRequestData {
  const pickup = TRIP_LEG[0];
  const dropoff = TRIP_LEG[TRIP_LEG.length - 1];
  return {
    id: `${MOCK_RIDE_PREFIX}${Date.now()}`,
    driver_id: "mock-driver",
    first_name: "Amina",
    last_name: "Otieno",
    rating: 4.8,
    phone: "+254700000000",
    plate_number: "KDA 123A",
    vehicle_type: "Car",
    color: "White",
    fare: 640,
    estimated_distance: 6.2,
    estimated_duration: 1260,
    estimated_duration_to_pickup: 300,
    otp: "4821",
    from: place(pickup, "Lusigetti Rd"),
    to: place(dropoff, "Kikuyu Town"),
    p1: TRIP_LEG.map((p) => [p.longitude, p.latitude]),
    ride_polyline: { from_to: [], driver_to_pickup_polyline: PICKUP_LEG },
  };
}

let simulator: GpsSimulator | null = null;

function stopSimulator() {
  simulator?.stop();
  simulator = null;
}

export function useMockRide() {
  const { setActiveRideState } = useActiveRide();
  const { rideData, ride_status } = useActiveRideState();
  const active = !!rideData?.id && isMockRideId(rideData.id);

  const drive = useCallback(
    (
      leg: Point[],
      etaField: "estimated_duration_to_pickup" | "estimated_duration",
    ) => {
      stopSimulator();
      const sim = new GpsSimulator(leg, {
        speedMps: SPEED_MPS,
        intervalMs: FIX_INTERVAL_MS,
      });
      simulator = sim;
      sim.start((fix) => {
        const remaining = Math.max(0, sim.routeLength - sim.currentProgress);
        setActiveRideState({
          type: "UPDATE-ACTIVE-RIDE",
          data: {
            rideData: {
              driver_location: {
                latitude: fix.latitude,
                longitude: fix.longitude,
              },
              [etaField]: Math.round(remaining / SPEED_MPS),
            },
            should_persist: false,
          },
        });
      });
    },
    [setActiveRideState],
  );

  /** `withPromo`: KES 100 off the KES 640 fare, as the backend sends it. */
  const start = useCallback(
    (withPromo = false) => {
      setActiveRideState({
        type: "SET-ACTIVE-RIDE",
        data: {
          rideData: withPromo
            ? {
                ...fixtureRide(),
                promotion: {
                  promotion_id: "mock-promo",
                  discount_amount: 100,
                  discounted_fare: 540,
                },
              }
            : fixtureRide(),
          ride_status: "Accepted",
          should_persist: false,
        },
      });
      drive(PICKUP_LEG, "estimated_duration_to_pickup");
    },
    [drive, setActiveRideState],
  );

  const end = useCallback(() => {
    stopSimulator();
    setActiveRideState({ type: "REMOVE-RIDE" });
  }, [setActiveRideState]);

  /** Accepted → Arrived → Inprogress → ended. */
  const advance = useCallback(() => {
    if (ride_status === "Accepted") {
      stopSimulator();
      setActiveRideState({
        type: "UPDATE-ACTIVE-RIDE",
        data: {
          ride_status: "Arrived",
          rideData: { actual_arrival_time: Date.now() },
          should_persist: false,
        },
      });
    } else if (ride_status === "Arrived") {
      setActiveRideState({
        type: "UPDATE-ACTIVE-RIDE",
        data: {
          ride_status: "Inprogress",
          rideData: { ride_start_time: Date.now() },
          should_persist: false,
        },
      });
      drive(TRIP_LEG, "estimated_duration");
    } else {
      end();
    }
  }, [drive, end, ride_status, setActiveRideState]);

  const nextStep =
    ride_status === "Accepted"
      ? "Driver arrives"
      : ride_status === "Arrived"
        ? "Start trip"
        : "End ride";

  return { active, start, advance, end, nextStep };
}
