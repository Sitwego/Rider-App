# Spec — Emergency → backend → admin dashboard

**Status:** spec, not scheduled · **Repos:**
- rider app (`mobility-customer`);
- Rust API (`~/sit-we-go/backend_api`, WSL);
- admin BFF (`sitwego-admin`, Next.js 16 + tRPC);
- the notification service (outside these repos) for real-time delivery to the apps.

**Goal:** when a rider presses **Alert Sitwego Safety**, a person on call is **paged within seconds**. That person sees the live car and rider positions with the plate and both phone numbers, acts, and the rider is told someone is handling it. Everything is audit-logged.

## 0. What exists today (from recon)

| Piece | State |
|---|---|
| Rider app | The safety sheet and incident client are built: `src/ui/safety/useSafetyIncident.ts` POSTs `api/safety/incident` on sheet open and on "Alert Sitwego Safety". It's **off** behind `SAFETY_ALERTS_ENABLED`. The app has a "critical safety" Android notification channel (`src/hooks/notification.ts`) |
| Rust API | **No incident or SOS feature.** `ride.safety_alert_triggered BOOLEAN` exists, from migration `20250305233300_ride.sql`, but is always `false` and unused. Routes are registered in `src/api/mod.rs` (JWT, `sub` = profile id). The private admin plane is `src/api/admin/*` (`X-Internal-Token` + `X-Acting-Admin`). Events go out over **Redis Streams** (`swg:stream:ride_events`, `redis_store/src/events.rs`); driver fixes over **pub/sub** (`driver_location_change_channel`) and are persisted to `ride_history`. Push goes through Gorush (`src/notif.rs`). SMS clients exist in `packages/sms_api` (`AfricasTalkingClient`, `TwilioClient`) but are **unused**. No WebSocket or SSE, no Kafka |
| Admin BFF | tRPC routers proxy to the admin plane (`server/core-client.ts`), with `permProcedure(...)` and `withAudit(...)` and Supabase RBAC (`access_matrix`). **No real-time, maps or toasts, and no rides pages.** The Bell icon in the top bar is decorative |
| Apps' real-time | A separate **notification service** consumes the Redis streams and serves gRPC (`rideEvents.proto` `StreamRiderEvents`). A new event type **must be deployed there first**, or it's dropped |

## 1. Incident lifecycle

```
OPEN ──ack──▶ ACKNOWLEDGED ──▶ IN_PROGRESS ──▶ RESOLVED(outcome)
  │                                               ▲
  └── rider "I'm safe" ──▶ RIDER_SAFE ── reviewed by an agent ──┘   (never auto-closed)
Escalation: OPEN for > 90 s without ack → page the backup; > 3 min → page the manager.
```

**Outcomes:** `rider_safe` · `police_involved` · `medical` · `false_alarm` · `driver_actioned` · `other`.

`source` values: `sheet_opened` (recorded but **not paged**: it's a signal, not an alert), `alert_safety_team` (**paged**), and later `route_deviation` and `long_stop` (auto, paged if the rider doesn't answer).

## 2. Rust API (`backend_api`)

### 2.1 Migrations (`packages/api/migrations/`, plain SQL; never edit an applied file)
- `<ts>_safety_incidents.sql`:
  ```sql
  CREATE TYPE safety_incident_status AS ENUM ('open','acknowledged','in_progress','rider_safe','resolved');
  CREATE TABLE safety_incidents (
    id VARCHAR(26) PRIMARY KEY,                 -- ULID
    ride_id VARCHAR(26) NOT NULL REFERENCES ride_requests(id),
    rider_id VARCHAR(26) NOT NULL, driver_id VARCHAR(26),
    source VARCHAR(32) NOT NULL, status safety_incident_status NOT NULL DEFAULT 'open',
    snapshot JSONB NOT NULL,                    -- rider/driver name+phone, plate, vehicle, colour, pickup/dropoff, ride status
    assigned_admin VARCHAR(64), outcome VARCHAR(32), police_reference VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), acknowledged_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ
  );
  CREATE UNIQUE INDEX safety_incidents_one_open_per_ride_source
    ON safety_incidents (ride_id, source) WHERE status IN ('open','acknowledged','in_progress');
  CREATE TABLE safety_incident_events (        -- append-only timeline / audit trail
    id BIGSERIAL PRIMARY KEY, incident_id VARCHAR(26) NOT NULL REFERENCES safety_incidents(id),
    actor_type VARCHAR(16) NOT NULL,            -- rider | admin | system
    actor_id VARCHAR(64), kind VARCHAR(32) NOT NULL, data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE safety_incident_locations (     -- rider pings while open
    id BIGSERIAL PRIMARY KEY, incident_id VARCHAR(26) NOT NULL REFERENCES safety_incidents(id),
    lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL, accuracy_m REAL, recorded_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE safety_oncall (                 -- MVP rota; replace with a schedule later
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, tier SMALLINT NOT NULL, -- 1 primary, 2 backup, 3 manager
    active BOOLEAN NOT NULL DEFAULT TRUE
  );
  ```
- Also set `ride.safety_alert_triggered = TRUE` when a paged incident opens, finally using the existing column.

