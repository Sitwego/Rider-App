import {
  HorizontalPager,
  type HorizontalPagerHandle,
  Host,
  RNHostView,
} from "@expo/ui/jetpack-compose";
import { fillMaxSize } from "@expo/ui/jetpack-compose/modifiers";
import { useImperativeHandle, useRef } from "react";

import type { PromoPagerProps } from "./PromoPager";

export type { PromoPagerHandle, PromoPagerProps } from "./PromoPager";

/**
 * Android pager: Jetpack Compose HorizontalPager (Expo UI) with each slide
 * hosted as a React Native view. Scroll position is reported by a worklet
 * on the UI thread, so the dots track the finger without JS round-trips.
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
  const pager = useRef<HorizontalPagerHandle>(null);

  useImperativeHandle(
    ref,
    () => ({
      goTo: (page) => {
        void pager.current?.animateScrollToPage(page);
      },
    }),
    [],
  );

  return (
    <Host style={{ width, height }}>
      <HorizontalPager
        ref={pager}
        modifiers={[fillMaxSize()]}
        beyondViewportPageCount={1}
        onPageScroll={(page, fraction) => {
          "worklet";
          position.set(page + fraction);
        }}
        onSettledPageChange={onSettledPage}
        onDragInteraction={(kind) => onDraggingChange(kind === "start")}
      >
        {children.map((child) => (
          <RNHostView key={child.key}>{child}</RNHostView>
        ))}
      </HorizontalPager>
    </Host>
  );
}
