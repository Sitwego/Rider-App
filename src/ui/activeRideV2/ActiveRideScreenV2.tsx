import { useCallback, useEffect, useRef } from "react";
import { type LayoutChangeEvent, StyleSheet } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import { RnView } from "~/ui/RnView";
import { useSafetySheet, useShareTrip } from "~/ui/safety/useSafetySheet";
import { useAppTheme } from "~/ui/theme";
import { space } from "~/ui/theme/tokens";

import { ActiveRideMap, type ActiveRideMapHandle } from "./ActiveRideMap";
import { DriverCard } from "./components/DriverCard";
import { FareCard } from "./components/FareCard";
import { RideStatusCard } from "./components/RideStatusCard";
import { RideStatusHeader } from "./components/RideStatusHeader";
import { TripActionsCard } from "./components/TripActionsCard";
import { TripRouteCard } from "./components/TripRouteCard";
import { ACCENT, CONTENT_GUTTER, useActiveRideGeometry } from "./geometry";
import { RidePromoCarousel } from "./promo/RidePromoCarousel";
import { usePromoSlides } from "./promo/usePromoSlides";
import { useActiveRideLayout, type SettledMode } from "./useActiveRideLayout";
import { type ActiveRideView, useActiveRideView } from "./useActiveRideView";

// Clearance for the floating tab bar (matches HomeIdleView).
const TAB_BAR_CLEARANCE = 90;

/**
 * v2 active-ride screen (Path A): a scrollable ride page whose status card
 * holds a live map thumbnail. Tapping it morphs the same map into a large
 * map under an accent header; the cards continue below. One MapView for
 * the whole ride — the compact state only clips it.
 */
export function ActiveRideScreenV2() {
  const view = useActiveRideView();
  if (!view) return null;
  return <ActiveRideScreenV2Body view={view} />;
}

