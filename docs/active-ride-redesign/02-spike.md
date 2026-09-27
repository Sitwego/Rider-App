# 02 — Transition Spike (Android only)

**Step:** Prompt 2 · **Spike branch:** `spike/active-ride-transition` (worktree at `../mobility-customer-spike`, **not for merge**) · **Scope:** Android only.

## Decision: **Path A (in-place morph)**

Both paths were measured on a real low-end phone in a release build, and Path B was tested twice: once as shipped and once with a patch to react-native-maps.

- **Path B as shipped is broken on Android.** Re-parenting the map makes react-native-maps build a brand-new GoogleMap on every re-attach without destroying the old one. The result:
  - about 5 native re-inits per cycle;
  - a **Java heap leak of about 30 MB per cycle, crashing the app with an OutOfMemoryError after about 6 cycles**;
  - **the route and driver marker disappear for good** after the first transition;
  - an interrupted transition can strand the user on a blank screen.
- **The root cause is in react-native-maps, not the choreography library** (see "Root cause" below). A roughly 30-line patch that defers the map's teardown on detach fixes the re-inits, the leak and the lost overlays. With it, Path B is smooth, even slightly smoother than Path A.
- **Path A is still the choice.** It meets every criterion with zero new dependencies. Patched Path B would still mean:
  - carrying a hand-written patch to a native library that affects every map in the app;
  - depending on a pre-1.0 package;
  - 47–515 ms of latency between tap and motion;
  - taps ignored mid-transition;
  - memory growth of +7% over 20 cycles (Path A: +0.15%);
  - app-wide navigation changes.

Path A needs three fixes, all found and verified on the device (see "Carry into Prompt 7").

---

## Test setup

| | |
|---|---|
| Device | **Samsung Galaxy A30s (SM-A307FN)**, Exynos 7904, 4 GB RAM, Android 11, **60 Hz**, 720×1560 px (density 320) |
| Build | `devRelease` (Hermes, minified), installed **side by side** as `com.transli.mobilitycustomer.dev` (the Play Store install was left untouched) |
| Boot | The spike branch boots straight into a spike menu (`SPIKE_BOOT`), with no login |
| Driving | adb taps and swipes. The HUD is read from `uiautomator dump`, never during an animation |
| Map | Production `RnMapView` + `MapPolyline` + `SmoothDriverMarker`, with `GpsSimulator` on `mockRoute` (2 s fixes, or 250 ms in stress runs). The initial camera fit runs only on the *first* `onMapReady`, so a native re-init can't hide camera loss |
| Path B variants | (1) stock react-native-maps 1.27.2; (2) the same build with a deferred-detach patch to its Android `MapView.java` (see "Root cause") |
| Metrics | **Frames:** UI-thread `useFrameCallback` deltas (vsync estimated from the median delta). **Progress trace:** min/max and the largest single-frame step. **Map lifecycle:** `mounts` (React), `ready` (`onMapReady`), `loaded` (`onMapLoaded`). **Memory:** `dumpsys meminfo` PSS |

Both paths render the map at a **fixed native size** (the expanded frame) and only clip it, so the Google map surface never resizes mid-animation.

## Results

| Metric (target) | **Path A**, final config | **Path B** as shipped (stock react-native-maps 1.27.2) | **Path B + maps patch** |
|---|---|---|---|
| Expand/collapse p95 frame time (< 18 ms) | ✅ **16.7–16.9 ms** in almost every run | Collapse 16.8 ms · expand 16.8–33.5 ms | ✅ 16.7–17 ms |
| 20 cycles: worst frame, total dropped | ✅ 33.3 ms, **23 dropped / 40 transitions** | ❌ **cannot complete: OutOfMemoryError crash at about cycle 6** | ✅ 33.5 ms, **9 dropped / 40 transitions** |
| **Native map re-inits** (`ready` stays 1) | ✅ ready 1 · loaded 1 | ❌ ready +4–5 and loaded +3 per cycle (React `mounts` stays 1) | ✅ ready 1 · loaded 1 |
| **Memory** | ✅ 20 cycles: **+0.15%** PSS; Java heap flat (28–48 MB, GC noise) | ❌ **Java heap 37 → 187 MB in 5 cycles** (~30 MB/cycle); PSS +69% | ⚠️ 20 cycles: **+7.3%** PSS (429 → 460 MB); Java heap 37 → 47 MB; about +2 MB native per cycle |
| Route and driver marker kept | ✅ | ❌ **gone after the first transition**, permanently | ✅ |
| Camera kept (fit disabled) | ✅ `unchanged` | ✅ `unchanged`: react-native-maps' saved state restores it. *(Corrects an earlier draft: the reset we saw came from our own `onMapReady` handler re-fitting after each native re-init. Production `RideMapView` also calls `setCamera` in `onMapReady`, so it would reset too.)* | ✅ `unchanged` |
| GPS at 250 ms during a transition | ✅ no extra drops | ❌ first expand: **266 ms max frame, 34 dropped** (markers lost afterwards) | ✅ 0–1 dropped |
| Tap → first motion | ✅ same frame | ❌ 246–473 ms | ⚠️ **47–515 ms** (median ~90 ms) |
| Interrupt with a tap mid-expand | ✅ reverses at p ≈ 0.76–0.80, smooth | ❌ tap **ignored** (touches blocked during preparation and transition) | ❌ same |
| Interrupt with hardware back mid-expand | ✅ (same as a tap) | ❌ once **left a blank screen** (both routes faded out) until another tap | ✅ reverses at p ≈ 0.88–0.93 and ends on compact |
| Hardware back while expanded | ✅ 0 dropped; a second back leaves the screen | ⚠️ **533 ms max frame, 63 dropped** | ✅ 0 dropped |
| Header drag | ✅ short springs back, long collapses | ✅ short springs back, long collapses (one 0.70 progress jump) | ✅ short springs back (9 dropped under the finger), long collapses |
| First expand after cold start | ✅ 0 dropped in 3 of 3 (one 83 ms hitch on the first launch after install) | 50 ms max, 5 dropped | 150 ms max, 13 dropped |

