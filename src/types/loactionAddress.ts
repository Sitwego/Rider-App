export interface LocationData {
  address: string;
  city: string;
  country: string; // ISO 3166-1 alpha-2 country code like "KE"
  lat: number;
  lng: number;
  name: string;
  state?: string;
  street?: string;
  street2?: string;
  zipCode?: string;
  place_id?: string;
}

export interface LocationInfo {
  area: string | null;
  area_code: string | null;
  building: string | null;
  city: string | null;
  country: string | null;
  created_at: string | null; // ISO timestamp or empty string
  door: string | null;
  extras: string | null;
  floor: string | null;
  id: string | null;
  instructions: string | null;
  lat: number;
  lon: number;
  place_id: string | null;
  road: string | null;
  state: string | null;
  street: string | null;
  updated_at: string | null; // ISO timestamp or empty string
  ward: string | null;
}
