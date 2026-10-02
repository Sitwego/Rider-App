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

export type GeocodedParts = {
  name?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  district?: string | null;
  subregion?: string | null;
  city?: string | null;
};

// Open Location Code ("PMJH+4GM"): what Android's geocoder returns as the
// place name where there is no street. Meaningless to a dispatcher.
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,3}$/i;

/**
 * A spoken-friendly address for a dispatcher: street (or a named place),
 * then the area. Without a street it becomes "Near <area>"; Plus Codes are
 * dropped.
 */
export function formatGeocodedAddress(parts: GeocodedParts): string | null {
  const clean = (v: string | null | undefined) => {
    const t = v?.trim();
    return t && !PLUS_CODE.test(t) ? t : null;
  };
  const street = clean(parts.street);
  const primary = street
    ? [clean(parts.streetNumber), street].filter(Boolean).join(" ")
    : clean(parts.name);
  const area = clean(parts.district) ?? clean(parts.subregion);
  const city = clean(parts.city);
  const tail = [area, city].filter(
    (v, i, all): v is string => !!v && all.indexOf(v) === i && v !== primary,
  );
  if (primary) return [primary, ...tail].join(", ");
  return tail.length > 0 ? `Near ${tail.join(", ")}` : null;
}
