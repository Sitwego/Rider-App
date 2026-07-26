import { useContext } from "react";

import { BottomSheetContext } from "./context";

import type { BottomSheetController } from "./types";

/**
 * Access the stable bottom-sheet controller. Any component below
 * `AppBottomSheetProvider` can imperatively `present`, `update`, `dismiss`, and
 * `dismissAll` sheets without rendering any sheet plumbing itself.
 *
 * @example
 * const sheet = useBottomSheet();
 * const id = sheet.present(<MyContent />, { detents: [0, "content"] });
 * // later: sheet.dismiss(id);
 */
export const useBottomSheet = (): BottomSheetController => {
  const ctx = useContext(BottomSheetContext);
  if (ctx === null) {
    throw new Error(
      "`useBottomSheet` must be used within `AppBottomSheetProvider`.",
    );
  }
  return ctx.controller;
};
