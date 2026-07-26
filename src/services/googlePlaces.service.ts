import { PlaceType } from "../../lib/placesTypes";
import { getAddressComponents } from "../../lib/placesUtils";

/**
 * Thin client for the Google **Places API (New)** — autocomplete + place
 * details. Ported from `@appandflow/react-native-google-autocomplete` but
 * retargeted from the deprecated legacy `maps.googleapis.com/maps/api/place`
 * endpoints onto `places.googleapis.com/v1`, which the rest of the app already
 * uses (see lib/placesApi + useGooglePlacesDetails). Kept framework-free so it
 * can back the headless `useGoogleAutocomplete` hook or be called directly.
 */

const BASE_URL = "https://places.googleapis.com/v1";

/** Field mask for the details call — everything {@link mapPlaceDetails} reads. */
const DETAILS_FIELD_MASK =
  "id,displayName,formattedAddress,location,addressComponents,types";

export interface AutocompletePrediction {
  placeId: string;
  /** Full prediction text, e.g. "Kwa Gado, Gikambura, Kenya". */
  description: string;
  /** Structured primary line, e.g. "Kwa Gado". */
  mainText: string;
  /** Structured secondary line, e.g. "Gikambura, Kenya". */
  secondaryText: string;
  types: string[];
  /** Straight-line metres from `origin`, when an origin was supplied. */
  distanceMeters?: number;
}

export interface AutocompleteOptions {
  /** Google Maps/Places API key. */
  key: string;
  /** BCP-47 language for results — default "en". */
  language?: string;
  /** ISO region codes to bias/restrict to, e.g. ["ke"]. */
  includedRegionCodes?: string[];
  /** Origin for straight-line `distanceMeters` on each prediction. */
  origin?: { lat: number; lng: number };
  /** Groups predictions from one user session for billing — pass a uuid. */
  sessionToken?: string;
  /** Extra headers (e.g. X-Android-Package / X-Android-Cert for key restriction). */
  headers?: Record<string, string>;
  /** Abort signal so an in-flight request can be cancelled by the caller. */
  signal?: AbortSignal;
}

/** Shape of a `placePrediction` entry in the New autocomplete response. */
interface RawPlacePrediction {
  placeId?: string;
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
  types?: string[];
  distanceMeters?: number;
}

interface RawAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

/** Shape of the New place-details response (subset we request via field mask). */
interface RawPlaceDetails {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: RawAddressComponent[];
  types?: string[];
}

function buildUrl(path: string, params: Record<string, string | undefined>) {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");
  return `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;
}

/**
 * Query autocomplete predictions for a search term. Returns a normalized,
 * flat prediction list (never throws on empty — returns []).
 */
export async function searchPlaces(
  input: string,
  opts: AutocompleteOptions,
): Promise<AutocompletePrediction[]> {
  const url = buildUrl("/places:autocomplete", { key: opts.key });

  const body: Record<string, unknown> = { input };
  if (opts.language) body.languageCode = opts.language;
  if (opts.includedRegionCodes?.length) {
    body.includedRegionCodes = opts.includedRegionCodes;
  }
  if (opts.origin) {
    body.origin = { latitude: opts.origin.lat, longitude: opts.origin.lng };
  }
  if (opts.sessionToken) body.sessionToken = opts.sessionToken;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.language ? { "Accept-Language": opts.language } : {}),
      ...opts.headers,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`Places autocomplete failed (${res.status})`);
  }

  const json: { suggestions?: { placePrediction?: RawPlacePrediction }[] } =
    await res.json();

  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is RawPlacePrediction => !!p?.placeId)
    .map((p) => ({
      placeId: p.placeId as string,
      description: p.text?.text ?? "",
      mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
      types: p.types ?? [],
      distanceMeters: p.distanceMeters,
    }));
}

/**
 * Fetch full details for a place id and adapt them into the app's
 * {@link PlaceType}. Returns null when the place can't be resolved.
 */
export async function getPlaceDetails(
  placeId: string,
  opts: Pick<AutocompleteOptions, "key" | "language" | "headers" | "signal">,
): Promise<PlaceType | null> {
  const url = buildUrl(`/places/${encodeURIComponent(placeId)}`, {
    key: opts.key,
    languageCode: opts.language,
  });

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      ...opts.headers,
    },
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`Place details failed (${res.status})`);
  }

  const place: RawPlaceDetails = await res.json();
  if (!place.id) return null;
  return mapPlaceDetails(place);
}

/** Adapt a New-API place-details object into the app's {@link PlaceType}. */
function mapPlaceDetails(place: RawPlaceDetails): PlaceType {
  // Reuse the shared legacy-shape extractor by translating New API components.
  const legacyComponents = (place.addressComponents ?? []).map((c) => ({
    long_name: c.longText ?? "",
    short_name: c.shortText ?? "",
    types: c.types ?? [],
  }));

  const {
    street_number: streetNumber,
    route,
    subpremise,
    locality,
    sublocality,
    postal_town: postalTown,
    postal_code: zipCode,
    administrative_area_level_1: state,
    country,
  } = getAddressComponents(legacyComponents, {
    street_number: "long_name",
    route: "long_name",
    subpremise: "long_name",
    locality: "long_name",
    sublocality: "long_name",
    postal_town: "long_name",
    postal_code: "long_name",
    administrative_area_level_1: "short_name",
    country: "short_name",
  });

  const street = `${streetNumber} ${route}`.trim();

  return {
    place_id: place.id,
    id: place.id,
    name: place.displayName?.text ?? "",
    address: place.formattedAddress ?? "",
    lat: place.location?.latitude ?? 0,
    lng: place.location?.longitude ?? 0,
    street: street || undefined,
    street2: subpremise || undefined,
    city: locality || postalTown || sublocality || undefined,
    state: state || undefined,
    country: country || undefined,
    zipCode: zipCode || undefined,
  };
}
