# Spec — Emergency → backend → admin dashboard

**Status:** spec, not scheduled · **Repos:**
- rider app (`mobility-customer`);
- Rust API (`~/sit-we-go/backend_api`, WSL);
- admin BFF (`sitwego-admin`, Next.js 16 + tRPC);
- the notification service (outside these repos) for real-time delivery to the apps.

**Goal:** when a rider presses **Alert Sitwego Safety**, a person on call is **paged within seconds**. That person sees the live car and rider positions with the plate and both phone numbers, acts, and the rider is told someone is handling it. Everything is audit-logged.

**Prior art:** the design borrows from Namma Yatri's SOS backend (Haskell, `nammayatri/Backend/app`), and avoids several weaknesses found there. See §9.

## 0. What exists today (from recon)

| Piece | State |
|---|---|
| Rider app | The safety sheet and incident client are built: `src/ui/safety/useSafetyIncident.ts` POSTs `api/safety/incident` on sheet open and on "Alert Sitwego Safety". It's **off** behind `SAFETY_ALERTS_ENABLED`. The app has a "critical safety" Android notification channel (`src/hooks/notification.ts`) |
| Rust API | **No incident or SOS feature.** `ride.safety_alert_triggered BOOLEAN` exists, from migration `20250305233300_ride.sql`, but is always `false` and unused. Routes are registered in `src/api/mod.rs` (JWT, `sub` = profile id). The private admin plane is `src/api/admin/*` (`X-Internal-Token` + `X-Acting-Admin`). Events go out over **Redis Streams** (`swg:stream:ride_events`, `redis_store/src/events.rs`); driver fixes over **pub/sub** (`driver_location_change_channel`) and are persisted to `ride_history`. Push goes through Gorush (`src/notif.rs`). SMS clients exist in `packages/sms_api` (`AfricasTalkingClient`, `TwilioClient`) but are **unused**. No WebSocket or SSE, no Kafka |
| Admin BFF | tRPC routers proxy to the admin plane (`server/core-client.ts`), with `permProcedure(...)` and `withAudit(...)` and Supabase RBAC (`access_matrix`). **No real-time, maps or toasts, and no rides pages.** The Bell icon in the top bar is decorative |
| Apps' real-time | A separate **notification service** consumes the Redis streams and serves gRPC (`rideEvents.proto` `StreamRiderEvents`). A new event type **must be deployed there first**, or it's dropped |

## 1. Incident lifecycle

**One incident per ride.** Every trigger on the same ride (sheet opened, alert pressed, an auto-check that went unanswered) lands on the same row as a timeline event. A new alert after the incident was closed **re-opens it** instead of creating a second one. The agent then sees the whole history of that ride in one place. Namma Yatri uses this model.

```
WATCHING ──alert──▶ OPEN ──ack──▶ ACKNOWLEDGED ──▶ IN_PROGRESS ──▶ RESOLVED(outcome)
                     ▲  │                                              ▲
                     │  └── rider "I'm safe" ──▶ RIDER_SAFE ── reviewed by an agent ─┘   (never auto-closed)
                     └──────────── new alert on RIDER_SAFE / RESOLVED (re-open, pages again)
Escalation: OPEN for > 90 s without ack → page the backup; > 3 min → page the manager.
```

- **`watching`** is the state created by `sheet_opened`. It is a signal, **not paged** and hidden from the default queue, but visible on the incident page if the rider alerts later.
- **Outcomes:** `rider_safe` · `police_involved` · `medical` · `false_alarm` · `driver_actioned` · `other`.
- **Triggers (`source` on each timeline event):**
  - `sheet_opened` (not paged);
  - `alert_safety_team` (**paged**);
  - later, `route_deviation`, `long_stop` and `unanswered_check` (§2.7). Only the last one pages.

## 2. Rust API (`backend_api`)

