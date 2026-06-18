# Real-Time Vehicle Tracking & Animation

Smooth, production-grade vehicle marker animation for the rider app. GPS
updates arrive roughly every 2 seconds; at 50 km/h that is ~28 m per
update, so rendering raw fixes directly produces visible jumps. This
system keeps the marker moving continuously at the display refresh rate
between updates, with no jumps, stutter, or drift.

> **Platform note.** The original spec targeted web React with
> `@react-google-maps/api`. This app is React Native (Expo) with
> `react-native-maps`, so the architecture was adapted: the entire
> engine (`src/tracking/`) is **pure TypeScript with zero RN/Expo/Google
> dependencies** — the parts of `google.maps.geometry.spherical` it
> needs (`computeDistanceBetween`, `computeHeading`, `interpolate`,
> polyline decoding) are implemented in `src/tracking/geo.ts`. Only the
> thin render layer (`VehicleMarker.tsx`) touches `react-native-maps`.
> A future web build could reuse the whole engine unchanged.

## Pipeline

```
GPS update (every ~2 s)
  → RouteSnapper            snap noisy fix onto the polyline
  → RouteProgressCalculator coordinates ⇄ meters-from-route-start
  → InterpolationEngine     continuous progress between updates
  → PredictionEngine        decaying dead-reckoning while updates are late
  → CorrectionEngine        time-scaled exponential error smoothing
  → BearingInterpolator     shortest-path heading smoothing
  → AnimationController     one shared rAF loop, delta-time based
  → VehicleMarker           imperative native marker updates
```

**Core principle:** never animate between raw GPS coordinates. The
polyline is the single source of truth; all motion happens on a 1-D
*route progress* axis (meters from route start) and is converted back
to lat/lng only at render time. That is what makes the marker follow
curved roads instead of cutting corners.

## Files

| File | Responsibility |
| --- | --- |
| `src/tracking/geo.ts` | Spherical geometry + encoded-polyline decoding (pure, dependency-free) |
| `src/tracking/RouteProgressCalculator.ts` | `prepareRoute` (cumulative distances, computed once), `progressToLatLng`, `headingAtProgress` — O(log n) lookups |
| `src/tracking/RouteSnapper.ts` | Windowed nearest-segment search (O(k)) with full-scan fallback for re-routes |
| `src/tracking/InterpolationEngine.ts` | Progress as a continuous function of time (no fixed-step queues) |
| `src/tracking/PredictionEngine.ts` | Dead-reckoning with linear speed decay and a hard timeout |
| `src/tracking/CorrectionEngine.ts` | `alpha = 1 − e^(−rate·dt)` smoothing — frame-rate independent |
| `src/tracking/BearingInterpolator.ts` | Shortest-path rotation (350°→10° goes +20°, never −340°) |
| `src/tracking/AnimationController.ts` | Single shared rAF loop; delta clamping; AppState pause/resume |
| `src/tracking/VehicleTracker.ts` | Per-vehicle orchestration: validation, jitter filter, off-route fallback, large-error recovery |
| `src/tracking/VehicleStateManager.ts` | `Map<vehicleId, tracker>`, eviction, safe iteration (100+ vehicles) |
| `src/hooks/useVehicleAnimation.ts` | React entry point; fans frames out via callbacks, never state |
| `src/components/VehicleMarker.tsx` | `MarkerAnimated` driven imperatively via `Animated.Value.setValue` |
| `src/components/RnMaps/SmoothDriverMarker.tsx` | Single-driver wrapper used by `RiderHomeScreen` |

## How a frame is produced

Each `getFrame(dt, now)` call (60 Hz, one shared loop for all vehicles):

1. **Estimate.** Inside the current interpolation segment (built from the
   last two accepted fixes, duration = measured update gap), progress is
   interpolated linearly. Past the segment end, the PredictionEngine
   extrapolates at the last known speed, decaying linearly to zero as the
   gap approaches `predictionTimeoutMs` (10 s). Past the timeout the
   position freezes and the vehicle is flagged `isStale` (the marker dims).
2. **Correct.** The displayed progress chases that estimate with
   exponential smoothing, `alpha = 1 − exp(−rate·dt)`. Deriving alpha from
   delta time keeps correction identical on 60/90/120 Hz displays.