### 2.2 Code layout (follows the promotions module)
- **Schemas:** `src/db/schemas/safety_incident{s,_events,_locations}.rs` and `safety_oncall.rs`.
- **Queries:** a `SafetyQueries` trait in `src/db/queries/safety.rs`, with `impl SafetyQueries for Database`.
- **Rider handlers:** `src/api/safety.rs`.
- **Admin handlers:** `src/api/admin/safety.rs`, as `pub fn routes() -> Router` merged in `admin/mod.rs`.
- **Escalation:** the job `src/jobs/safety_escalator.rs`, run every 15 s.
- **Config:** `SAFETY_INCIDENTS_ENABLED` (default false), `SAFETY_SMS_PROVIDER` (`africastalking|twilio`) and its keys, and `SAFETY_SUPPORT_LINE`.

### 2.3 Rider endpoints (JWT; `sub` must be the ride's `customer_id`, **never trust a caller-supplied role**)

| Route | Body → Response | Notes |
|---|---|---|
| `POST /api/safety/incidents` | `{ ride_id, source, rider_location? }` → `{ incident_id, status }` | Idempotent through the partial unique index (returns the open one). Builds the snapshot from `ride_requests` + `profile` + vehicle. On `alert_safety_team`: page on-call, publish an event, set `ride.safety_alert_triggered` |
| `POST /api/safety/incidents/{id}/location` | `{ lat, lng, accuracy_m, recorded_at }` | Only while not resolved. Rate limit about 1 every 3 s (`high_freq_layer`) |
| `POST /api/safety/incidents/{id}/safe` | `{}` | Status becomes `rider_safe` and pages "rider marked safe" to the assigned person. Never deletes |
| `GET /api/safety/incidents/{id}` | → `{ status, assigned_name?, updated_at }` | For the app's status line (MVP polling; see 4.2) |

Rate-limit these with the existing layers (`user_layer`). Log with `tracing::info!(tag = "safety", …)`.

### 2.4 Admin endpoints (private plane, `X-Internal-Token` + `X-Acting-Admin`)

| Route | Purpose |
|---|---|
| `GET /admin/safety/incidents?status=&limit=` | The queue, open first |
| `GET /admin/safety/incidents/{id}` | Snapshot + timeline + the rider's location trail + **the car's location trail** (from `ride_history`) + the car's **live position** (Redis `ongoing::ri::coord::{driver}-{ride}` / `dr::lt::r-{id}`) |
| `POST /admin/safety/incidents/{id}/ack` | Assigns the acting admin and stops escalation |
| `POST /admin/safety/incidents/{id}/note` | `{ text }` |
| `POST /admin/safety/incidents/{id}/action` | `{ kind: called_rider \| called_driver \| called_police \| notified_contact, reference? }` |
| `POST /admin/safety/incidents/{id}/resolve` | `{ outcome, summary }` |
| `GET /admin/safety/incidents/stream` | **Phase 2:** SSE fed by Redis pub/sub `safety_incident_channel` (see 4.1) |

Every mutation appends to `safety_incident_events`, with `actor_id` taken from `X-Acting-Admin`.

### 2.5 Paging and escalation
- On a paged incident:
  1. **SMS every tier-1 on-call** through `sms_api` (the clients exist; recommend `AfricasTalkingClient` for Kenyan delivery): *"SITWEGO SOS {short id}: {rider} in {plate} {vehicle}, near {area}. Open: {admin_url}/safety/{id}"*.
  2. Optionally a voice call through the generated `twilio` crate, and an email through Resend.
- **`safety_escalator` job:** if still `open` after 90 s, page tier 2; after 3 min, tier 3. Each page is written as a `paged` timeline event, which shows who was notified and when.
- **Write the page to the database before sending.** If the SMS provider fails, the dashboard still shows the incident, and the escalator retries.

### 2.6 Events
- **Pub/sub `safety_incident_channel`** carries `{ incident_id, status, ride_id }` on every change, plus rider location points. It feeds the admin SSE stream (phase 2).
- **A Redis Streams `RIDE_EVENTS_STREAM` event `SafetyIncidentUpdate`** goes to the rider app (phase 2). It needs a new oneof key in `redis_store/src/events.rs`, `rideEvents.proto` and the **notification service, deployed first**.

## 3. Admin BFF (`sitwego-admin`)
- **Permissions:** a migration adding `safety.read` and `safety.act` to `access_matrix`, granted to `super_admin`, plus a new role **`safety_agent`** with only those two (and `drivers.read`).
- **Router:** `server/routers/safety.ts`:
  - `list` and `get` with `permProcedure("safety.read")`;
  - `ack`, `note`, `action` and `resolve` with `permProcedure("safety.act")`, each wrapped in `withAudit(...)`.
  - **Exception to the "reads aren't audited" rule:** `get` writes an audit row too, because looking at a rider's live location and phone number is sensitive.