### 2.1 Migrations (`packages/api/migrations/`, plain SQL; never edit an applied file)
- `<ts>_safety_incidents.sql`:
  ```sql
  CREATE TYPE safety_incident_status AS ENUM ('watching','open','acknowledged','in_progress','rider_safe','resolved');
  CREATE TABLE safety_incidents (
    id VARCHAR(26) PRIMARY KEY,                 -- ULID
    ride_id VARCHAR(26) NOT NULL UNIQUE REFERENCES ride_requests(id),   -- one per ride, re-opened
    rider_id VARCHAR(26) NOT NULL, driver_id VARCHAR(26),
    first_source VARCHAR(32) NOT NULL, last_source VARCHAR(32) NOT NULL,
    status safety_incident_status NOT NULL DEFAULT 'watching',
    is_drill BOOLEAN NOT NULL DEFAULT FALSE,    -- §2.9: never paged, never in the queue
    snapshot JSONB NOT NULL,                    -- rider/driver name+phone, plate, vehicle, colour, pickup/dropoff, ride status
    assigned_admin VARCHAR(64), outcome VARCHAR(32), police_reference VARCHAR(64),
    reopen_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), opened_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ
  );
  CREATE INDEX safety_incidents_queue ON safety_incidents (status, opened_at) WHERE NOT is_drill;
  CREATE TABLE safety_incident_events (        -- append-only timeline / audit trail
    id BIGSERIAL PRIMARY KEY, incident_id VARCHAR(26) NOT NULL REFERENCES safety_incidents(id),
    actor_type VARCHAR(16) NOT NULL,            -- rider | admin | system | contact
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
- `<ts>_safety_config.sql` (§2.8), and in phase 3 `<ts>_emergency_contacts.sql` and `<ts>_trip_share_tokens.sql` (§2.6).
- Also set `ride.safety_alert_triggered = TRUE` when an incident first becomes `open`, finally using the existing column. Namma Yatri keeps the same once-per-ride flag.
- Add `profile.safety_false_alarm_count INT NOT NULL DEFAULT 0` (§2.9).

### 2.2 Code layout (follows the promotions module)
- **Schemas:** `src/db/schemas/safety_incident{s,_events,_locations}.rs`, `safety_oncall.rs` and `safety_config.rs`.
- **Queries:** a `SafetyQueries` trait in `src/db/queries/safety.rs`, with `impl SafetyQueries for Database`.
- **Rider handlers:** `src/api/safety.rs`.
- **Admin handlers:** `src/api/admin/safety.rs`, as `pub fn routes() -> Router` merged in `admin/mod.rs`.
- **Escalation:** the job `src/jobs/safety_escalator.rs`, run every 15 s (§2.5).
- **Env:** `SAFETY_INCIDENTS_ENABLED` (default false), `SAFETY_SMS_PROVIDER` (`africastalking|twilio`) and its keys, `SAFETY_SUPPORT_LINE` and `SAFETY_WEBHOOK_SECRET`. Behaviour and timings live in `safety_config` (§2.8), not in env.

### 2.3 Rider endpoints (JWT; `sub` must be the ride's `customer_id`, **never trust a caller-supplied role**)

| Route | Body → Response | Notes |
|---|---|---|
| `POST /api/safety/incidents` | `{ ride_id, source, rider_location? }` → `{ incident_id, status }` | **Upsert on `ride_id`**, inside one transaction with `SELECT … FOR UPDATE`. No row: create it (`watching`, or `open` for an alert). `sheet_opened` on an existing row: append an event only. `alert_safety_team`: if `watching`, `rider_safe` or `resolved`, set `open` (bump `reopen_count`, `reactivated` event) and page. If already open, append an event only, **without paging again**. Builds the snapshot from `ride_requests` + `profile` + vehicle |
| `POST /api/safety/incidents/{id}/location` | `{ lat, lng, accuracy_m, recorded_at }` | Only while not resolved. Rate limit about 1 every 3 s (`high_freq_layer`) |
| `POST /api/safety/incidents/{id}/safe` | `{}` | Status becomes `rider_safe` and pages "rider marked safe" to the assigned person. Never deletes |
| `GET /api/safety/incidents/{id}` | → `{ status, assigned_name?, updated_at }` | For the app's status line (MVP polling; see 4.2) |
| `POST /api/safety/drill` | `{}` → `{ ok }` | Phase 3, §2.9 |

- Every `{id}` route checks **`incident.rider_id == sub`** before it does anything, and returns 404 rather than 403 so ids can't be probed.
- Rate-limit these with the existing layers (`user_layer`), **except** that the create call must never be refused for a rider who has an active ride. Log with `tracing::info!(tag = "safety", …)`.

### 2.4 Admin endpoints (private plane, `X-Internal-Token` + `X-Acting-Admin`)

| Route | Purpose |
|---|---|
| `GET /admin/safety/incidents?status=&limit=` | The queue, open first. Excludes `watching` and drills unless asked |
| `GET /admin/safety/incidents/{id}` | Snapshot + timeline + the rider's location trail + **the car's location trail** (from `ride_history`) + the car's **live position** (Redis `ongoing::ri::coord::{driver}-{ride}` / `dr::lt::r-{id}`) + the rider's false-alarm count |
| `POST /admin/safety/incidents/{id}/ack` | Assigns the acting admin and stops escalation |
| `POST /admin/safety/incidents/{id}/note` | `{ text }` |
| `POST /admin/safety/incidents/{id}/action` | `{ kind: called_rider \| called_driver \| called_police \| notified_contact, reference? }` |
| `POST /admin/safety/incidents/{id}/resolve` | `{ outcome, summary }`. `false_alarm` increments the rider's counter |
| `POST /admin/safety/test-page` | Sends a test page to one on-call row (go-live checklist and weekly drills) |
| `GET /admin/safety/incidents/stream` | **Phase 2:** SSE fed by Redis pub/sub `safety_incident_channel` (see 4.1) |

Every mutation appends to `safety_incident_events`, with `actor_id` taken from `X-Acting-Admin`.

### 2.5 Paging and escalation
- On an incident becoming `open`:
  1. **SMS every tier-1 on-call** through `sms_api` (the clients exist; recommend `AfricasTalkingClient` for Kenyan delivery): *"SITWEGO SOS {short id}: {rider} in {plate} {vehicle}, near {area}. Open: {admin_url}/safety/{id}"*.
  2. Optionally a voice call (Africa's Talking Voice, or the generated `twilio` crate), and an email through Resend.
  3. Phase 3: notify the rider's emergency contacts (§2.6).
- **`safety_escalator` job**, every 15 s: if still `open` past `escalate_tier2_after_s` (90 s), page tier 2; past `escalate_tier3_after_s` (3 min), tier 3. Each page is written as a `paged` timeline event, which shows who was notified and when.
- **Rules for every step** (Namma Yatri runs the same pattern with delayed jobs):
  - **Write before sending.** The incident and the `paged` event are committed before the SMS goes out. If the provider fails, the dashboard still shows the incident and the next tick retries.
  - **Re-read state before acting.** The job loads the current status first and does nothing if the incident was acknowledged or closed in the meantime.
  - **Idempotent per step.** Take a Redis lock `SET safety:page:{incident}:{tier}:{reopen_count} NX EX 600` before paging, so two API instances or a retry never page the same tier twice.
- **Failures are loud.** A failed SMS or call is logged at `error`, written as a `page_failed` event (shown in red on the incident page), and the next channel or tier is tried. Errors are never swallowed.

### 2.6 Emergency contacts and the trip link (phase 3)
- **Table `emergency_contacts`:** `rider_id`, `name`, `phone`, `priority`, `notify_on_sos` and `created_at`, with at most 5 per rider. The rider manages them in Profile → Safety.
- **On an incident becoming `open`:** for each contact with `notify_on_sos`:
  - if the phone matches a Sitwego profile, send a push;
  - otherwise, or if the push isn't delivered, send an SMS: *"{rider} pressed the emergency button on a Sitwego ride. Live trip: {link}. Sitwego Safety has been alerted."*
  - Each send is written as a `contact_notified` event.
- **The trip link must be a real secret.** Namma Yatri's is an unguessable id that never expires; ours is stricter:
  - **Table `trip_share_tokens`:** `token_hash` (SHA-256 of 32 random bytes; the raw token only ever appears in the link), `ride_id`, `incident_id?`, `created_by`, `expires_at` and `revoked_at`.
  - **Expiry:** 1 h after the ride ends, or 24 h after the incident resolves, whichever is later. The rider can revoke it.
  - **Public route:** `GET /public/trip/{token}`, rate-limited by IP. Every access is logged with time, IP and user agent, and shown on the incident page.
  - **Exposes only** the car's live position and route, the plate, the vehicle and colour, the driver's first name, and the ride status. **No phone numbers**, no rider details, no history after expiry.
  - The page itself is a small static web page (hosting is an open question: the marketing site or a Next.js route in the admin app's public segment).
- The same token powers the existing **Share trip** button, so shared links stop being plain map links.

### 2.7 Auto-checks: route deviation and long stops (phase 3)
Namma Yatri runs these checks at night. When the trip goes off route or stops for too long, it asks the rider whether they're OK, then follows up by phone call, then by a person. We use the same ladder, with stricter failure handling:

```
trigger (deviation > deviation_m, or stopped > long_stop_s away from pickup/drop)
  → push "Is everything OK?" [I'm OK] [Get help]           (event: check_sent, source: route_deviation | long_stop)
  → no answer in check_timeout_s (60 s) → IVR call: "press 1 if you're safe, 2 for help"
  → digit 2, any other digit, no digit, hung up, or call failed → OPEN the incident (source: unanswered_check) and page
  → [I'm OK] or digit 1 → event check_ok; status stays watching
```

- **Fail safe:** anything except an explicit "I'm OK" escalates. Namma Yatri treats a missing digit as safe; we don't.
- **Webhook auth:** the IVR callback (`POST /webhooks/safety/ivr/{secret}`) must check `SAFETY_WEBHOOK_SECRET` with a constant-time compare, and match the call's `sessionId` against the one stored on the `ivr_started` event. Namma Yatri's equivalent endpoint is unauthenticated. Unknown sessions are ignored and logged.
- **Detection** reuses the tracking pipeline's off-route logic and the `ride_history` fixes. Gate it per city and by hours (`night_only`, `night_start` and `night_end` in §2.8).
- One check at a time per ride, with a cooldown of `check_cooldown_s` between checks, so a long traffic jam doesn't spam the rider.

### 2.8 Per-region config
**Table `safety_config`,** keyed by `region` (start with a single `default` row; Namma Yatri keys this by city). It holds:
- the kill switch `enabled` and `auto_checks_enabled`;
- `emergency_number` ("999"), `support_line`;
- `escalate_tier2_after_s`, `escalate_tier3_after_s`;
- `notify_contacts`, `contacts_sms_fallback`;
- `deviation_m`, `long_stop_s`, `check_timeout_s`, `check_cooldown_s`, `ivr_enabled`, `night_only`, `night_start`, `night_end`;
- `drill_enabled`.

The admin edits it through `safety.config` (§3), and the API caches it for 60 s. The app gets the parts it needs (emergency number, support line) from `GET /api/safety/config`, so changing them doesn't need a release.

### 2.9 Drills and false alarms
- **Rider drill (phase 3):** "Test my safety alert" in Profile → Safety creates an incident with `is_drill = true`. It runs the rider-visible flow: status line, contacts notified with an SMS that starts with **"[TEST]"**. It **never pages on-call** and never appears in the queue. Limit it to once a day.
- **On-call drill:** `POST /admin/safety/test-page`, run at go-live and then weekly, with the result recorded.
- **False alarms:** `resolve` with `false_alarm` increments `profile.safety_false_alarm_count`. The agent sees the count as context. It **never** blocks, delays, rate-limits or de-prioritises the alert button. A rider who presses it ten times by mistake still gets paged the eleventh time.

### 2.10 Events
- **Pub/sub `safety_incident_channel`** carries `{ incident_id, status, ride_id }` on every change, plus rider location points. It feeds the admin SSE stream (phase 2).
- **A Redis Streams `RIDE_EVENTS_STREAM` event `SafetyIncidentUpdate`** goes to the rider app (phase 2). It needs a new oneof key in `redis_store/src/events.rs`, `rideEvents.proto` and the **notification service, deployed first**.

### 2.11 Evidence (audio and media)
Ties in with `docs/safety/ride-audio-recording.md`.
- **Upload:** the API issues a pre-signed upload URL only if `incident.rider_id == sub` (Namma Yatri's media upload skips the ownership check). The object key is server-generated, `safety/{incident_id}/{ulid}.m4a`.
- **Read:** admins get short-lived (5 min) signed URLs through the audited `get`. Never a public URL.
- **Consent:** the app copy states that recording is on and who can hear it.
- **Retention:** delete after the configured period unless the incident outcome is `police_involved` or it is marked as held.

## 3. Admin BFF (`sitwego-admin`)
- **Permissions:** a migration adding `safety.read`, `safety.act` and `safety.config` to `access_matrix`, all granted to `super_admin`, plus a new role **`safety_agent`** with only `safety.read`, `safety.act` and `drivers.read`.
- **Router:** `server/routers/safety.ts`:
  - `list` and `get` with `permProcedure("safety.read")`;
  - `ack`, `note`, `action`, `resolve` and `testPage` with `permProcedure("safety.act")`, each wrapped in `withAudit(...)`;
  - `getConfig` and `setConfig` with `permProcedure("safety.config")`, audited.
  - **Exception to the "reads aren't audited" rule:** `get` writes an audit row too, because looking at a rider's live location and phone number is sensitive. So does fetching a signed media URL.
- **Pages:**
  - **`app/(dashboard)/safety/page.tsx` (the queue):** open incidents first, with age ("2 min ago" in red over 90 s), source, rider, plate, assignee and a "re-opened" badge. Polls every 5 s (see 4.1).
  - **`app/(dashboard)/safety/[id]/page.tsx` (the incident):**
    - a **map** with the car's trail and live position, the rider's pings, and pickup and destination;
    - a large details block: plate, vehicle and colour, driver (photo through the existing `/api/drivers/[id]/photo` proxy) and rider, with both **phones shown as `tel:` links**, and the rider's false-alarm count;
    - an **Acknowledge** button, notes, and action buttons (Called rider, Called driver, Called police plus a reference number, Resolve with an outcome);
    - the timeline, including pages, failed pages, contacts notified, auto-checks and trip-link views.
  - **`app/(dashboard)/safety/settings/page.tsx`:** the region config and the on-call rota, with a "Send test page" button per person.
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
- **Phase 3:** the "Is everything OK?" push (§2.7) uses notification actions, so the rider can answer from the lock screen.

## 5. Rider app changes (`mobility-customer`)
1. **Endpoints:** in `useSafetyIncident`, rename the path to `api/safety/incidents`, keep the returned `incident_id`, and flip `SAFETY_ALERTS_ENABLED` once §6 is done.
2. **`sheet_opened`:** keep sending it as a non-paged signal, as now. It creates or touches the ride's `watching` incident.
3. **Status line in the safety sheet:** "Alerting…" → "Sitwego Safety alerted" → "{agent} is on it — we're calling you" (push or poll) → "Resolved".
4. **"I'm safe"** calls `/safe` when an incident is open.
5. **Rider location pings:** every 5 s while open, through a foreground location task so they continue in the background. Reuse the existing location permission and background location setup (`utils/geo.ts`).
6. **SMS fallback:** if the create call fails (no data), offer "Text Sitwego Safety", which opens the SMS composer to the support line with the plate and a maps link.
7. **Config from the server:** read the emergency number and support line from `GET /api/safety/config`, with the values in `safetyConfig.ts` as the offline fallback.
8. **Phase 3:**
   - Profile → Safety: emergency contacts (picked from the phone's contacts), "Test my safety alert", and the auto-check opt-out;
   - Share trip uses the signed trip link (§2.6);
   - the "Is everything OK?" notification with actions.

## 6. Go-live checklist (all required before `SAFETY_ALERTS_ENABLED = true`)
- [ ] The on-call rota is populated (tier 1, 2 and 3) and covers 24/7, or the app copy states the hours honestly.
- [ ] A test page reaches every on-call phone, and the escalation timings are verified. Weekly on-call drills are scheduled.
- [ ] Failure path tested: with the SMS provider key broken, the incident still shows on the dashboard, a `page_failed` event appears, and an error is logged.
- [ ] An SMS provider account is funded, with Kenyan sender ID approval where needed.
- [ ] A response runbook: what the agent says, when to call 999, how to record police reference numbers, follow-up after resolution.
- [ ] `safety_agent` accounts created; the audit log confirmed for views and actions.
- [ ] Data protection: incident data, locations, phone numbers, emergency contacts and recordings covered in the privacy notice; retention periods set.
- [ ] Before phase 3: the IVR webhook is authenticated, trip links expire and are revocable, and media uploads are ownership-checked (§2.6, §2.7, §2.11).

## 7. Phasing
1. **Phase 1, MVP:**
   - **Backend:** the tables (one incident per ride, re-opened), rider and admin endpoints, `safety_config` with a `default` row, SMS paging and the escalator with locks and loud failures.
   - **Admin:** the queue and incident pages with polling and an alarm, the test page, and the config page.
   - **App:** the final endpoints, server config, the status line from push and polling, "I'm safe", and the flag turned on.
2. **Phase 2:** rider location pings, the SMS fallback, the admin SSE stream, the `SafetyIncidentUpdate` ride event (notification service first), and the Bell inbox.
3. **Phase 3:**
   - emergency contacts and signed trip links (which also replace Share trip);
   - the rider drill;
   - auto-checks with the push → IVR → agent ladder;
   - the audio recording attachment (`docs/safety/ride-audio-recording.md`) under the evidence rules in §2.11.

## 8. Related security fix (do first, independent of this spec)
`cancel_ride` in `backend_api/packages/api/src/api/rides.rs` (lines 1460–1508) authorizes using a **caller-supplied** `?account_type=` query parameter, and `AccountType::Admin => true` passes the participant check. Since `/api/cancel-ride/{id}` sits behind ordinary rider/driver JWT auth, **any logged-in user can cancel any ride** with `?account_type=admin`.

**The fix:**
- derive the role from the JWT subject (customer if `sub == customer_id`, driver if `sub == driver_id`, otherwise 403);
- move admin cancellation to the private admin plane.

The new safety endpoints must follow the same rule: **never trust a role taken from the request.**

## 9. Lessons from Namma Yatri (`nammayatri/Backend/app`)

| They do | We take | We avoid |
|---|---|---|
| One SOS row per ride, re-activated on a repeat alert | §1, §2.3: `UNIQUE (ride_id)`, re-open with `reopen_count` | — |
| A once-per-ride `safetyAlertTriggered` flag on the ride | §2.1: use our unused `ride.safety_alert_triggered` | — |
| A journey-status state machine, driven by delayed jobs that re-check state before acting | §2.5: the 15 s escalator re-reads status, with a Redis lock per step | — |
| Emergency contacts: push if they have the app, SMS fallback with a tracking link | §2.6 | The tracking link is an unguessable id with no expiry, revocation or access log. Ours is hashed, expiring, revocable and logged |
| Night-time route-deviation and long-stop checks: ask the rider, then an IVR "press 1 if safe", then an agent | §2.7 | A missing IVR digit counts as safe, and the IVR callback is unauthenticated. Ours escalates on anything but "OK" and checks a secret and the session id |
| Auto-calling on-duty agents for an unattended SOS, with a dedupe lock | §2.5 tiered paging + lock | — |
| Per-city config for features and timings | §2.8 `safety_config` by region | — |
| A mock drill that runs the flow without creating a ticket | §2.9 rider drill + on-call test page | — |
| A false-alarm counter | §2.9, shown as context only | Never use it to throttle or block the button |
| SOS media upload | §2.11 | No ownership check on upload. Ours requires `rider_id == sub`, server-generated keys and signed, audited reads |
| — | — | Followers fetching rider details without a follower check, and errors swallowed in the notification paths. Ours: every `{id}` route checks ownership (§2.3), and failures are events + `error` logs (§2.5) |