### What the screenshots show
- **Path A, compact:** the map crop sits in the card with the green route, the car and the Google logo visible (bottom-left anchor).
- **Path A, expanded:** the accent header shows "Driver arriving in 5 min", the full-width map is fitted to the whole route with the car on it, and the driver card sits directly below. It's the same map instance.
- **Path B as shipped, expanded:** the map shows a different area with **no route and no car**. It's still like that 8 s later. Back in compact, the thumbnail has no route or car either. After a back-key interrupt, one run showed an empty screen with only the HUD until another tap.
- **Path B + maps patch:** it looks identical to Path A in both states (route, car and fit intact) through 25+ cycles.

## Root cause of Path B's breakage (react-native-maps, Android)

The problem is in `node_modules/react-native-maps/android/src/main/java/com/rnmaps/maps/MapView.java` (1.27.2):

1. **`onDetachedFromWindow`** saves the map state, then runs `onPause()` and `onStop()`, moves `features` into `savedFeatures`, and clears them.
2. **`onAttachedToWindow`**, when a saved state exists, calls `super.onCreate(savedMapState)`, then `onStart()` and `onResume()`, then `getMapAsync(...)` to re-add `savedFeatures`.
   - `onCreate` builds a **new GoogleMap, but the old one is never `onDestroy`'d**. That's the ~30 MB-per-cycle Java-heap leak and the OutOfMemoryError.
3. **`react-native-teleport` detaches and re-attaches the view several times per transition** (host → overlay → host). A second detach that lands before the async `getMapAsync` restore runs `savedFeatures = new ArrayList<>(features)` on the *already-cleared* list. **The markers and polylines are then gone for good.**

**The patch.** A spike-quality patch, kept at `src/spike/activeRideTransition/react-native-maps-deferred-detach.diff` on the spike branch:
- `onDetachedFromWindow` now only schedules the teardown 500 ms later.
- `onAttachedToWindow` cancels a pending teardown and keeps the live GoogleMap.
- `doDestroy` cancels it too.

A real unmount still tears down, just 500 ms later.

**It was tested only in this spike.** Since it changes every `MapView` in the app, before any real use it would need testing across tab switches, app background and foreground, screen unmounts, and the pre-booking map in `RidesFairEstimates`.

**This is also a candidate upstream issue for react-native-maps.** Any re-parenting of a map view (portals, teleport, some list recyclers) would trigger it.

---

## Carry into Prompt 7

These three are defects the first spike build hit on the device. Each fix was verified on the device.

1. **Anchor the clipped map bottom-left, and give every fit its own padding. Never switch `mapPadding` right before a fit.**
   - *What happened:* the first build switched `mapPadding` at settle and called `fitToCoordinates` on the next frame. The expanded camera stayed at the compact zoom.
   - *Cause:* on Android, react-native-maps' `fitToCoordinates` adds whatever *native* base padding is current when it's called (`MapView.java`, `appendMapPadding`), and the prop update hadn't landed yet.
   - *Fix:* anchor the fixed-size map to the clip's **bottom-left**, so the Google logo, at bottom-left with zero padding, is always inside the compact crop (Maps ToS). Then pass an explicit `edgePadding` per mode: compact is `top = mapH − slotH + m`, `right = mapW − slotW + m`; expanded is `m` on all sides.
