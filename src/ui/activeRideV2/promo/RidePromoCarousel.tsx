import { useIsFocused } from "@react-navigation/native";
import { Image } from "expo-image";
import { PressableScale } from "pressto";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Linking,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useReducedMotion, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { space } from "~/ui/theme/tokens";

import { PromoDots } from "./PromoDots";
import { PromoPager, type PromoPagerHandle } from "./PromoPager";
import { LOCAL_PROMO_IMAGES } from "./usePromoSlides";

import type { PromoSlide } from "./promoSlides";

const AUTOPLAY_MS = 5000;
const IMPRESSION_MS = 1000;
const BANNER_FRACTION = 0.4;

type PromoEvent = "promo_impression" | "promo_tap";

// TODO: forward to the analytics SDK once one is installed.
function trackPromoEvent(event: PromoEvent, slideId: string, rideId: string) {
  if (__DEV__) console.log(`[analytics] ${event}`, { slideId, rideId });
}

function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setEnabled);
    const sub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setEnabled,
    );
    return () => sub.remove();
  }, []);
  return enabled;
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setActive(s === "active"),
    );
    return () => sub.remove();
  }, []);
  return active;
}

type Props = {
  slides: PromoSlide[];
  rideId: string;
  /** False while the map is expanded or animating: autoplay pauses. */
  active: boolean;
};

/**
 * Full-bleed promo banner at the top of the active-ride page. Autoplay
 * pauses on touch, in the background, off-focus, while the map is
 * expanded, and for reduce-motion or screen-reader users.
 */
function RidePromoCarouselBase({ slides, rideId, active }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bannerH = Math.round(height * BANNER_FRACTION) + insets.top;

  const pagerRef = useRef<PromoPagerHandle>(null);
  const position = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);

  const focused = useIsFocused();
  const appActive = useAppActive();
  const reducedMotion = useReducedMotion();
  const screenReader = useScreenReaderEnabled();

  const autoplay =
    slides.length > 1 &&
    active &&
    focused &&
    appActive &&
    !dragging &&
    !reducedMotion &&
    !screenReader;

  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => {
      pagerRef.current?.goTo((index + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [autoplay, index, slides.length]);

  // Impression: once per slide per ride, after it has been on screen 1 s.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    seen.current = new Set();
  }, [rideId]);
  const current = slides[index];
  useEffect(() => {
    if (!current || !active || !focused || seen.current.has(current.id)) {
      return;
    }
    const id = setTimeout(() => {
      seen.current.add(current.id);
      trackPromoEvent("promo_impression", current.id, rideId);
    }, IMPRESSION_MS);
    return () => clearTimeout(id);
  }, [active, current, focused, rideId]);

  // Warm the next remote creative so paging doesn't show a blank frame.
  const next = slides[(index + 1) % slides.length];
  useEffect(() => {
    if (next?.image.kind === "remote") void Image.prefetch(next.image.url);
  }, [next]);

  const onSlidePress = useCallback(
    (slide: PromoSlide) => {
      if (!slide.cta) return;
      trackPromoEvent("promo_tap", slide.id, rideId);
      void Linking.openURL(slide.cta.deepLink).catch(() => {});
    },
    [rideId],
  );

  if (slides.length === 0) return null;

  return (
    <RnView style={{ height: bannerH }}>
      <PromoPager
        ref={pagerRef}
        width={width}
        height={bannerH}
        position={position}
        onSettledPage={setIndex}
        onDraggingChange={setDragging}
      >
        {slides.map((slide) => (
          <PromoSlideView
            key={slide.id}
            slide={slide}
            width={width}
            height={bannerH}
            topInset={insets.top}
            onPress={onSlidePress}
          />
        ))}
      </PromoPager>
      <PromoDots count={slides.length} position={position} />
    </RnView>
  );
}

export const RidePromoCarousel = memo(RidePromoCarouselBase);

const PromoSlideView = memo(function PromoSlideView({
  slide,
  width,
  height,
  topInset,
  onPress,
}: {
  slide: PromoSlide;
  width: number;
  height: number;
  topInset: number;
  onPress: (slide: PromoSlide) => void;
}) {
  const { fonts } = useAppTheme();
  const fg = slide.textTone === "dark" ? "#0F2424" : "#FFFFFF";
  const source =
    slide.image.kind === "remote"
      ? { uri: slide.image.url }
      : LOCAL_PROMO_IMAGES[slide.image.key];
  const label = [slide.title, slide.subtitle, slide.cta?.label]
    .filter(Boolean)
    .join(". ");

  return (
    <PressableScale
      onPress={() => onPress(slide)}
      accessibilityRole={slide.cta ? "button" : "image"}
      accessibilityLabel={label}
      style={[
        styles.slide,
        {
          width,
          height,
          paddingTop: topInset + space.lg,
          backgroundColor: slide.bgColor,
        },
      ]}
    >
      <RnText
        numberOfLines={1}
        style={[
          atoms.text_2xl,
          styles.title,
          { color: fg, fontFamily: fonts.heavy.fontFamily },
        ]}
      >
        {slide.title}
      </RnText>
      <Image
        source={source}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={200}
        style={styles.image}
        accessibilityIgnoresInvertColors
      />
      {slide.subtitle ? (
        <RnText
          numberOfLines={2}
          style={[atoms.text_sm, styles.subtitle, { color: fg }]}
        >
          {slide.subtitle}
        </RnText>
      ) : null}
      {slide.cta ? (
        <RnView style={styles.cta}>
          <RnText
            style={[
              atoms.text_sm,
              { color: "#FFFFFF", fontFamily: fonts.bold.fontFamily },
            ]}
          >
            {slide.cta.label}
          </RnText>
        </RnView>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  slide: {
    alignItems: "center",
    paddingHorizontal: space._2xl,
    paddingBottom: space._3xl,
    gap: space.sm,
  },
  title: { textAlign: "center", letterSpacing: 1 },
  image: { flex: 1, width: "100%" },
  subtitle: { textAlign: "center" },
  cta: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 10,
    backgroundColor: "rgba(17,17,17,0.85)",
  },
});
