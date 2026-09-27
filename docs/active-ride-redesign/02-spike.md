# 02 — Transition Spike (Android only)

**Step:** Prompt 2 · **Spike branch:** `spike/active-ride-transition` (worktree at `../mobility-customer-spike`, **not for merge**) · **Scope:** Android only; no iOS in this phase.

## Status

| | Path A: in-place morph | Path B: screen-choreography |
|---|---|---|
| Implemented | ✅ | ✅ |
| Type-checks and lints clean | ✅ | ✅ |
| Android `devDebug` build (`assembleDevDebug`) | ✅ 22 min cold; choreography and teleport native modules compile against RN 0.85.3 | ✅ same APK |
| Release JS bundle (`expo export:embed --dev false`) | ✅ | ✅ (package `exports` resolve under Metro) |
| **On-device measurements** | ⏳ **pending**: needs a physical low-end Android | ⏳ **pending** |

The recommendation at the end is **provisional**. It rests on the code-level findings below. The device runs decide it: fill in the results table, then confirm or flip it.

---

## What was built

Both paths share one map module, `src/spike/activeRideTransition/SpikeMap.tsx`:

- **Production map stack:** `RnMapView` (Google provider, custom style), `MapPolyline` and `SmoothDriverMarker`. The existing `GpsSimulator` feeds `mockRoute` every 2 s, and a toggle drops that to 250 ms for stress tests. This is the same tracking path as production, not a second one.
- **Fixed-size native map.** In both paths the MapView is always rendered at the *expanded* size (full width × expanded height). The compact state only **clips** it in a centred `overflow: hidden` wrapper, so Google Maps never resizes its surface mid-animation (decision #4 in the prompt flow).
- **Compact camera.** A `mapPadding` equal to the crop insets keeps the camera, fit-to-bounds and the Google logo inside the visible crop. After a transition settles, the padding switches, followed by exactly one `fitToCoordinates`.
- **Instrumentation.** An on-screen HUD shows:
  - **Map lifecycle counters:** `mounts` (React mount), `ready` (`onMapReady`) and `loaded` (`onMapLoaded`, which fires on tile loads). A native re-creation or a tile reload shows up as `ready`/`loaded` going above 1.
  - **Frame meter:** a Reanimated `useFrameCallback` on the UI thread. It reports frames, fps, p95 and max frame time, and dropped frames. The vsync interval is estimated from the 10th-percentile frame time, so 90/120 Hz panels are handled.
  - **Path B only:** preparation latency (tap → first animated frame).
  - **Camera drift:** available when "Fit after settle" is off.

**Entry point:** Profile tab → **Spike: Path A** / **Spike: Path B**. `SPIKE_ROUTES_ENABLED` keeps these reachable in release builds.

### Path A: `PathAScreen.tsx`
- One screen, no navigation, and **zero new dependencies**.
- An `Animated.ScrollView` contains the carousel, the map card with an empty measured *slot*, the driver card and the secondary cards. The map lives in an absolute clip container at screen level.
- `progress` (a shared value from 0 to 1) is the single source of truth. The container's frame is interpolated from the slot rect, adjusted live for `scrollY` on the UI thread, to the expanded rect. `borderRadius` goes from 16 to 0.
- The content translates so the driver card lands under the expanded map. The carousel and the card text fade out, and an accent header slides in.
- `withSpring` uses damping 20, stiffness 180 and overshoot clamping. It's interruptible: calling `collapse()` mid-expand springs from the current value.
- A downward pan on the header drives `progress` from 1 toward 0, then settles with velocity handoff.
- Android hardware back collapses when expanded; when compact it falls through to navigation.
- Map gestures are enabled only in the settled `expanded` state.
- HUD actions: Expand/Collapse, **Interrupt** (expand, then collapse after 180 ms), **20 cycles** (records worst p95, total dropped frames and the remount counters), **Fit after settle** toggle and **GPS 250ms**.

### Path B: `PathBScreens.tsx`
- Adds `react-native-screen-choreography@0.6.4` and `react-native-teleport@1.2.2`, both **pinned exactly**.
- `ChoreographyProvider` wraps `NavigationContainer` (`src/navigation.tsx`).
- **Compact route** `SpikePathB`: wrapped in `ChoreographyScreen`. The map lives inside `<SharedElement id="ride-map" groupId="spike.ride">` in the card slot. A `MapClip` child reads `useSharedElementPresentation().presentationProgress` to morph the corner radius.
- **Expanded route** `SpikePathBExpanded`: `presentation: 'containedTransparentModal'`, `animation: 'none'`, transparent `contentStyle`, `gestureEnabled: false`. It renders `<SharedElement.Target>` at the expanded size, and the header and cards reveal from the choreography `progress`.
- **Back:** `useChoreographyNavigation().goBack()`. Hardware back is intercepted by `ChoreographyScreen` (`usePreventRemove`). The header pan uses `useInteractiveTransition` with `useInteractiveGestureLifecycle` (`begin`/`update`/`release`, threshold 0.4).
- The compact screen owns the map. It watches the session phase (`idle → preparing → active → idle`) to drive the frame meter, the settled mode (map interactivity and padding) and the single post-settle fit.

---

## Findings from code (before device runs)

1. **Path B's API has already drifted from the prompt flow.** `SharedElement.Live` / `SharedElement.LiveTarget` no longer exist in 0.6.x. Plain `SharedElement` now moves the real native subtree, and the destination is `SharedElement.Target`. The README says it outright: *"Pre-1.0: minor versions can introduce breaking changes."* The package had 6 releases in the 0.5–0.6 range and was last published 2026-09-25. **This confirms the stability risk in practice, not just on paper.**
2. **Path B's peer dependencies are satisfied.** The `expo-router >= 56.1.1` peer is marked optional, and this app uses `@react-navigation` v7 native-stack, which is supported and validated on 7.x. Reanimated 4.3.1, worklets 0.8.3, screens 4.25.2 and RN 0.85.3 with Fabric all meet the lower bounds. No upgrade is needed.
3. **Path B re-parents a Google MapView at the native level.** On Android, the map draws into its own SurfaceView/TextureView, and detaching and re-attaching that view can recreate the GL surface. The possible results are a black or grey flash, a tile reload, or a lost camera. The `ready` and `loaded` counters exist specifically to catch this. **This is the single biggest unknown, and only a device can answer it.**
4. **Path B changes app-wide structure.**
   - The provider has to sit above the whole `NavigationContainer`.
   - The expanded state has to be a separate route in the same native-stack as the ride screen. In production that's the Home tab's stack.
   - The floating tab bar stays visible over a `containedTransparentModal`.
   - The map owner (the compact screen) must stay mounted.
   - Native swipe-back isn't wired automatically. That doesn't matter on Android, where hardware or predictive back goes through `usePreventRemove`.
5. **Path B makes the post-settle fit more complicated.** The map's ref belongs to the compact route while the map is shown in the expanded route, so settle detection has to go through the session phase. Path A settles in the spring callback directly.
6. **Path A's per-frame cost is one wrapper's layout.** `width`/`height` on the clip wrapper are layout props, so Reanimated commits them to the shadow tree each frame. The map's own size never changes, and `top`/`left` are applied as transforms. That's the main thing to watch in the frame meter. If p95 is over budget, the fallback is transform-only, using the FLIP counter-scale technique. The clip wrapper stays at the expanded size and is animated with `scaleX`/`scaleY`, while the map inside gets the inverse scale so its content isn't distorted. The catch is that the corner radius also scales, so it needs compensating.
7. **Google ToS.** The Google logo must stay visible. In compact mode the crop would hide it at the map's corner. Setting `mapPadding` to the crop insets moves it into the visible area. Both paths need this.
8. **`showsPointsOfInterests` is iOS-only** in react-native-maps (note the library's own spelling). On Android, POIs are hidden by the custom map style (`CUSTOMSTYLE`), which production already uses.

---

## Device protocol (Android)

**Device:** a physical low-end Android (an emulator isn't acceptable), ideally 2–3 GB of RAM, a Helio G- or Snapdragon 4xx-class chip, and Android 12 or later. Record the model and refresh rate.

1. Build a **release** variant of the dev flavor: `cd ../mobility-customer-spike && npx expo run:android --variant devRelease --device`. Dev builds run JS unoptimised, which skews the timings. The spike routes stay reachable in release. If `devRelease` has no signing config, `productionRelease` (the `yarn android:prod` variant) works too. For a quick functional check first, `yarn android` (`devDebug`) is fine, but don't record timings from it.
2. Log in, go to Profile → **Spike: Path A**, wait for `loaded ≥ 1`, and do each of the following:
   - **Expand / Collapse** ×5. Note the p95, max and dropped values from the HUD.
   - **Interrupt** ×3. It should reverse without a jump.
   - **GPS 250ms** on, then expand and collapse ×3. Check that the marker keeps moving smoothly through the transition.
   - **Fit after settle** off, then expand and collapse. The `camera` line should read `unchanged`.
   - **20 cycles.** Afterwards `mounts` and `ready` must still be 1 and `loaded` shouldn't climb per cycle. Note the worst p95 and total dropped frames.
   - **Hardware back** while expanded. It should collapse and stay on the screen. Back again should leave the screen.
   - **Header pan** down, both slow and flicked. Check that it follows the finger and settles in the direction of the velocity.
3. Repeat step 2 for **Spike: Path B**. It has no Interrupt or 20-cycles buttons, so run those manually by tapping Collapse mid-expand and cycling 20 times. Also note `prep` latency.
4. Optionally, cross-check with the Perf Monitor overlay or a Flashlight run (`flashlight measure`) during 20 cycles.
5. Screen-record one expand/collapse per path. Watch frame by frame for a grey or black flash on the map.

## Results

| Metric (target) | Path A | Path B |
|---|---|---|
| Device / refresh rate | | |
| Expand p95 frame time (< 18 ms at 60 Hz) | | |
| Collapse p95 frame time | | |
| Dropped frames per transition | | |
| Worst p95 over 20 cycles | | |
| `mounts` / `ready` after 20 cycles (1 / 1) | | |
| Map flash or tile reload seen in recording (none) | | |
| Camera kept with fit off (unchanged) | | |
| Marker smooth with GPS at 250 ms mid-transition | | |
| Interrupt reverses without a jump | | |
| Hardware back collapses when expanded | | |
| Header pan follows finger and settles with velocity | | |
| Preparation latency (tap → motion) | n/a | |

### Screen recordings
- **Path A:** _pending. Describe: the card's map grows from the slot to full width while the header slides in and the cards slide up; the marker keeps moving; there's no flash._
- **Path B:** _pending. Describe the same, plus any overlay hand-off frame at the start or end._

---

## Recommendation (provisional, pending the device table)

**Path A.** It meets every requirement with zero new dependencies and keeps the map in one parent for its whole life. So flashes, tile reloads and camera loss can't happen by construction. Interruption, velocity handoff and hardware back are all under our direct control.

Path B's real advantages are route semantics (a back-stack entry and deep-linkability) and the library's reveal helpers. For this feature, a param on the ride route and a `BackHandler` cover the first, and the second is a few `interpolate`s.

Against Path B:
- It's pre-1.0, and its API has already broken relative to the prompt flow.
- It re-parents an Android `MapView` natively, which is the highest-risk operation in this design.
- It forces app-wide provider and route-structure changes.

**Switch to Path B only if** the device runs show Path A missing the frame budget, *and* Path B shows `ready = 1`, no flash, and a better p95.

**If Path B is chosen:** keep the exact version pins and wrap the library in one adapter module, so a future breaking minor release touches one file. Reanimated is already on 4.x, so no separate upgrade PR is needed.

## Cleanup
- The spike lives only on `spike/active-ride-transition` and in the worktree `../mobility-customer-spike`. Neither is merged or pushed.
- Remove both when done: `git worktree remove ../mobility-customer-spike && git branch -D spike/active-ride-transition`.
