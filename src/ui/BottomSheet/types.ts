import type {
  Detent,
  DetentValue,
  PositionChangeEventData,
} from "@swmansion/react-native-bottom-sheet";
import type { ReactNode } from "react";
import type { NativeSyntheticEvent } from "react-native";

// Re-export the library primitives callers legitimately need so feature code
// never imports `@swmansion/react-native-bottom-sheet` directly.
export type { Detent, DetentValue, PositionChangeEventData };

/** Opaque identifier returned by `present`, used to target a live sheet. */
export type SheetId = string;

/**
 * Why a sheet closed. `onDismiss` always receives one of these regardless of
 * the path taken (drag, backdrop tap, hardware back, or programmatic dismiss).
 */
export type DismissReason = "user" | "back" | "programmatic";

/** How the sheet reacts to the on-screen keyboard. */
export type KeyboardBehavior = "none" | "padding";

/** Visual overrides for the shared sheet surface. Falls back to design tokens. */
export interface BottomSheetSurfaceOptions {
  /** Surface background. Defaults to the theme card color. */
  backgroundColor?: string;
  /** Top corner radius. Defaults to the `lg` border-radius token. */
  borderRadius?: number;
  /** Whether to render the grab handle. Defaults to `true`. */
  showHandle?: boolean;
  /** Grab-handle color. Defaults to a muted theme gray. */
  handleColor?: string;
}

/** Backdrop (scrim) configuration. Maps onto the library's scrim props. */
export interface BottomSheetBackdropOptions {
  /** Whether the dimming scrim is shown at all. Defaults to `true`. */
  visible?: boolean;
  /** Scrim opacity at open detents, 0–1. Defaults to `0.5`. */
  opacity?: number;
  /** Scrim base color. Defaults to neutral black; `opacity` controls alpha. */
  color?: string;
  /**
   * Whether tapping the scrim dismisses the sheet. Defaults to the sheet's
   * `dismissible` value.
   *
   * NOTE: the underlying library cannot separate scrim-tap from drag-to-close.
   * Setting this to `false` disables BOTH (the closed detent becomes
   * programmatic-only). See the module README for details.
   */
  tapToDismiss?: boolean;
}

/** Options accepted by `present` and (as flat props) by `AppBottomSheet`. */
export interface BottomSheetOptions {
  /**
   * Snap points in ascending order by height. A leading `0` (closed) detent is
   * ensured automatically. Defaults to `[0, 'content']` (content-sized).
   */
  detents?: Detent[];
  /**
   * Initial zero-based index into `detents`. Defaults to the tallest detent so
   * the sheet opens fully.
   */
  index?: number;
  /**
   * Whether the user can dismiss by dragging down or tapping the backdrop.
   * Defaults to `true`. When `false`, only programmatic dismissal works.
   */
  dismissible?: boolean;
  /** Called on every dismissal path with the reason. */
  onDismiss?: (reason: DismissReason) => void;
  /** Backdrop / scrim configuration. */
  backdrop?: BottomSheetBackdropOptions;
  /** Surface (background) styling overrides. */
  surface?: BottomSheetSurfaceOptions;
  /** Keyboard avoidance strategy for content with inputs. Defaults to `padding`. */
  keyboardBehavior?: KeyboardBehavior;
  /** Pad content by the bottom safe-area inset. Defaults to `true`. */
  respectSafeArea?: boolean;
  /** Allow full-height detents to extend under the status bar. Defaults to `false`. */
  extendUnderStatusBar?: boolean;
  /**
   * Present in a window-level native overlay so the sheet covers native modal
   * screens. Defaults to `false` (renders through the provider portal).
   */
  nativeOverlay?: boolean;
  /** Accessibility label announced when the sheet opens. */
  accessibilityLabel?: string;
  /** Test identifier applied to the content container. */
  testID?: string;
  /** Observe user-driven snap starts (keep external state in sync). */
  onIndexChange?: (index: number) => void;
  /** Observe when any snap settles, including programmatic moves. */
  onSettle?: (index: number) => void;
  /** Observe continuous position; runs on the JS thread. */
  onPositionChange?: (
    event: NativeSyntheticEvent<PositionChangeEventData>,
  ) => void;
}

/** Per-sheet API handed to render-function content. */
export interface BottomSheetContentApi {
  /** The id of this sheet. */
  id: SheetId;
  /** Dismiss this sheet programmatically. */
  dismiss: () => void;
}

/**
 * Sheet content: either a static node or a render function that receives a
 * per-sheet API (so content can close itself without wiring up the hook).
 */
export type BottomSheetContent =
  | ReactNode
  | ((api: BottomSheetContentApi) => ReactNode);

/** Patch accepted by `update`. */
export interface BottomSheetPatch {
  content?: BottomSheetContent;
  options?: Partial<BottomSheetOptions>;
}

/** Stable controller returned by `useBottomSheet`. */
export interface BottomSheetController {
  /** Present a new sheet on top of the stack; returns its id. */
  present: (
    content: BottomSheetContent,
    options?: BottomSheetOptions,
  ) => SheetId;
  /** Update the content and/or options of a live sheet. */
  update: (id: SheetId, patch: BottomSheetPatch) => void;
  /** Dismiss a specific sheet, or the top sheet when `id` is omitted. */
  dismiss: (id?: SheetId) => void;
  /** Dismiss every open sheet. */
  dismissAll: () => void;
}

/** Props for the declarative `<AppBottomSheet>` escape hatch. */
export interface AppBottomSheetProps
  extends Omit<BottomSheetOptions, "onDismiss"> {
  /** Whether the sheet is open. Driven by the caller. */
  open: boolean;
  /** Called on every dismissal path; the caller should set `open` to `false`. */
  onDismiss?: (reason: DismissReason) => void;
  /** Sheet content. */
  children: ReactNode;
}
