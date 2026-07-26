/**
 * Composable modal bottom-sheet system, built on
 * `@swmansion/react-native-bottom-sheet`.
 *
 * Public surface — feature code should import only from here and never from the
 * underlying library directly:
 *
 * - `AppBottomSheetProvider` — mount once near the app root.
 * - `useBottomSheet()` — imperative controller (`present`/`update`/`dismiss`/`dismissAll`).
 * - `AppBottomSheet` — declarative, screen-local sheet.
 * - `programmatic` — mark a detent as reachable only via code.
 * - types for all public options/handles.
 *
 * See `README.md` in this folder for usage examples and library caveats.
 */
export { programmatic } from "@swmansion/react-native-bottom-sheet";

export { AppBottomSheetProvider } from "./AppBottomSheetProvider";
export { AppBottomSheet } from "./AppBottomSheet";
export { useBottomSheet } from "./useBottomSheet";
export { BottomSheetSurface } from "./BottomSheetSurface";

export type {
  AppBottomSheetProps,
  BottomSheetBackdropOptions,
  BottomSheetContent,
  BottomSheetContentApi,
  BottomSheetController,
  BottomSheetOptions,
  BottomSheetPatch,
  BottomSheetSurfaceOptions,
  Detent,
  DetentValue,
  DismissReason,
  KeyboardBehavior,
  PositionChangeEventData,
  SheetId,
} from "./types";
