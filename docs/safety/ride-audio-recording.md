# Spec — Ride audio recording (rider app, Android first)

**Status:** spec only, not scheduled · **Owner:** TBD · **Depends on:** the safety incident backend and an on-call reviewer (see `src/ui/safety/safetyConfig.ts`) · **Library:** [`react-native-nitro-sound`](https://github.com/hyochan/react-native-nitro-sound)

## 1. Goal
A rider can record the audio of their trip as safety evidence. The recording:
- stays on the rider's phone, **encrypted so that nobody — the rider included — can play it back**;
- is **uploaded only when the rider files a safety report**;
- is **deleted automatically** after 7 days otherwise.

The driver is told by policy that rides may be recorded. They aren't alerted per trip.

**Out of scope for this version:**
- driver-side recording (captain app) — see §15;
- iOS;
- video;
- automatic recording without a tap.

## 2. Principles
1. **The rider decides.** Recording is opt-in per trip, or set through a preference, and stoppable at any time.
2. **No playback on the device.** The audio can't be edited, clipped or shared, so it can't be tampered with or used to harass a driver.
3. **Encrypted at rest from the moment a chunk closes.** Only Sitwego Safety's private key, held in a cloud KMS, can decrypt.
4. **Tamper-evident.** Chunk hashes are registered with the backend at trip end, and the uploaded audio must match them.
5. **Minimal retention.** Unreported recordings are deleted on the device after 7 days. Server retention follows a written policy.
6. **Safety only.** Recordings are never used for ratings, marketing or routine monitoring.

## 3. User experience

### 3.1 Turning it on
- **In the safety sheet**, add a **Record audio** tile next to Share trip status:
  - first use: a short explainer ("Recorded on your phone, encrypted, only shared with Sitwego Safety if you report an incident, deleted after 7 days"), then the `RECORD_AUDIO` permission prompt;
  - **Never prompt for permission from the Emergency path.** If the permission is missing there, the tile reads "Set up audio recording" and leads to the explainer.
- **Safety preferences (later):** "Record every trip" / "Record trips after 9 pm". A preference still needs the app open when the trip starts (see §5.2), so it shows a one-tap "Start recording" prompt on the ride screen.

### 3.2 While recording
- **A persistent notification**, required for the foreground service: "Recording audio for your safety · Tap to open", with a **Stop** action.
- Android's own microphone indicator, from Android 12.
- **A red "● Recording" chip on the v2 ride screen** (status card and expanded header). Tapping it opens the safety sheet, where the tile reads **Stop recording**.

### 3.3 Stopping
- **Automatic:** on `RideEndEvent` / `RideCancelEvent` (`REMOVE-RIDE`), plus a 2-minute grace period after drop-off.
- **Manual:** the in-app button or the notification action.
- **Hard cap:** 3 hours per recording.

### 3.4 After the trip
- **Ride history and the rating screen** show "🎙 Audio recorded · deleted on 12 Oct unless you report a problem" with a **Report a safety issue** button.
- **Reporting:** pick a category, add an optional note, confirm "Include the audio recording" (default on), then upload. Show progress and confirm with "Sent to Sitwego Safety. We'll contact you."
- **No play button anywhere.**

## 4. Architecture

```
JS (rider app)
  useRideRecording()  ── controls ──▶  react-native-nitro-sound   (capture: startRecorder / stopRecorder)
        │                                   writes plaintext chunk → filesDir/recordings/<recId>/
        │
        └── controls ──▶  SafetyRecording native module (Kotlin, in-app)
                             • MicrophoneForegroundService  (keeps capture alive in background)
                             • ChunkSealer: AES-256-GCM encrypt → .enc, SHA-256, delete plaintext
                             • RecordingStore (index in MMKV + files)
                             • UploadWorker (WorkManager) → pre-signed PUT URLs
                             • RetentionWorker (daily) → delete expired
Backend
  POST /api/safety/recordings            (register manifest + hashes at trip end)
  POST /api/safety/reports               (create report; returns upload URLs)
  POST /api/safety/reports/{id}/complete (verify hashes, attach audio)
```

**Why a native module as well as the library:** `react-native-nitro-sound` (0.2.20) records audio well, but it:
- has **no Android foreground service** (its "background threads" only keep the UI responsive; recording stops when the OS backgrounds or kills the app);
- does **no chunking**;
- does **no encryption**.

Encryption and hashing belong in native code anyway, so keys and plaintext never pass through JS. The app already ships native foreground services (`RpcStreamingService` and others), so this follows an existing pattern.

> **If maintenance becomes a concern:** the native module could do the capture itself with `MediaRecorder` (about 50 lines), removing the library. The JS interface in §9 stays the same.

## 5. Android specifics

### 5.1 Manifest and permissions
- `RECORD_AUDIO` (runtime), `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE` (Android 14+), and `POST_NOTIFICATIONS` (Android 13+, already requested).
- `<service android:name=".safety.MicrophoneForegroundService" android:foregroundServiceType="microphone" android:exported="false" />`
- **Play Console:** declare the `microphone` foreground service (as for `remoteMessaging`), and update the **Data safety** form: audio is collected, encrypted in transit and at rest, not shared with third parties, user-deletable.

### 5.2 OS constraints
- **The service has to start while the app is visible.** A `microphone` foreground service can't be started from the background (Android 14+). It must be started from a user action in the app (the Record tile, or the ride-screen prompt). It **cannot** start on its own when a ride is accepted while the app is closed.
- **"While in use" microphone access** (Android 11+) works because the service starts from the foreground and stays a foreground service.
- **Phone calls take the microphone.** During a call, including **Call 999 from the safety sheet**, Android gives the call exclusive capture, so the recording captures silence or pauses. The recorder detects this (audio focus/recording callback) and marks the gap in the chunk metadata (`interrupted: "call"`). It resumes automatically after the call, and the reviewer UI shows the gap. Reports should note "recording paused during your call".
- **OEM battery killers** (Samsung, Xiaomi, Tecno, Infinix): a foreground service with an ongoing notification is the best protection. Test specifically on Samsung (the A30s) and Transsion devices.
- **Process death:** at startup, `RecordingStore` finds any recording still marked `recording`. It seals leftover plaintext chunks, marks the recording `interrupted`, and continues retention as normal.

## 6. Capture settings (`react-native-nitro-sound`)
- **Codec and file:** AAC (`AudioEncoderAndroid.AAC`), MPEG-4 container (`OutputFormatAndroid.MPEG_4`), `.m4a`.
- **Source:** `AudioSourceAndroid.VOICE_RECOGNITION`, which applies less aggressive processing than `MIC`. Check on device; fall back to `MIC`.
- **Quality:** mono (`AudioChannels: 1`), 16 kHz (`AudioSamplingRate: 16000`), 32 kbps (`AudioEncodingBitRate: 32000`). That's about **14 MB/hour, or 2–5 MB for a typical trip**.
- **Metering:** off (`meteringEnabled: false`). There's no UI for it, and it saves battery.
- **Output path:** always pass an explicit `uri` in **app-private `filesDir/recordings/<recordingId>/chunk-<seq>.m4a`**. Never use the library's default cache path (cache can be cleared, and other tooling may read it).

## 7. Chunking
- **Rotate every 60 s:** `stopRecorder()` → hand the closed file to `ChunkSealer` → `startRecorder(nextUri)`. The expected gap is about 50–150 ms, which is acceptable for evidence. Each chunk records the actual `startedAt` and `endedAt` (wall clock and elapsed-realtime), so reviewers can see any gaps.
- **Why chunk at all:**
  - a crash loses at most one chunk;
  - plaintext exists on disk for at most about 60 s;
  - uploads are resumable per chunk.
- **Sequence numbers** start at 1 and the manifest lists them all, so a missing chunk is visible.

## 8. Encryption and integrity
- **A new AES-256-GCM key per chunk** (`javax.crypto`, `SecureRandom`). No key outlives its chunk, so process death never leaves an unusable key behind.
- **The chunk key is wrapped with Sitwego Safety's RSA-OAEP-SHA256 public key,** bundled in the app with a `keyId` so keys can be rotated. The private key lives only in a cloud KMS.
- **The `.enc` file layout:**

  `magic "SWREC1" | keyId (16B) | wrappedKeyLen (2B) | wrappedKey | iv (12B) | ciphertext | gcmTag (16B)`

  The authenticated data covers `recordingId | rideId | seq`, so a chunk can't be moved to another recording.
- **Sealing:** the plaintext `.m4a` is deleted immediately after its `.enc` is written and fsynced.
- **Hashing:** a SHA-256 hash of each `.enc` file goes into the manifest.
- **Manifest registration** (`POST /api/safety/recordings`) is sent at stop: hashes, sizes, times and the chunk count, no audio. It's retried with WorkManager until accepted. This is what makes later uploads tamper-evident.

## 9. JS interface

```ts
// src/ui/safety/recording/useRideRecording.ts
type RecordingState =
  | { status: "idle" }
  | { status: "needs_permission" }
  | { status: "recording"; recordingId: string; startedAt: number }
  | { status: "stopping" }
  | { status: "error"; reason: "permission_denied" | "mic_busy" | "storage_full" | "start_failed" };

useRideRecording(rideId): {
  state: RecordingState;
  start(): Promise<void>;     // must be called from a user action while the app is visible
  stop(): Promise<void>;
}

// Native module (SafetyRecording):
startSession(rideId, publicKeyId) -> recordingId   // starts the foreground service + notification
sealChunk(recordingId, seq, plaintextPath, startedAt, endedAt, interrupted?) -> { sha256, bytes }
endSession(recordingId) -> Manifest                 // queues manifest registration
listRecordings() -> RecordingSummary[]              // for ride history / report UI
uploadForReport(recordingId, uploadUrls) -> void    // enqueues UploadWorker
deleteRecording(recordingId) -> void
```

**Integration points in the current code:**
- **Safety sheet** (`src/ui/safety/SafetySheetContent.tsx`): a Record audio tile. Its state comes from `useRideRecording`, captured by the opener as `useSafetySheet` already does.
- **v2 ride screen:** a recording chip on `RideStatusCard` and `RideStatusHeader`.
- **Auto-stop:** subscribe to `REMOVE-RIDE` (`useRideEvents` / ride state going null) and stop after the grace period.
- **Report UI:** ride history (`RideDetailsScreen`) and the rating flow.

## 10. Local storage and retention
- **Index in MMKV** (`safety_recordings`): `{ recordingId, rideId, status: recording|sealed|registered|reported|uploaded|interrupted, createdAt, expiresAt, chunks: [{ seq, file, sha256, bytes, startedAt, endedAt, interrupted? }] }`.
- **Daily `RetentionWorker`:**
  - deletes recordings past `expiresAt` (7 days) unless they're `reported`;
  - deletes uploaded recordings once the server confirms receipt;
  - enforces a **200 MB cap**, deleting the oldest unreported recordings first.
- **On logout or account deletion:** delete every recording (warn first if any are reported but not yet uploaded).

## 11. Report and upload flow
1. **Create the report:** `POST /api/safety/reports` with `{ ride_id, category, note, recording_id? }`. The response is `{ report_id, uploads: [{ seq, url, headers, expires_at }] }`, a pre-signed PUT for each chunk.
2. **Upload:** `UploadWorker` (WorkManager, any network, exponential backoff, survives restarts) PUTs each `.enc` file. URLs that expire before the upload finishes are refreshed with `POST /api/safety/reports/{id}/upload-urls`.
3. **Complete:** `POST /api/safety/reports/{id}/complete` makes the server check every chunk's SHA-256 against the registered manifest. Any mismatch is flagged to the reviewer, not hidden.
4. **Status:** the report shows "Uploading 3/6", then "Sent".

## 12. Backend contract (summary)

| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/safety/recordings` | `{ recording_id, ride_id, key_id, chunks:[{seq, sha256, bytes, started_at, ended_at, interrupted?}], ended_at }` | Idempotent on `recording_id`. Rejected if the caller isn't the ride's rider |
| `POST /api/safety/reports` | `{ ride_id, category, note?, recording_id? }` | Pages on-call (see `SAFETY_ALERTS_ENABLED`). Returns upload URLs when `recording_id` is set |
| `POST /api/safety/reports/{id}/upload-urls` | `{ seqs:[…] }` | Refreshes expired URLs |
| `POST /api/safety/reports/{id}/complete` | `{}` | Verifies hashes, marks the audio as attached |

**Server side:**
- **Storage:** an encrypted bucket that's private, keeps no public URLs, and has object-lock or legal-hold support.
- **Keys and access:** private keys in KMS, and the reviewer tool decrypts in memory. Every listen is written to an **audit log** (who, when, which report).
- **Retention:** deletion once a case closes, with the period set in the policy.

## 13. Legal and policy prerequisites (block release)
- [ ] Legal review of recording consent and the lawful basis under the Kenya Data Protection Act 2019. Keep the DPIA on file.
- [ ] Privacy policy and rider terms updated: purpose, retention, access, deletion rights.
- [ ] Driver terms and an in-app notice updated ("Riders may record trips for safety"), with an optional in-car sticker.
- [ ] The retention period and the reviewer access policy written down. An on-call reviewer in place.
- [ ] Play Console: the foreground-service declaration and the Data safety form.

## 14. Dependencies and versions
- **`react-native-nitro-sound`:** pin the **exact** version (0.2.20 at the time of writing). The project is largely maintained with automated tooling, so review its changelog before every bump.
- **`react-native-nitro-modules`:** the library needs **>= 0.36.5**; the app has **0.35.2**, pulled in by `react-native-mmkv` 4.x. Bump it in its own PR first and regression-test MMKV (active-ride persistence and storage).
- **No other JS dependencies.** Crypto, hashing, upload (OkHttp) and scheduling (WorkManager) live in the native module.

## 15. Later: driver side and iOS
- **Captain app:** the same module and backend with `role: "driver"`, auto-record from pickup arrival to drop-off. The rider app must then show "This driver records trips for safety" from an `driver_audio_recording` flag on the ride payload, **before or with** the driver-side launch.
- **iOS:** `UIBackgroundModes: audio`, the red status-bar pill, and an `AVAudioSession` interruption policy for calls. The JS interface stays the same.

## 16. Testing
- **Unit (JS):** the state machine (start, stop, ride end, grace period), the retention selection logic, and building the report payload.
- **Unit (Kotlin):**
  - the encrypt/decrypt round trip with a test key pair;
  - the authenticated data rejects a swapped `seq` or `rideId`;
  - the manifest hash matches the file.
- **Device matrix** (the Samsung A30s plus one Transsion device, Android 11 and 14):
  - [ ] 45-minute trip with the screen off: every chunk is present, with no gaps beyond the rotation gap.
  - [ ] App swiped away mid-recording: recording continues through the foreground service, or is recovered as `interrupted` with its chunks intact.
  - [ ] Process killed (`adb shell am kill`): leftover plaintext is sealed on the next launch.
  - [ ] **Call 999 mid-recording:** the gap is marked `interrupted: call`, and recording resumes after the call.
  - [ ] Storage nearly full: a clean stop and a `storage_full` error shown to the rider.
  - [ ] Airplane mode during upload: it retries and completes once back online.
  - [ ] **No plaintext `.m4a` left** in `filesDir` after sealing, and none in the cache.
  - [ ] The ciphertext can't be decrypted without the private key, and the server-side decryption round trip works.
  - [ ] Battery: under 3% per hour of recording, measured with `dumpsys batterystats`.

## 17. Open questions
1. Should "Record every trip" ship in this version, or only the manual tile?
2. Retention: 7 days on the device, and how long on the server after a case closes?
3. Should the rider be able to delete a recording before the 7 days are up? Recommendation: yes, unless it's attached to an open report.
4. Should an Emergency alert, once incidents are enabled, automatically attach any recording that's running? Recommendation: offer it, with a default of on.
