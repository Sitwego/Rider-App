// Unified Ride Event types covering the full ride lifecycle

// =====================
// Base Ride Event
// =====================

export interface RideEvent {
  event_id: string;
  timestamp: number;
  eventType:
    | "RideCancelEvent"
    | "DriverArrivedEvent"
    | "RideStartEvent"
    | "RideEndEvent";

  ride_id: string;
  driver_id: string;
  rider_id: string;
  priority: number;
  ack_required: boolean;
  eventPayload?: RideEventPayload;
}

// =====================
// Event Payload Union
// =====================

export type RideEventPayload =
  | { RideCancel: RideCancelPayload }
  | { DriverArrived: DriverArrivedPayload }
  | { RideStart: RideStartPayload }
  | { RideEnd: RideEndPayload };

// =====================
// Shared Models
// =====================

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  place_id: string;
}

export interface Rating {
  score: number;
  comment: string;
  tags: string[];
}

// =====================
// Driver Info
// =====================

export interface DriverInfo {
  driver_id: string;
  name: string;
  phone: string;
  photo_url: string;
  rating: number;
  license_plate: string;
}

// =====================
// Event Payloads
// =====================

// ---- Ride Cancel ----
export interface RideCancelPayload {
  reason: string;
  canceled_by: number;
  refund_amount: number;
  cancellation_fee: string;
  note: string;
}

// ---- Driver Arrived ----
// Wire format from the native bridge (flat — no nested wrapper key)
export interface DriverArrivedPayload {
  arrival_time: number; // Unix ms timestamp
  lat: number;
  lng: number;
}

// ---- Ride Start ----
export interface RideStartPayload {
  start_location: Location;
  destination: Location;
  estimated_fare: number;
  vehicle_type: string;
  vehicle_number: string;
  driver_info: DriverInfo | null;
  estimated_duration: number; // minutes
}

// ---- Ride End ----
export interface RideEndPayload {
  end_location: Location;
  distance_km: number;
  duration_seconds: number;
  final_fare: number;
  rider_rating: Rating;
  driver_rating: Rating;
}

// =====================
// Type Guards (Optional but Useful)
// =====================

export function isRideStartEvent(
  event: RideEvent,
): event is RideEvent & { event_payload: { RideStart: RideStartPayload } } {
  return event.eventType === "RideStartEvent";
}

export function isRideEndEvent(
  event: RideEvent,
): event is RideEvent & { event_payload: { RideEnd: RideEndPayload } } {
  return event.eventType === "RideEndEvent";
}

export interface RideReqEventPayload {
  arrivalTime: number;
  driverImg: string;
  driverName: string;
  driverRating: number;
  dx: number;
  lat: number;
  lng: number;
  rideId: string;
  riderId: string;
}

export interface RideReqEvent {
  eventId: string;
  eventPayload: RideReqEventPayload;
  rideRequestId: string;
  status: number;
  timestamp: number;
}
