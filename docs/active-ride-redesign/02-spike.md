# 02 — Transition Spike (Android only)

**Step:** Prompt 2 · **Spike branch:** `spike/active-ride-transition` (worktree at `../mobility-customer-spike`, **not for merge**) · **Scope:** Android only.

## Decision: **Path A (in-place morph)**. Path B is rejected.

Both paths were measured on a real low-end phone in a release build. On Android, **Path B re-creates the native Google map every time it re-parents it**:
- `onMapReady` fired about 4 times and tiles reloaded about 3 times per expand/collapse cycle.
- After the first transition, **the route polyline and driver marker vanished for good** (screenshots below).
- The camera fit stopped applying.
- Every tap waited 250–385 ms before any motion.
- Hardware back stalled for 533 ms.

That breaks the core requirement: one live map with its camera, tiles and overlays intact. Path A meets every acceptance criterion after three fixes that the spike found and verified (see "Carry into Prompt 7").

---

## Test setup

| | |
|---|---|
| Device | **Samsung Galaxy A30s (SM-A307FN)**, Exynos 7904, 4 GB RAM, Android 11, **60 Hz**, 720×1560 px (density 320) |
| Build | `devRelease` (Hermes, minified), installed **side by side** as `com.transli.mobilitycustomer.dev` (the Play Store install was left untouched) |
| Boot | The spike branch boots straight into a spike menu (`SPIKE_BOOT`), with no login |
| Driving | adb taps and swipes. The HUD is read from `uiautomator dump`, never during an animation |
| Map | Production `RnMapView` + `MapPolyline` + `SmoothDriverMarker`, with `GpsSimulator` on `mockRoute` (2 s fixes, or 250 ms in stress runs) |
| Metrics | **Frames:** UI-thread `useFrameCallback` deltas (vsync estimated from the median delta). **Progress trace:** min/max and the largest single-frame step. **Map lifecycle:** `mounts` (React), `ready` (`onMapReady`), `loaded` (`onMapLoaded`). **Memory:** `dumpsys meminfo` PSS |

Both paths render the map at a **fixed native size** (the expanded frame) and only clip it, so the Google map surface never resizes mid-animation.

## Results

| Metric (target) | **Path A**, final config | **Path B**, choreography 0.6.4 |
|---|---|---|
| Expand/collapse p95 frame time (< 18 ms) | ✅ **16.7–16.9 ms** in almost every run | Collapse ✅ 16.8 ms · expand 16.8–33.5 ms |
| Dropped frames per transition | ✅ 0 in most runs, occasionally 1 | Expand 1–5, collapse 0–1 |
| 20 cycles: worst p95, total dropped | ✅ 33.3 ms, **23 dropped over about 1,840 frames (1.25%)** | not run (disqualified) |
| **Map re-inits over 20 cycles** (`ready` stays 1) | ✅ **mounts 1 · ready 1 · loaded 1** | ❌ **`ready` 1 → 28, `loaded` 1 → 22 after 7 cycles**. React `mounts` stays 1: the *native* map is re-created on each re-parent |
| Route and driver marker kept | ✅ | ❌ **Gone after the first transition, in both compact and expanded** |
| Camera kept (fit disabled) | ✅ `unchanged (-1.22582,36.67281 z11.62)` across expand and collapse | ❌ Reset by each native re-init |
| Location updates mid-transition (GPS at 250 ms) | ✅ no extra drops (0–1 per transition) | not reached |
| Interrupt (collapse 180 ms into expand) | ✅ reverses at p ≈ 0.76–0.80, largest step 0.12–0.27 (same as a normal expand) | not tested (disqualified) |
| Tap → first motion | ✅ same frame | ❌ **246–385 ms** of preparation |
| Hardware back while expanded | ✅ collapses (292 ms, 0 dropped); a second back leaves the screen | ⚠️ collapses, but **533 ms max frame, 63 dropped** |
| Header pan | ✅ a slow short drag springs back, a slow long drag tracks and collapses | not tested |
| First expand after cold start | ✅ 0 dropped in 3 of 3 cold starts. The first launch after install hitched once (83 ms max), which looks like one-time ART/shader warm-up | 50 ms max, 5 dropped |
| Memory over 20 cycles (±5%) | ✅ 390.8 → 391.4 MB PSS (**+0.15%**) | n/a |

### What the screenshots show
- **Path A, compact:** the map crop sits in the card with the green route, the car and the Google logo visible (bottom-left anchor).
- **Path A, expanded:** the accent header shows "Driver arriving in 5 min", the full-width map is fitted to the whole route with the car on it, and the driver card sits directly below. It's the same map instance.
- **Path B, expanded:** the map shows a different area with **no route and no car**. It's still like that 8 s later. Back in compact, the thumbnail has no route or car either.

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

## Why not Path B, even with a workaround?
The failure is in the native layer: re-parenting through `react-native-teleport` detaches the Google `MapView` from its window, which re-initialises the `GoogleMap`. React-side markers aren't re-added, and nothing JS can do repairs the camera or tiles in time. Beyond that:
- It's pre-1.0, and its API already drifted from the prompt flow (`SharedElement.Live` / `LiveTarget` no longer exist in 0.6.x; plain `SharedElement` now moves the real subtree).
- It needs app-wide structure changes: a provider above `NavigationContainer`, a transparent-modal route, and a mounted owner screen.
- Every transition carries 250–385 ms of preparation latency.

Its advantage, route semantics, can be had in Path A with a route param and `BackHandler`.

## What was built (spike branch)
- `src/spike/activeRideTransition/`:
  - `SpikeMap.tsx`: the shared fixed-size map, with `fit(mode)`.
  - `PathAScreen.tsx`: the morph. `progress` is the single source of truth. The clip container follows the scroll-adjusted slot on the UI thread; the spring and header pan use velocity handoff; hardware back and the HUD test actions are wired.
  - `PathBScreens.tsx`: choreography `SharedElement` / `SharedElement.Target`, a transparent-modal route, and interactive back through `useInteractiveGestureLifecycle`.
  - `metrics.ts`: the frame meter and progress trace.
  - `SpikeNavigator.tsx`: the pre-auth spike menu.
- Pinned versions: `react-native-screen-choreography@0.6.4` and `react-native-teleport@1.2.2`. Both compile and run against RN 0.85.3 with the New Architecture.
- Dev flavor `applicationIdSuffix ".dev"` (spike only), so it installs side by side. Firebase already has a `.dev` client, and the Maps key accepts it.

## Cleanup
- On the phone: `adb uninstall com.transli.mobilitycustomer.dev`. That removes only the spike app; the Play Store app is separate.
- In the repo: `git worktree remove ../mobility-customer-spike && git branch -D spike/active-ride-transition`. Neither has been pushed or merged.
- Keep the spike until Prompt 7 is done if you want to re-run its measurements against the real implementation.
