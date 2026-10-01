import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { space } from "~/ui/theme/tokens";

export const CONTENT_GUTTER = space.lg;
const HEADER_BAR = 56;
const SLOT_ASPECT = 10 / 16;
const EXPANDED_MAP_FRACTION = 0.58;

export type ActiveRideGeometry = {
  headerH: number;
  /** Expanded map frame in screen coordinates. */
  expanded: { x: number; y: number; w: number; h: number };
  /** Compact map slot inside the status card. */
  slot: { w: number; h: number };
  /**
   * The native map is always rendered at the expanded size; the compact
   * state only clips it, so Google Maps never resizes its surface.
   */
  map: { w: number; h: number };
};

export function useActiveRideGeometry(): ActiveRideGeometry {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return useMemo(() => {
    const headerH = insets.top + HEADER_BAR;
    const expandedH = Math.round(height * EXPANDED_MAP_FRACTION) - headerH;
    const slotW = Math.round((width - CONTENT_GUTTER * 4) * 0.45);
    const slotH = Math.round(slotW * SLOT_ASPECT);
    return {
      headerH,
      expanded: { x: 0, y: headerH, w: width, h: expandedH },
      slot: { w: slotW, h: slotH },
      map: { w: width, h: expandedH },
    };
  }, [width, height, insets.top]);
}
