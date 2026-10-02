# Active Ride Redesign — Standing Context

This is the standing context for the active-ride redesign prompt flow (Prompt 0). Every later step references it.

```
You are working in the Sitwego rider app (mobility-customer), a React Native / Expo app on
the New Architecture (Fabric) with Hermes, Reanimated, and a Rust backend that streams ride
updates. Brand: background #0F2424, accent #6b9f77.

Work ONLY on branch `feat/active-ride-redesign` (create it from the latest main if missing).
Never push to main. Commit in small, reviewable commits with conventional messages
(feat:, refactor:, test:, chore:).

House rules:
- Extend before creating. Search for existing components, hooks, stores, theme tokens and
  map utilities before writing new ones. Reuse the existing real-time tracking pipeline
  (snap-to-polyline Nitro module, useAnimatedProps marker animation, replay/mock harness,
  REALTIMETRACKING.md Smoothness Contract) — do not build a second tracking path.
- Treat existing behaviour as a contract. The current active-ride flow (map + TrueSheet)
  must keep working unchanged when the feature flag `active_ride_v2` is OFF.
- Scope changes narrowly. No drive-by refactors outside the files this task needs.
- One MapView instance for the active ride at all times. Never mount a second map for the
  thumbnail.
- Animations run on the UI thread (Reanimated shared values / worklets). No setState per
  frame. No animating MapView width/height directly.
- TypeScript strict. No `any` in new code.
- Before writing code in any step, state which files you'll touch and why. After the step,
  list what changed and how to verify it on device.

Reference screens (attached earlier): a Blinkit-style active-order page — top promo
carousel, a card with "Arriving in 5 minutes" + small live map (route polyline + rider
marker + expand icon), a delivery-partner card with call button and status message,
secondary cards. Tapping the map expands it to a large map under a green status header
with a collapse icon; the same cards continue below.
```

## Audit corrections

The Prompt 1 audit (see [01-audit.md](./01-audit.md)) found that some of the context above doesn't match the code. Where they differ, go by the code.

| Context says | Reality in the repo |
|---|---|
| "snap-to-polyline Nitro module" | There is no Nitro module for this. Snapping is pure TypeScript in `src/tracking/RouteSnapper.ts`, part of the `src/tracking/` pipeline. Native polyline math for ETA and distance lives in `GeoEtaUtils.java` (Android). `react-native-nitro-modules` is installed only because `react-native-mmkv` v4 depends on it. |
| "useAnimatedProps marker animation" | The marker is a `react-native-maps` `MarkerAnimated`. It's driven by legacy `Animated.Value.setValue` from one shared rAF loop (`src/hooks/useVehicleAnimation.ts` and `src/components/VehicleMarker.tsx`). There is no Reanimated `SharedValue` for driver position. |
| "REALTIMETRACKING.md Smoothness Contract" | The doc is `docs/Real_Time_Vehicle_Tracking.md`. It has no numbered contract, but its rules are summarized as C1–C6 in the audit, so the v2 clauses in Prompt 11 can continue from C7. |
| "Rust backend that streams ride updates" | The backend is Rust. On the client, streams arrive over gRPC through native Java services (`RideEventStreamer`, `RpcStreamingService`, `OfferingDriverEvent`) that emit JS events. |
| "Firebase Remote Config" | `@react-native-firebase/remote-config` isn't installed. Only `app`, `auth` and `messaging` are. |
| "existing i18n layer" | There isn't one. All strings are hardcoded English. |
| "accent #6b9f77" | This colour isn't in the theme. Accents use the generated `green_*` scale in `src/ui/theme/utils.ts`. |
