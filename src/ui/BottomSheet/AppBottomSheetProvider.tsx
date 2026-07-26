import { useMemo, useState } from "react";

import { BottomSheetHost } from "./BottomSheetHost";
import { BottomSheetContext } from "./context";
import { createBottomSheetStore } from "./store";

import type { BottomSheetContextValue } from "./context";
import type { BottomSheetController } from "./types";
import type { ReactNode } from "react";

/**
 * Provider for the composable bottom-sheet system. Mount it ONCE near the app
 * root, BELOW `SafeAreaProvider` and INSIDE the library's `BottomSheetProvider`
 * (whose portal hosts the modal sheets). It owns the sheet stack and renders
 * the host, so any descendant can call `useBottomSheet().present(...)`.
 */
export const AppBottomSheetProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  // One store per provider instance — no module-level singleton.
  const [store] = useState(createBottomSheetStore);

  const controller = useMemo<BottomSheetController>(
    () => ({
      present: (content, options) => store.present(content, options),
      update: (id, patch) => store.update(id, patch),
      dismiss: (id) => {
        store.requestDismiss(id, "programmatic");
      },
      dismissAll: () => store.dismissAll("programmatic"),
    }),
    [store],
  );

  const value = useMemo<BottomSheetContextValue>(
    () => ({ store, controller }),
    [store, controller],
  );

  return (
    <BottomSheetContext.Provider value={value}>
      {children}
      <BottomSheetHost />
    </BottomSheetContext.Provider>
  );
};