- **Pages:**
  - **`app/(dashboard)/safety/page.tsx` (the queue):** open incidents first, with age ("2 min ago" in red over 90 s), source, rider, plate and assignee. Polls every 5 s (see 4.1).
  - **`app/(dashboard)/safety/[id]/page.tsx` (the incident):**
    - a **map** with the car's trail and live position, the rider's pings, and pickup and destination;
    - a large details block: plate, vehicle and colour, driver (photo through the existing `/api/drivers/[id]/photo` proxy) and rider, with both **phones shown as `tel:` links**;
    - an **Acknowledge** button, notes, and action buttons (Called rider, Called driver, Called police plus a reference number, Resolve with an outcome);
    - the timeline.
  - **Sidebar:** a `Safety` entry with an open-count badge. Make the **Topbar Bell** real: a red dot and a list of open incidents.
  - **Alarm:** an audible alarm and a browser notification while any incident is `open` and unacknowledged. Ask for notification permission on first visit.
- **Map library:** the admin has none. Use **`@vis.gl/react-google-maps`** (Google key already in use for the apps; add a browser-restricted key), or Leaflet with OSM tiles if you'd rather avoid key or billing coupling.

## 4. Real-time

### 4.1 Admin
- **MVP: polling.** React Query `refetchInterval: 5000` on `safety.list` and `refetchInterval: 3000` on `safety.get`. It's simple, needs no new infrastructure, and the 5 s latency is fine because **SMS paging is the primary alert**.
- **Phase 2: SSE.**
  - The admin-plane endpoint `GET /admin/safety/incidents/stream` (axum `Sse`, subscribes to `safety_incident_channel`).
  - The BFF route handler `app/api/safety/stream/route.ts` authenticates with `authAdminFromRequest` plus `safety.read`, then proxies through `callCoreRaw`. That pattern already exists for photos.
  - The browser opens an `EventSource` and invalidates queries on each event.

### 4.2 Rider app
- **MVP:**
  - a **push notification** through Gorush (`spawn_notify`) on `ack` ("Sitwego Safety is on it — we're calling you"), sent on the app's critical-safety channel;
  - the open safety sheet polls `GET /api/safety/incidents/{id}` every 5 s for its status line.
- **Phase 2:** the `SafetyIncidentUpdate` event over the existing ride event stream, handled in `useRideEvents` like `DriverArrivedEvent`.

## 5. Rider app changes (`mobility-customer`)
1. **Endpoints:** in `useSafetyIncident`, rename the path to `api/safety/incidents`, keep the returned `incident_id`, and flip `SAFETY_ALERTS_ENABLED` once §6 is done.
2. **`sheet_opened`:** keep sending it as a non-paged signal, as now.
3. **Status line in the safety sheet:** "Alerting…" → "Sitwego Safety alerted" → "{agent} is on it — we're calling you" (push or poll) → "Resolved".
4. **"I'm safe"** calls `/safe` when an incident is open.
5. **Rider location pings:** every 5 s while open, through a foreground location task so they continue in the background. Reuse the existing location permission and background location setup (`utils/geo.ts`).
6. **SMS fallback:** if the create call fails (no data), offer "Text Sitwego Safety", which opens the SMS composer to `SAFETY_SUPPORT_LINE` with the plate and a maps link.

## 6. Go-live checklist (all required before `SAFETY_ALERTS_ENABLED = true`)
- [ ] The on-call rota is populated (tier 1, 2 and 3) and covers 24/7, or the app copy states the hours honestly.
- [ ] A test page reaches every on-call phone, and the escalation timings are verified.
- [ ] An SMS provider account is funded, with Kenyan sender ID approval where needed.
- [ ] A response runbook: what the agent says, when to call 999, how to record police reference numbers, follow-up after resolution.
- [ ] `safety_agent` accounts created; the audit log confirmed for views and actions.
- [ ] Data protection: incident data, locations and phone numbers covered in the privacy notice; a retention period set.

## 7. Phasing
1. **Phase 1, MVP:**
   - **Backend:** the tables, rider and admin endpoints, SMS paging and the escalator.
   - **Admin:** the queue and incident pages with polling and an alarm.
   - **App:** the final endpoints, the status line from push and polling, "I'm safe", and the flag turned on.
2. **Phase 2:** rider location pings, the SMS fallback, the admin SSE stream, the `SafetyIncidentUpdate` ride event (notification service first), and the Bell inbox.
3. **Phase 3:** trusted-contact notification, the audio recording attachment (`docs/safety/ride-audio-recording.md`), and auto-incidents from route deviation or long stops using the tracking pipeline's off-route detection.

## 8. Related security fix (do first, independent of this spec)
`cancel_ride` in `backend_api/packages/api/src/api/rides.rs` (lines 1460–1508) authorizes using a **caller-supplied** `?account_type=` query parameter, and `AccountType::Admin => true` passes the participant check. Since `/api/cancel-ride/{id}` sits behind ordinary rider/driver JWT auth, **any logged-in user can cancel any ride** with `?account_type=admin`.

**The fix:**
- derive the role from the JWT subject (customer if `sub == customer_id`, driver if `sub == driver_id`, otherwise 403);
- move admin cancellation to the private admin plane.

The new safety endpoints must follow the same rule: **never trust a role taken from the request.**
