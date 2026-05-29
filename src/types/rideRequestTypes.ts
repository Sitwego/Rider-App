import { Point } from "./geoTypes";
import { LocationInfo } from "./loactionAddress";
import { RideRequestStatus } from "./rideRequestStatus";

export type RidePolylineGeoData = {
  from_to: Point[];
  driver_to_pickup_polyline?: Point[];
};

export type RideRequestData = {
  color?: string;
  created_at?: string;
  customer_id?: string;
  driver_id?: string;
  email?: string;
  estimated_distance?: number;
  estimated_distance_to_pickup?: number;
  estimated_duration?: number;
  estimated_duration_to_pickup?: number;
  face_image_id?: string | null;
  fare?: number;
  first_name?: string;
  id?: string;
  otp?: string;
  is_new?: boolean;
  last_name?: string;
  message?: string;
  phone?: string;
  plate_number?: string;
  rating?: number;
  request_status?: RideRequestStatus;
  search_request_valid_till?: string;
  start_time?: string;
  total_ratings?: number;
  vehicle_type?: string;
  verified?: boolean;
  from?: LocationInfo;
  to?: LocationInfo;
  ride_polyline?: RidePolylineGeoData;
  [key: string]: any;
};

export type ActiveRideState = {
  /**
   * is search ride button pressed
   */
  isRideSearchButtonPressed?: boolean;
  /**
   * Ride object
   */
  rideData?: RideRequestData;
  /**
   * Status of the ride i.e pending or progress
   */
  ride_status: RideRequestStatus | null;

  /**
   * ride_id and driver_id tuple to identify the ride
   * Used to poll for ride status updates
   */
  ride_status_update_keys?: string[] /* [driver_id, ride_id] */;

  should_persist?: boolean;
};
