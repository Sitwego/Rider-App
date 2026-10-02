import { useState } from "react";

import {
  LOCAL_PROMO_SLIDES,
  parsePromoSlides,
  type PromoSlide,
} from "./promoSlides";

/** Bundled creatives addressable by `imageKey`. */
export const LOCAL_PROMO_IMAGES: Record<string, number> = {
  bike: require("../../../../assets/images/ny_ic_bike_left_side.png"),
  executive: require("../../../../assets/images/excutive_ca_ic.png"),
  xl: require("../../../../assets/images/xl_ca_ic.png"),
  auto: require("../../../../assets/images/ny_ic_auto.png"),
};
const LOCAL_IMAGE_KEYS: ReadonlySet<string> = new Set(
  Object.keys(LOCAL_PROMO_IMAGES),
);

/** Slides for the active-ride banner, validated. Source: bundled config. */
export function usePromoSlides(): PromoSlide[] {
  // Read once per mount (a ride): the date window is checked when the
  // ride screen opens.
  const [slides] = useState(() => {
    const result = parsePromoSlides(
      LOCAL_PROMO_SLIDES,
      Date.now(),
      LOCAL_IMAGE_KEYS,
    );
    if (result.dropped > 0) {
      console.warn(`[promo] dropped ${result.dropped} invalid slide(s)`);
    }
    return result.slides;
  });
  return slides;
}