function ActiveRideScreenV2Body({ view }: { view: ActiveRideView }) {
  const g = useActiveRideGeometry();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const mapRef = useRef<ActiveRideMapHandle>(null);

  const onSettled = useCallback((mode: SettledMode) => {
    mapRef.current?.settleCamera(mode);
  }, []);
  const layout = useActiveRideLayout({
    dragDistance: g.expanded.h,
    onSettled,
  });
  const { progress, state, expand, collapse, headerPan } = layout;

  useEffect(() => {
    if (state === "collapsing") mapRef.current?.releaseCamera();
  }, [state]);

  const scrollY = useSharedValue(0);
  // Scroll offset when the morph started: the content shift is computed
  // against it, so scrolling while expanded doesn't fight the morph.
  const scrollAtExpand = useSharedValue(0);
  const cardPos = useSharedValue({ x: 0, y: 0 });
  const slotOffset = useSharedValue({ x: 0, y: 0 });
  const driverCardY = useSharedValue(0);

  const onExpand = useCallback(() => {
    scrollAtExpand.set(scrollY.get());
    expand();
  }, [expand, scrollAtExpand, scrollY]);

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const onCardLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { x, y } = e.nativeEvent.layout;
      cardPos.set({ x, y });
    },
    [cardPos],
  );
  const onSlotOffset = useCallback(
    (x: number, y: number) => slotOffset.set({ x, y }),
    [slotOffset],
  );
  const onDriverCardLayout = useCallback(
    (e: LayoutChangeEvent) => driverCardY.set(e.nativeEvent.layout.y),
    [driverCardY],
  );

  const mapContainerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const compactX = cardPos.value.x + slotOffset.value.x;
    const compactY = cardPos.value.y + slotOffset.value.y - scrollY.value;
    return {
      width: interpolate(p, [0, 1], [g.slot.w, g.expanded.w]),
      height: interpolate(p, [0, 1], [g.slot.h, g.expanded.h]),
      borderRadius: interpolate(p, [0, 1], [16, 0]),
      transform: [
        { translateX: interpolate(p, [0, 1], [compactX, g.expanded.x]) },
        { translateY: interpolate(p, [0, 1], [compactY, g.expanded.y]) },
      ],
    };
  });

  const contentStyle = useAnimatedStyle(() => {
    const target = g.expanded.y + g.expanded.h + CONTENT_GUTTER;
    const current = driverCardY.value - scrollAtExpand.value;
    return { transform: [{ translateY: progress.value * (target - current) }] };
  });

  const expandBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4], [1, 0], "clamp"),
  }));

  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6], [0, 1], "clamp"),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [-g.headerH, 0]) },
    ],
  }));

  const promoFade = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4], [1, 0], "clamp"),
  }));

  const slides = usePromoSlides();
  const openSafety = useSafetySheet();
  const shareTrip = useShareTrip();
  const hasPromo = slides.length > 0;
  const { details, phase } = view;
  const expanded = state === "expanded";

  return (
    <RnView style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        scrollEnabled={state === "compact" || expanded}
      >
        {/* Padding lives on this view, not the scroll container: card and
            slot positions are measured inside it and drive the map overlay. */}
        <Animated.View
          style={[
            styles.content,
            {
              // The promo banner is full-bleed under the status bar.
              paddingTop: hasPromo ? 0 : insets.top + space.md,
              paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
            },
            contentStyle,
          ]}
        >
          {hasPromo ? (
            <Animated.View style={[styles.bleed, promoFade]}>
              <RidePromoCarousel
                slides={slides}
                rideId={view.rideId}
                active={state === "compact"}
              />
            </Animated.View>
          ) : null}
          <RideStatusCard
            label={view.label}
            headline={view.headline}
            statusMessage={view.statusMessage}
            otp={phase === "on_trip" ? null : details.otp}
            arrivalTime={
              phase === "assigned" || phase === "arriving"
                ? null
                : details.arrivalTime
            }
            frozenWaitElapsed={details.frozenWaitElapsed}
            slotW={g.slot.w}
            slotH={g.slot.h}
            progress={progress}
            onExpand={onExpand}
            onCardLayout={onCardLayout}
            onSlotOffset={onSlotOffset}
          />
          <RnView onLayout={onDriverCardLayout}>
            <DriverCard
              avatarUrl={view.avatarUrl}
              driverName={details.driverName}
              ratingLabel={details.ratingLabel}
              plate={details.plate}
              vehicleType={details.vehicleType}
              vehicleColor={details.vehicleColor}
              phone={details.phone}
            />
          </RnView>
          <FareCard
            fare={details.fare}
            distanceLabel={details.distanceLabel}
            tripDuration={details.tripDuration}
            vehicleType={details.vehicleType}
          />
          <TripRouteCard
            from={details.from}
            to={details.to}
            distanceLabel={details.distanceLabel}
            tripDuration={details.tripDuration}
          />
          <TripActionsCard
            destination={details.destination}
            canCancel={phase !== "on_trip"}
            onSafety={openSafety}
            onShareTrip={shareTrip}
          />
        </Animated.View>
      </Animated.ScrollView>

      <Animated.View
        pointerEvents={expanded ? "auto" : "none"}
        style={[styles.mapContainer, mapContainerStyle]}
      >
        <ActiveRideMap
          ref={mapRef}
          width={g.map.w}
          height={g.map.h}
          compactW={g.slot.w}
          compactH={g.slot.h}
          mode={expanded ? "expanded" : "compact"}
          route={view.route}
          driverPoint={view.driverPoint}
          stops={view.stops}
          vehicleType={details.vehicleType ?? undefined}
          markerEta={view.markerEta}
          showEmergency
        />
        <Animated.View
          style={[styles.expandBadge, expandBadgeStyle]}
          pointerEvents="none"
        >
          <Icon name="Maximize2" size={14} color="white" />
        </Animated.View>
      </Animated.View>

      <GestureDetector gesture={headerPan}>
        <Animated.View
          pointerEvents={state === "compact" ? "none" : "auto"}
          style={[
            styles.header,
            { height: g.headerH, paddingTop: insets.top },
            headerStyle,
          ]}
        >
          <RideStatusHeader headline={view.headline} onCollapse={collapse} />
        </Animated.View>
      </GestureDetector>
    </RnView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: CONTENT_GUTTER, gap: space.md },
  // Cancels the content gutter so the banner spans the full width.
  bleed: { marginHorizontal: -CONTENT_GUTTER },
  // The fixed-size map is anchored bottom-left so the Google logo stays
  // inside the compact crop.
  mapContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
    alignItems: "flex-start",
    justifyContent: "flex-end",
  },
  expandBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: ACCENT,
  },
});