3. **Steer.** Target heading comes from route geometry at the displayed
   progress (never from noisy GPS heading while on-route), smoothed along
   the shortest rotation path. Heading only updates while moving, so the
   icon doesn't spin at a red light.
4. **Render.** Progress → lat/lng via the precomputed route model, pushed
   to the native marker through `Animated` setValue — zero React renders.

## GPS ingestion rules

- **Out-of-order:** updates older than `lastGpsTimestamp` are discarded.
- **Jitter:** movement `< 3 m` while speed `< 0.5 m/s` freezes motion but
  refreshes timestamps, so a parked driver never goes stale or creeps.
  Genuinely slow movement passes the filter (speed check).
- **Speed:** taken from the source when provided, otherwise measured from
  successive snapped progresses and blended (0.6 new / 0.4 old).
- **Large error (> 100 m):** one discrete jump (re-seed at the snapped
  fix) instead of a long, visibly wrong correction glide.
- **Off-route (> 50 m for 3 consecutive fixes):** the snapper's full-scan
  fallback has already failed, so the tracker switches to smoothed raw
  lat/lng animation and flags `isOffRoute` until either a fix lands back
  on the route (hard re-sync) or a recalculated route arrives via
  `setRoute()` (re-snap, recompute progress/length, rebuild state).

All thresholds live in `DEFAULT_TRACKER_CONFIG` (`src/tracking/types.ts`)
and can be overridden per `useVehicleAnimation({ config })`.

## Usage

Single driver on the active-ride map (already wired in
`RiderHomeScreen.tsx` via `SmoothDriverMarker`):

```tsx
<SmoothDriverMarker
  route={fullRidePolyline}   // static p1 route — not the shrinking remainder
  driverPoint={latestFix}    // ride_polyline.from_to[0] from locationChange
/>
```

Multi-vehicle (e.g. nearby-drivers view):

```tsx
const { setVehicleRoute, ingestGpsUpdate, subscribeVehicle, removeVehicle } =
  useVehicleAnimation({ evictAfterMs: 60_000 });

// on socket message:
setVehicleRoute(msg.driverId, msg.encodedPolyline); // string or LatLng[]
ingestGpsUpdate(msg.driverId, {
  latitude: msg.lat,
  longitude: msg.lng,
  timestamp: msg.ts,
  speed: msg.speedMps,
});

// render:
<VehicleMarker
  vehicleId={driverId}
  subscribe={subscribeVehicle}
  initialCoordinate={firstKnownFix}
/>
```

## Design decisions

- **Progress axis, not coordinates.** 1-D math is cheaper, clamping to
  `[0, routeLength]` is trivial, and route geometry is honored for free.
- **Continuous interpolation, not position queues.** A pre-generated
  fixed-step queue assumes a fixed frame rate; evaluating progress as a
  function of time works identically at any refresh rate.
- **Lag-by-one-update.** Each segment animates *toward* the latest fix
  over one update interval, so the marker runs ~2 s behind reality.
  This is the standard ride-hailing trade: a smooth, truthful trail
  beats a jumpy real-time one, and prediction hides late packets.
- **One shared rAF loop.** Per-vehicle loops multiply scheduler overhead
  and drift out of phase; one loop iterating a `Map` scales to 100+
  vehicles. The loop self-stops with zero subscribers and pauses on
  AppState background (RN's `visibilitychange`), re-basing its clock on
  resume so there is never a giant delta-time spike.
- **Refs over state.** Per-frame data flows through callbacks and
  `Animated.setValue`; React renders each marker once per lifecycle.
  `tracksViewChanges` is disabled after the icon loads so Android stops
  re-capturing the marker bitmap.
- **Snapping in a local planar frame.** Segment projection runs in an
  equirectangular frame centered on the fix — sub-meter accurate at
  segment scale, far cheaper than spherical math in the hot loop, with
  windowed search (O(k)) keyed off the last known progress.

## Tests

`yarn test` runs 64 unit tests (`src/tracking/__tests__/`, jest +
ts-jest, plain Node — no native mocks): geometry, route model, snapping,
the four engines, the shared loop, the full tracker pipeline (smoothness,
prediction, staleness, jitter, out-of-order, large-error recovery,
off-route fallback, route replacement) and the state manager.
