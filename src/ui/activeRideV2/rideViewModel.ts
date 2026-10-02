// Pure view-model logic for the v2 active-ride screen. Relative imports only
// and no react-native/expo runtime imports, so it unit-tests in plain Node.

import { formatPrice } from "../../utils/math/numbers";
import { autoFormatDuration } from "../../utils/math/times";

import type { Point } from "../../types/geoTypes";
import type { LocationInfo } from "../../types/loactionAddress";
import type { RideRequestStatus } from "../../types/rideRequestStatus";
import type { RideRequestData } from "../../types/rideRequestTypes";

/** Ride phases rendered by the v2 layout. Anything else keeps the old UI. */
export type RidePhase = "assigned" | "arriving" | "arrived" | "on_trip";

export function toRidePhase(
  status: RideRequestStatus | null | undefined,
  hasDriverLocation: boolean,
): RidePhase | null {
  switch (status) {
    case "Accepted":
      return hasDriverLocation ? "arriving" : "assigned";
    case "Arrived":
    case "Waitingforrider":
      return "arrived";
    case "Inprogress":
      return "on_trip";
    default:
      return null;
  }
}

/** Seconds that still count as "arriving now" rather than "in 1 min". */
const ARRIVING_NOW_SECONDS = 30;

export function formatRideHeadline(
  phase: RidePhase,
  etaSeconds: number | null,
  destination: string | null,
): string {
  switch (phase) {
    case "assigned":
    case "arriving": {
      if (etaSeconds == null || !Number.isFinite(etaSeconds)) {
        return "Your driver is on the way";
      }
      if (etaSeconds < ARRIVING_NOW_SECONDS) return "Driver arriving now";
      // Floor, like autoFormatDuration, so it agrees with the status line.
      const minutes = Math.max(1, Math.floor(etaSeconds / 60));
      return `Driver arriving in ${minutes} min`;
    }
    case "arrived":
      return "Your driver has arrived";
    case "on_trip":
      return destination ? `On the way to ${destination}` : "On your way";
  }
}

/** Small label above the headline. */
export function formatRideLabel(phase: RidePhase): string {
  switch (phase) {
    case "assigned":
    case "arriving":
      return "Driver is on the way";
    case "arrived":
      return "Meet your driver at pickup";
    case "on_trip":
      return "Trip in progress";
  }
}

/** The status copy the old ride sheet showed, kept as the secondary line. */
export function formatStatusMessage(
  phase: RidePhase,
  pickupEta: string,
): string {
  switch (phase) {
    case "assigned":
    case "arriving":
      return `Your ride is ${pickupEta} away`;
    case "arrived":
      return "Your driver arrived at the pickup location. Please be there within 5 minutes";
    case "on_trip":
      return "Thank you, enjoy the ride to your destination 🎉";
  }
}

/** `[lng, lat]` tuples (p1/p2 wire format) → map points. */
export function decodeLineStr(data: unknown): Point[] {
  if (!Array.isArray(data)) return [];
  const points: Point[] = [];
  for (const pair of data) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [longitude, latitude] = pair;
    if (typeof latitude === "number" && typeof longitude === "number") {
      points.push({ latitude, longitude });
    }
  }
  return points;
}

/**
 * Route shown on the map: the driver→pickup leg before the trip, the
 * pickup→destination route (p1) once in progress. Same rules as the old
 * `RideMapView`.
 */
export function selectRoutePolyline(
  status: RideRequestStatus | null | undefined,
  rideData: RideRequestData | undefined,
): Point[] {
  if (!rideData) return [];
  if (status !== "Inprogress") {
    const pickupLeg = rideData.ride_polyline?.driver_to_pickup_polyline;
    if (Array.isArray(pickupLeg) && pickupLeg.length > 0) return pickupLeg;
  }
  return decodeLineStr(rideData.p1);
}

export function placeName(place: LocationInfo | undefined): string | null {
  if (!place) return null;
  return place.street || place.road || place.area || place.city || null;
}

