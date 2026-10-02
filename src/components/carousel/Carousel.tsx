import {
  type ReactElement,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  type StyleProp,
  StyleSheet,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { useSharedValue } from "react-native-reanimated";

import { RnView } from "~/ui/RnView";

import { CarouselDots } from "./CarouselDots";
import { CarouselPager, type CarouselPagerHandle } from "./CarouselPager";
import { useAutoplayAllowed } from "./useAutoplayAllowed";

export type CarouselHandle = {
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
};

export type CarouselRenderInfo<T> = {
  item: T;
  index: number;
  width: number;
  height: number;
};

export type CarouselProps<T> = {
  ref?: Ref<CarouselHandle>;
  data: readonly T[];
  keyExtractor: (item: T, index: number) => string;
  /** Rendered at exactly `width` × `height`. */
  renderItem: (info: CarouselRenderInfo<T>) => ReactElement;
  height: number;
  /** Page width; defaults to the window width (full-bleed). */
  width?: number;
  /** Auto-advance interval; omit to disable autoplay. */
  autoplayIntervalMs?: number;
  /**
   * Extra pause from the caller (e.g. content hidden). Autoplay also
   * pauses on its own while dragging, in the background, when the screen
   * is unfocused, and for reduce-motion or screen-reader users.
   */
  paused?: boolean;
  /** Fires when a page has settled after a swipe or autoplay. */
  onIndexChange?: (index: number) => void;
  showDots?: boolean;
  dotColor?: string;
  dotsBottom?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Reusable full-width paging carousel with animated dots and autoplay.
 * Android pages with Expo UI's Jetpack Compose HorizontalPager; other
 * platforms use a paging ScrollView (see CarouselPager).
 */
export function Carousel<T>({
  ref,
  data,
  keyExtractor,
  renderItem,
  height,
  width: widthProp,
  autoplayIntervalMs,
  paused = false,
  onIndexChange,
  showDots = true,
  dotColor,
  dotsBottom,
  style,
}: CarouselProps<T>) {
  const { width: windowWidth } = useWindowDimensions();
  const width = widthProp ?? windowWidth;
  const count = data.length;

  const pagerRef = useRef<CarouselPagerHandle>(null);
  const position = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const autoplayAllowed = useAutoplayAllowed();

  const onSettledPage = useCallback(
    (page: number) => {
      setIndex(page);
      onIndexChange?.(page);
    },
    [onIndexChange],
  );

  const goTo = useCallback(
    (target: number) => {
      if (count === 0) return;
      pagerRef.current?.goTo(((target % count) + count) % count);
    },
    [count],
  );

  useImperativeHandle(
    ref,
    () => ({
      goTo,
      next: () => goTo(index + 1),
      prev: () => goTo(index - 1),
    }),
    [goTo, index],
  );

  const autoplay =
    autoplayIntervalMs !== undefined &&
    count > 1 &&
    !paused &&
    !dragging &&
    autoplayAllowed;

  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => goTo(index + 1), autoplayIntervalMs);
    return () => clearTimeout(id);
  }, [autoplay, autoplayIntervalMs, goTo, index]);

  if (count === 0) return null;

  return (
    <RnView style={[{ width, height }, styles.container, style]}>
      <CarouselPager
        ref={pagerRef}
        width={width}
        height={height}
        position={position}
        onSettledPage={onSettledPage}
        onDraggingChange={setDragging}
      >
        {data.map((item, i) => (
          <RnView key={keyExtractor(item, i)} style={{ width, height }}>
            {renderItem({ item, index: i, width, height })}
          </RnView>
        ))}
      </CarouselPager>
      {showDots ? (
        <CarouselDots
          count={count}
          position={position}
          color={dotColor}
          bottom={dotsBottom}
        />
      ) : null}
    </RnView>
  );
}

const styles = StyleSheet.create({
  container: { overflow: "hidden" },
});
