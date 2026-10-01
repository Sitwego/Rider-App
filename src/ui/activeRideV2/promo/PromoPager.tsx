import { useImperativeHandle, type ReactElement, type Ref } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
} from "react-native-reanimated";

export type PromoPagerHandle = { goTo: (page: number) => void };

export type PromoPagerProps = {
  ref?: Ref<PromoPagerHandle>;
  width: number;
  height: number;
  /** Written on the UI thread while paging: page index + fraction. */
  position: SharedValue<number>;
  onSettledPage: (page: number) => void;
  onDraggingChange: (dragging: boolean) => void;
  /** One element per page, keyed. */
  children: ReactElement[];
};

/**
 * Fallback pager (iOS / non-Android) on a paging ScrollView. Android uses
 * the Jetpack Compose HorizontalPager in PromoPager.android.tsx.
 */
export function PromoPager({
  ref,
  width,
  height,
  position,
  onSettledPage,
  onDraggingChange,
  children,
}: PromoPagerProps) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  useImperativeHandle(
    ref,
    () => ({
      goTo: (page) =>
        scrollRef.current?.scrollTo({ x: page * width, animated: true }),
    }),
    [scrollRef, width],
  );

  const onScroll = useAnimatedScrollHandler((e) => {
    position.set(e.contentOffset.x / width);
  });

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onDraggingChange(false);
    onSettledPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <Animated.ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={{ width, height }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onScrollBeginDrag={() => onDraggingChange(true)}
      onMomentumScrollEnd={onMomentumEnd}
    >
      {children}
    </Animated.ScrollView>
  );
}