export type RideDetails = {
  driverId: string | null;
  faceImageId: string | null;
  driverName: string;
  ratingLabel: string;
  plate: string;
  vehicleType: string | null;
  vehicleColor: string | null;
  /** What the rider pays — net of any promotion. */
  fare: string;
  /** Undiscounted fare; set only when a promotion applies. */
  fullFare: string | null;
  /** Amount the promotion takes off; set only when a promotion applies. */
  discount: string | null;
  tripDuration: string;
  pickupEta: string;
  distanceLabel: string;
  distanceKm: number | null;
  otp: string | null;
  phone: string | null;
  from: LocationInfo | undefined;
  to: LocationInfo | undefined;
  destinationName: string | null;
  destination: { lat: number; lng: number } | null;
  arrivalTime: number | null;
  frozenWaitElapsed: number | undefined;
};

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function deriveRideDetails(rideData: RideRequestData): RideDetails {
  const name = [rideData.first_name, rideData.last_name]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .map((part) => part.trim())
    .join(" ");
  const distanceKm =
    typeof rideData.estimated_distance === "number" &&
    Number.isFinite(rideData.estimated_distance)
      ? rideData.estimated_distance
      : null;
  const to = rideData.to;
  const arrival = rideData.actual_arrival_time;
  return {
    driverId: rideData.driver_id ?? null,
    faceImageId: rideData.face_image_id ?? null,
    driverName: name || "Your driver",
    ratingLabel: finiteOr(rideData.rating, 0).toFixed(1),
    plate: rideData.plate_number || "N/A",
    vehicleType: rideData.vehicle_type ?? null,
    vehicleColor: rideData.color ?? null,
    ...deriveFare(rideData),
    tripDuration: autoFormatDuration(finiteOr(rideData.estimated_duration, 0)),
    pickupEta: autoFormatDuration(
      finiteOr(rideData.estimated_duration_to_pickup, 0),
    ),
    distanceLabel: distanceKm != null ? `${distanceKm.toFixed(1)} Km` : "—",
    distanceKm,
    otp: rideData.otp || null,
    phone: rideData.phone || null,
    from: rideData.from,
    to,
    destinationName: placeName(to),
    destination:
      to && Number.isFinite(to.lat) && Number.isFinite(to.lon)
        ? { lat: to.lat, lng: to.lon }
        : null,
    arrivalTime: typeof arrival === "number" ? arrival : null,
    frozenWaitElapsed:
      typeof rideData.frozen_wait_elapsed === "number"
        ? rideData.frozen_wait_elapsed
        : undefined,
  };
}

// TODO: use formatWholeKes from utils/math/numbers once the promo work lands.
const wholeKes = (value: number): string =>
  Math.round(value).toLocaleString("en-KE");

const nonNegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * The fare as the rider sees it. `rideData.fare` stays the FULL fare — the
 * driver app reads the same field and a promotion must never reduce what the
 * driver earns; when a discount was reserved the backend adds `promotion`
 * (AppliedPromotion), and its `discounted_fare` is what the rider pays.
 *
 * Same rule as normalizeRiderFareBreakdown: a discount is shown only when the
 * figures are valid and reconcile (discounted + discount = fare); otherwise
 * the full fare is shown as the app always has. Discounted figures are exact
 * shillings so the lines add up on screen — formatPrice rounds to tens.
 */
export function deriveFare(
  rideData: RideRequestData,
): Pick<RideDetails, "fare" | "fullFare" | "discount"> {
  const fare = finiteOr(rideData.fare, 0);
  const promo: unknown = rideData.promotion;
  if (promo && typeof promo === "object") {
    const { discount_amount: discount, discounted_fare: youPay } =
      promo as Record<string, unknown>;
    if (
      nonNegative(discount) &&
      nonNegative(youPay) &&
      discount > 0 &&
      Math.abs(youPay + discount - fare) < 0.005
    ) {
      return {
        fare: wholeKes(youPay),
        fullFare: wholeKes(fare),
        discount: wholeKes(discount),
      };
    }
  }
  return { fare: formatPrice(fare), fullFare: null, discount: null };
}

/** ETA the headline counts down to: pickup before the trip, dropoff during it. */
export function headlineEtaSeconds(
  phase: RidePhase,
  rideData: RideRequestData,
): number | null {
  const value =
    phase === "on_trip"
      ? rideData.estimated_duration
      : phase === "arrived"
        ? null
        : rideData.estimated_duration_to_pickup;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
