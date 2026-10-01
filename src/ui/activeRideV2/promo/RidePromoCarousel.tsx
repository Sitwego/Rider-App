import { Image } from "expo-image";
import { PressableScale } from "pressto";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Carousel, useOptionalIsFocused } from "~/components/carousel";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import { space } from "~/ui/theme/tokens";

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

type Props = {
  slides: PromoSlide[];
  rideId: string;
  /** False while the map is expanded or animating: autoplay pauses. */
  active: boolean;
};

/**
 * Full-bleed promo banner at the top of the active-ride page: the shared
 * Carousel plus ad slides, CTA deep links and impression tracking.
 */
function RidePromoCarouselBase({ slides, rideId, active }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bannerH = Math.round(height * BANNER_FRACTION) + insets.top;
  const focused = useOptionalIsFocused();
  const [index, setIndex] = useState(0);

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

  return (
    <Carousel
      data={slides}
      keyExtractor={(slide) => slide.id}
      height={bannerH}
      autoplayIntervalMs={AUTOPLAY_MS}
      paused={!active}
      onIndexChange={setIndex}
      renderItem={({ item, width, height: h }) => (
        <PromoSlideView
          slide={item}
          width={width}
          height={h}
          topInset={insets.top}
          onPress={onSlidePress}
        />
      )}
    />
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
