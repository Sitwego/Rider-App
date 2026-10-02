# 03 — Testing the active-ride v2 screen

The dev test panel and the mock ride were removed in `67f98ee` to keep the shipped app clean. This page covers how to test with real rides, how to bring the mock tooling back (or rewrite it) if something needs debugging, and how the side-by-side device builds and the adb driver worked.

## 1. Real rides on the local dev server

`active_ride_v2` is **on by default**: every new ride uses the v2 screen. The layout is latched per ride, so changing the flag mid-ride has no effect until the next ride.

Book a ride from the rider app and accept it in the captain app, then check:

- [ ] **Accept:** the home tab switches to the v2 page with the promo banner, the status card and its live map thumbnail, the driver card, fare, route and trip actions. The old sheet and its floating Navigate/OTP row do **not** appear.
- [ ] **Live map:** the real route line (driver → pickup before the trip, pickup → destination during it) and the driver marker moving on the thumbnail. Tap the card to expand: the map follows the car. Collapse with back, the chevron, or a header drag.
- [ ] **Arrived:** "Your driver has arrived", with the waiting timer running.
- [ ] **Start trip:** "On the way to …", with the OTP and Cancel gone and the Emergency button on the expanded map.
- [ ] **End trip:** back on the home tab, with the rating screen opening.
- [ ] **Cancel** before the trip starts: the reason sheet, then the request reaches the backend, then back to idle.
- [ ] **Call driver** with the real phone number, and the **driver photo** loading.
- [ ] **Promo:** book with a promo code. The fare card shows what the rider pays, the full fare struck through and "Promo applied · −KES n". The fare-details sheet shows the Fare and Promo discount lines.
- [ ] **Safety:** the Emergency button and the "Sitwego Safety" row open the safety sheet. Share trip status opens the share sheet. **Call 999 opens the dialer — don't place the call.**
- [ ] **Flag off (fallback):** set `active_ride_v2` to `false` in the `feature_flags` MMKV store before a ride. That ride should use the old map + sheet.

## 2. Bringing the mock ride back

**Fastest:** `git revert 67f98ee`. That restores the Profile-screen dev panel (*Developer · Active ride*: the v2 toggle, Start mock ride / Start mock ride (promo), and stepping through phases) along with its wiring.

**Selective:** `git checkout 74ee836 -- src/ui/activeRideV2/dev`. Then re-add the three wiring points that `67f98ee` removed:
1. `{__DEV__ && <ActiveRideDevTools />}` in `RiderProfileScreen.tsx`, above the Actions row.
2. The `isMockRideId(activeRideId)` early return in `useLocationUpdates` (`src/providers/activeRideHooks.ts`).
3. `setActiveRideV2Enabled` and `useActiveRideV2Enabled` in `src/ui/activeRideV2/flags.ts`. The setter writes `featureFlagStorage`'s `active_ride_v2`; the hook subscribes with `addOnValueChangedListener`.

**Rewriting it from scratch** — what the mock has to do and why:
- **Feed the real store.** Dispatch `SET-ACTIVE-RIDE` / `UPDATE-ACTIVE-RIDE` on `useActiveRide().setActiveRideState`, so the real screens, gate and sheet logic run unchanged.
- **Use an id starting with `mock-`** and have `useLocationUpdates` skip it. Otherwise `startWatchingLocationChanges` starts the native gRPC stream and foreground service for a ride that doesn't exist.
- **Set `should_persist: false` on every dispatch,** so the mock never reaches the `active_ride` MMKV store and a crash or restart doesn't resurrect it.
- **Build the fixture from `src/tracking/testing/mockRoute.ts`.** The first half is the driver → pickup leg (`ride_polyline.driver_to_pickup_polyline`, `{latitude, longitude}` points). The second half is the trip, as `p1` in `[lng, lat]` tuples. For promo testing, add `promotion: { promotion_id, discount_amount: 100, discounted_fare: 540 }` with `fare: 640`. The figures must add up, or the screen shows the full fare.
- **Drive the driver with the existing `GpsSimulator`** (`src/tracking/testing/GpsSimulator.ts`, 14 m/s, 2 s fixes). Each fix dispatches `driver_location` plus a decreasing `estimated_duration_to_pickup` (or `estimated_duration` once on trip), computed from `routeLength - currentProgress`.
- **Phases:**
  - `Accepted` → `Arrived` with `actual_arrival_time: Date.now()`;
  - → `Inprogress` with `ride_start_time` (the reducer snaps `frozen_wait_elapsed`);
  - → `REMOVE-RIDE`.
- **Start it from the Home tab, or switch there immediately.** With the flag **off**, starting a ride while Home isn't visible crashes the old layout. That's the pre-existing react-native-maps `applyBaseMapPadding` null-map bug noted in PR #4.

## 3. Side-by-side test builds (device or emulator)

These are local-only tweaks, so **never commit them.** They were used in a throwaway worktree (`git worktree add --detach ../mobility-customer-verify feat/active-ride-redesign`), with the ignored config copied in: `.env*`, `android/gradle.properties`, `android/local.properties`, and both `google-services.json` files.

1. **Install next to the Play Store app:** in `android/app/build.gradle`, add `applicationIdSuffix ".dev"` to the `dev` product flavor. Firebase already has a `.dev` client, and the Maps key accepts it.
2. **Skip login** (Firebase auth won't accept the `.dev` build): in `src/navigation.tsx`, change `{token ? <MainApp /> : <BaseAuthNavigator />}` to `{token || true ? <MainApp /> : <BaseAuthNavigator />}`. API calls then fail with 401s, which only affects real data.
3. **Show the dev panel in a release build** (only if it's restored): change `{__DEV__ && <ActiveRideDevTools />}` to `{true && …}`.

```bash
cd android
./gradlew assembleDevRelease                                          # phone (ARM)
./gradlew assembleDevRelease -PreactNativeArchitectures=x86_64        # emulator
adb install -r "C:/<worktree>/android/app/build/outputs/apk/dev/release/app-dev-release.apk"
adb shell pm grant com.transli.mobilitycustomer.dev android.permission.ACCESS_FINE_LOCATION
adb shell pm grant com.transli.mobilitycustomer.dev android.permission.ACCESS_COARSE_LOCATION
adb emu geo fix 36.6549 -1.2813   # emulator GPS onto the mock route (lng lat)
```

**Build times on this machine:** a cold release build takes about 20–37 min. JS-only rebuilds take about 4–10 min. The x86_64 emulator build is separate from the ARM one.

## 4. Driving the UI over adb

`docs/active-ride-redesign/tools/adb-ui-driver.sh` provides `tap_text`, `find_node`, `dump`, `shot`, `hud` and `app_alive`. Usage is documented in the file. Lessons from using it:
- **The UI dump includes off-screen views.** That covers a screen under a transparent modal and pager pages composed beyond the viewport. Judge what's *visible* from screenshots.
- **Screenshots are too slow for animations.** A screencap takes about 0.5 s. Frame timing came from an in-app frame meter instead (see below).
- **Never tap "Call 999" in automated runs.**

## 5. The transition spike harness

The Path A/B spike — the HUD with its frame meter (UI-thread frame deltas, p95, dropped frames), the progress trace and the map lifecycle counters — lives on the local tag **`archive/spike-active-ride-transition`** (not pushed). `git checkout archive/spike-active-ride-transition` brings it back; it boots straight into a spike menu.

The react-native-maps fix for Path B is preserved in `react-native-maps-deferred-detach.diff`, in this folder.

The frame meter is the piece worth reusing for perf contract runs (C7–C11).
