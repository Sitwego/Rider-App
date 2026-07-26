import { programmatic } from "@swmansion/react-native-bottom-sheet";

import type { BottomSheetOptions, Detent, DetentValue } from "./types";

/** Neutral dimming base; the effective alpha is driven by `backdrop.opacity`. */
const DEFAULT_SCRIM_COLOR = "rgba(15, 36, 36, 0.5)"; // #0f2424 @ 50% alpha
const DEFAULT_SCRIM_OPACITY = 0.5;
const DEFAULT_DETENTS: Detent[] = [0, "content"];

/** Read a detent's underlying value whether it is bare or in object form. */
export const detentValue = (detent: Detent): DetentValue =>
  typeof detent === "object" && detent !== null ? detent.value : detent;

/** Fully-resolved props ready to spread onto the library's sheet component. */
export interface ResolvedSheetConfig {
  detents: Detent[];
  /** Initial/open index into `detents` (the tallest detent by default). */
  openIndex: number;
  /** The closed (0-height) detent index — always `0` after normalization. */
  closedIndex: number;
  scrimColor: string;
  scrimOpacities: number[];
  extendUnderStatusBar: boolean;
  nativeOverlay: boolean;
}

/**
 * Normalize user options into library-ready values:
 * - guarantee a leading `0` (closed) detent so dismissal is always `index 0`;
 * - make that closed detent programmatic when the sheet (or backdrop tap) is
 *   non-dismissible, which disables BOTH scrim-tap and drag-to-close — the only
 *   lever the library exposes for this;
 * - translate the `backdrop` option into `scrimColor` + per-detent opacities.
 */
export const resolveSheetConfig = (
  options: BottomSheetOptions,
): ResolvedSheetConfig => {
  const raw =
    options.detents && options.detents.length > 0
      ? options.detents
      : DEFAULT_DETENTS;

  const hasClosed = detentValue(raw[0]) === 0;
  const base: Detent[] = hasClosed ? [...raw] : [0, ...raw];

  const dismissible = options.dismissible !== false;
  const tapToDismiss = options.backdrop?.tapToDismiss ?? dismissible;
  const lockClosed = !dismissible || !tapToDismiss;

  // Programmatic closed detent: unreachable by drag/scrim-tap, still reachable
  // via a controlled `index` change (our programmatic dismissal path).
  const detents: Detent[] = lockClosed
    ? [programmatic(0), ...base.slice(1)]
    : base;

  const requestedIndex =
    options.index != null
      ? options.index + (hasClosed ? 0 : 1)
      : detents.length - 1;
  const openIndex = Math.min(Math.max(requestedIndex, 1), detents.length - 1);

  const backdropVisible = options.backdrop?.visible ?? true;
  const opacity = options.backdrop?.opacity ?? DEFAULT_SCRIM_OPACITY;
  const scrimColor = options.backdrop?.color ?? DEFAULT_SCRIM_COLOR;
  // Transparent at the closed detent, `opacity` at every open detent.
  const scrimOpacities = detents.map((detent) =>
    detentValue(detent) === 0 || !backdropVisible ? 0 : opacity,
  );

  return {
    detents,
    openIndex,
    closedIndex: 0,
    scrimColor,
    scrimOpacities,
    extendUnderStatusBar: options.extendUnderStatusBar ?? false,
    nativeOverlay: options.nativeOverlay ?? false,
  };
};
