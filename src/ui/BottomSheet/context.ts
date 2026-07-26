import { createContext } from "react";

import type { BottomSheetStore } from "./store";
import type { BottomSheetController } from "./types";

export interface BottomSheetContextValue {
  store: BottomSheetStore;
  controller: BottomSheetController;
}

/**
 * Context carrying the per-provider store + controller. `null` until a
 * provider is mounted, so consumers can throw a clear error.
 */
export const BottomSheetContext = createContext<BottomSheetContextValue | null>(
  null,
);
