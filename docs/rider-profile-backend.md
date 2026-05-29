# Rider Profile — Backend API Specification Prompt

Use the prompt below when asking an AI (or your backend developer) to implement
the server-side endpoints required by `RiderProfileScreen.tsx`,
`EditProfileScreen.tsx`, and `UserAddressScreen.tsx`.

---

## Prompt

I am building a **React Native ride-hailing app** (customer side).
The frontend uses:

- **Axios** via a shared `useApiClient` hook — every request goes to `BASE_URL`
  with a `Bearer <token>` Authorization header.
- **`@tanstack/react-query`** (`useQuery` / `useMutation`) for data fetching.
- **`@react-native-firebase/auth`** for authentication — the token in the
  Authorization header is the Firebase ID token.
- The existing account model (from registration) already stores:
  `first_name`, `last_name`, `email`, `phone_number`, `mobile_country_code`,
  `gender`, and a `profile_id`.

I need you to design and implement the following **REST API endpoints**.
Return each endpoint with: HTTP method, URL path, request body/params,
success response shape, and error responses.

---

### 1. Get Rider Profile

Fetch the full profile of the currently authenticated rider.

```
GET /customer/profile
Authorization: Bearer <firebase_id_token>
```

**Expected response:**
```json
{
  "id": "string",
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "email_verified": true,
  "phone_number": "string",
  "mobile_country_code": "string",
  "age": 28,
  "avatar_url": "string | null",
  "rating": 4.9,
  "review_count": 120,
  "google_linked": false,
  "address": {
    "street": "string | null",
    "city": "string | null",
    "state": "string | null",
    "zip": "string | null"
  }
}
```

---

### 2. Update Rider Profile

Update editable personal info (from `EditProfileScreen`).

```
PATCH /customer/profile
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

**Request body** (all fields optional — only send what changed):
```json
{
  "first_name": "string",
  "last_name": "string",
  "age": 28
}
```

**Expected response:**
```json
{
  "id": "string",
  "first_name": "string",
  "last_name": "string",
  "age": 28
}
```

**Errors:**
- `400` — validation failed (e.g. age out of range)
- `401` — invalid or expired token

---

### 3. Update Avatar

Upload a new profile photo.

```
POST /customer/profile/avatar
Authorization: Bearer <firebase_id_token>
Content-Type: multipart/form-data
```

**Request body:**
```
file: <image file>   (jpeg/png, max 5 MB)
```

**Expected response:**
```json
{
  "avatar_url": "https://cdn.example.com/avatars/<id>.jpg"
}
```

**Errors:**
- `413` — file too large
- `415` — unsupported media type

---

### 4. Save / Update Home Address

Create or replace the rider's home address (from `UserAddressScreen`).

```
PUT /customer/profile/address
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

**Request body:**
```json
{
  "street": "123 Main Street",
  "city": "Nairobi",
  "state": "NBO",
  "zip": "00100"
}
```

**Expected response:**
```json
{
  "street": "123 Main Street",
  "city": "Nairobi",
  "state": "NBO",
  "zip": "00100"
}
```

**Errors:**
- `400` — `street` or `city` missing (both are required)

---

### 5. Link Google Account

Link a Google OAuth credential to the rider's existing account.
The frontend will obtain a `google_id_token` via
`@react-native-google-signin/google-signin` and send it here.

```
POST /customer/profile/link-google
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

**Request body:**
```json
{
  "google_id_token": "string"
}
```

**Expected response:**
```json
{
  "google_linked": true,
  "google_email": "user@gmail.com"
}
```

**Errors:**
- `409` — Google account already linked to another rider
- `400` — invalid or expired Google token

---

### 6. Unlink Google Account

```
DELETE /customer/profile/link-google
Authorization: Bearer <firebase_id_token>
```

**Expected response:**
```json
{
  "google_linked": false
}
```

**Errors:**
- `400` — cannot unlink if Google is the only sign-in method

---

### 7. Logout (Invalidate Token)

Server-side token invalidation / push-token cleanup.

```
POST /customer/auth/logout
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

**Request body:**
```json
{
  "device_id": "string"
}
```

**Expected response:**
```json
{
  "success": true
}
```

---

### 8. Delete Account

Permanently delete the rider's account and all associated data.

```
DELETE /customer/profile
Authorization: Bearer <firebase_id_token>
```

**Expected response:**
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

**Errors:**
- `400` — rider has an active ride in progress (cannot delete)
- `401` — invalid token

---

## Frontend Integration Notes

| Hook file to create              | Endpoint used                        |
|----------------------------------|--------------------------------------|
| `hooks/useRiderProfile.ts`       | `GET /customer/profile`              |
| `hooks/useUpdateProfile.ts`      | `PATCH /customer/profile`            |
| `hooks/useUpdateAvatar.ts`       | `POST /customer/profile/avatar`      |
| `hooks/useUpdateAddress.ts`      | `PUT /customer/profile/address`      |
| `hooks/useLinkGoogle.ts`         | `POST/DELETE /customer/profile/link-google` |
| `providers/AuthProvider.tsx`     | `POST /customer/auth/logout`         |
| `providers/AuthProvider.tsx`     | `DELETE /customer/profile`           |

All hooks must use:
- `useApiClient()` from `~/hooks/useApiClient` for the Axios wrapper
- `useMutation` (writes) or `useQuery` (reads) from `@tanstack/react-query`
- The `AuthProvider` `dispatch` with `UPDATE_USER` action after successful
  profile/address mutations to keep local state in sync

---

## Data Model (for backend DB schema reference)

```ts
type RiderProfile = {
  id: string;                  // Firebase UID
  first_name: string;
  last_name: string;
  email: string;
  email_verified: boolean;
  phone_number: string;
  mobile_country_code: string;
  age: number | null;
  avatar_url: string | null;
  rating: number;              // average, updated after each ride
  review_count: number;
  google_linked: boolean;
  google_email: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
  created_at: string;          // ISO 8601
  updated_at: string;
};
```
