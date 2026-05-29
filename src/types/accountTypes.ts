export type CreateAccountType = {
  contact_data: {
    email: string;
    phone_number: string;
  };
  first_name: string;
  last_name: string;
  gender: string;
  password: string;
  mobile_country_code: string;
};

export type RiderProfileResponse = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  email_verified: boolean;
  phone_number: string;
  mobile_country_code: string;
  age: number | null;
  avatar_url: string | null;
  rating: number;
  total_rating_score: number;
  review_count: number;
  google_linked: boolean;
  google_email: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
  created_at: string;
  updated_at: string;
};

export type UpdateProfilePayload = {
  first_name?: string;
  last_name?: string;
  dob?: string | null;
};

export type UserState = {
  token?: string;
  // an object representing the user
  user?: {
    id: string;
    email: string;
    phone_number: string;
    name: string;
    [key: string]: any;
  };
  // any other user fields
  [key: string]: any;
};
