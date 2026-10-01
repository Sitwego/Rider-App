// Pure text builders for the safety sheet (unit-tested in Node).

export type LatLng = { lat: number; lng: number };

export type RideSnapshot = {
  rideId: string;
  driverName: string;
  plate: string;
  /** e.g. "White Car"; empty when unknown. */
  vehicleLine: string;
  pickupName: string | null;
  destinationName: string | null;
  /** Driver's last fix — the rider's location once on trip. */
  carLocation: LatLng | null;
};

export function formatCoordinates({ lat, lng }: LatLng): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function mapsLink({ lat, lng }: LatLng): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Message for "Share trip status" (sent through the system share sheet). */
export function buildTripShareMessage(
  ride: RideSnapshot,
  location: LatLng | null,
): string {
  const car = [ride.vehicleLine, ride.plate].filter(Boolean).join(" · ");
  const route =
    ride.pickupName && ride.destinationName
      ? `${ride.pickupName} → ${ride.destinationName}`
      : (ride.destinationName ?? ride.pickupName);
  const where = location ?? ride.carLocation;
  return [
    "I'm on a Sitwego ride.",
    `Driver: ${ride.driverName}`,
    `Car: ${car}`,
    route ? `Trip: ${route}` : null,
    where ? `Current location: ${mapsLink(where)}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