2. **Don't use `overshootClamping` on a spring that can be reversed.**
   - *What happened:* with `{damping 20, stiffness 180, overshootClamping: true}`, 2 of 3 interrupts **snapped** `progress` from 0.86 to 0 in one frame.
   - *Fix:* use near-critical damping instead: `{damping 26, stiffness 180, mass 1}` (ζ ≈ 0.97, no visible overshoot). Interrupts are smooth now.
   - *Side effect:* the rest callback now fires about 800 ms after start, although the visible motion is done by about 300 ms. In Prompt 7, trigger the post-settle fit and the interactive-map switch at "visually settled" (for example `progress` within 0.01 of the target), not only on the spring's completion.
3. **Keep the collapse gesture enabled through the collapse it starts.**
   - *What happened:* gating `Gesture.Pan().enabled(state === 'expanded')` on JS state cancelled slow drags after about 10 px, because `onStart` sets `collapsing` and the re-render disables the gesture.
   - *Fix:* enable it for `state !== 'compact'`. That also lets a finger catch an in-flight animation.

Other notes for later prompts:
- **Prompt 6, POIs:** the thumbnail and expanded map show POIs (Shell, schools). `showsPointsOfInterests` is iOS-only, so hiding them on Android needs a POI rule in `CUSTOMSTYLE`, or a compact-only style.
- **Prompt 6, marker size:** the production car marker is large next to a roughly 160 dp thumbnail and gets clipped at the crop edge. Consider a smaller marker in compact mode, or padding sized to the marker.
- **Prompt 7, flick gestures:** adb-injected "flicks" end with near-zero release velocity, so the velocity projection needs a human-finger check.
- **Prompt 11, measurement:** the frame meter in `metrics.ts` and the adb driver script in the scratchpad (`spike.sh`: `tap_text`, `hud`) are reusable for the C7–C11 contract runs.

## Why not patched Path B?
Patched, Path B is viable and has slightly better frame numbers than Path A. It still loses on every other axis:
- **Maintenance.** We'd carry a hand-written native patch to react-native-maps that changes lifecycle behaviour for every map in the app. Every react-native-maps upgrade would need it re-verified, or dropped if upstream fixes it.
- **Maturity.** `react-native-screen-choreography` is pre-1.0, and its API has already drifted from the prompt flow (`SharedElement.Live` / `LiveTarget` no longer exist in 0.6.x).
- **Responsiveness.** There's 47–515 ms of preparation between tap and motion, and taps are ignored during the transition (only the back key can reverse it). Path A responds in the same frame and can be interrupted by any input.
- **Memory.** +7.3% over 20 cycles, against Path A's +0.15%. This was not investigated further.
- **Structure.** It needs a provider above `NavigationContainer`, a transparent-modal route, an owner screen that stays mounted, and settle detection from the session phase or `onTransitionEnd`. A cancelled session's brief `cancelling` phase is easy to miss, as the spike harness did.

Its real advantage, route semantics (a back-stack entry and deep links), can be had in Path A with a route param and `BackHandler`.

## What was built (spike branch)
- `src/spike/activeRideTransition/`:
  - `SpikeMap.tsx`: the shared fixed-size map, with `fit(mode)`.
  - `PathAScreen.tsx`: the morph. `progress` is the single source of truth. The clip container follows the scroll-adjusted slot on the UI thread; the spring and header pan use velocity handoff; hardware back and the HUD test actions are wired.
  - `PathBScreens.tsx`: choreography `SharedElement` / `SharedElement.Target`, a transparent-modal route, and interactive back through `useInteractiveGestureLifecycle`.
  - `metrics.ts`: the frame meter and progress trace.
  - `SpikeNavigator.tsx`: the pre-auth spike menu.
- Pinned versions: `react-native-screen-choreography@0.6.4` and `react-native-teleport@1.2.2`. Both compile and run against RN 0.85.3 with the New Architecture.
- Dev flavor `applicationIdSuffix ".dev"` (spike only), so it installs side by side. Firebase already has a `.dev` client, and the Maps key accepts it.
- The spike worktree's `node_modules/react-native-maps` currently holds the **patched** `MapView.java`. It's applied by hand, not through patch-package, so any `yarn install` in the worktree reverts it. The APK built from stock react-native-maps is saved in the session scratchpad.

## Cleanup
- On the phone: `adb uninstall com.transli.mobilitycustomer.dev`. That removes only the spike app; the Play Store app is separate.
- In the repo: `git worktree remove ../mobility-customer-spike && git branch -D spike/active-ride-transition`. Neither has been pushed or merged.
- Keep the spike until Prompt 7 is done if you want to re-run its measurements against the real implementation.
