import { useEffect, useRef } from "react";

import { useBottomSheet } from "./useBottomSheet";

import type {
  AppBottomSheetProps,
  BottomSheetOptions,
  DismissReason,
  SheetId,
} from "./types";

/**
 * Declarative, controlled bottom sheet for screens where co-locating the sheet
 * with its content is cleaner than the imperative `useBottomSheet` registry.
 *
 * It is a thin bridge over the same host: toggling `open` presents/dismisses a
 * sheet in the shared stack, so this path automatically inherits stacking,
 * hardware-back handling, the themed surface, and dismiss-on-unmount. The
 * caller owns `open`; `onDismiss` fires on every close path (drag, backdrop,
 * hardware back, `open` → `false`, or unmount) and should set `open` to `false`.
 *
 * Requires `AppBottomSheetProvider` to be mounted above it.
 *
 * @example
 * const [open, setOpen] = useState(false);
 * <AppBottomSheet open={open} onDismiss={() => setOpen(false)} detents={[0, "content"]}>
 *   <MyContent />
 * </AppBottomSheet>
 */
export const AppBottomSheet = ({
  open,
  onDismiss,
  children,
  ...rest
}: AppBottomSheetProps) => {
  const controller = useBottomSheet();
  const idRef = useRef<SheetId | null>(null);

  // Keep the latest content/options/callback in a ref so the present/dismiss
  // effect can stay keyed on `open` alone without going stale. Synced from an
  // effect (declared first, so it runs before the present effect on each
  // commit) rather than during render.
  const latest = useRef({ children, rest, onDismiss });
  useEffect(() => {
    latest.current = { children, rest, onDismiss };
  });

  // Present on open, dismiss on close. Calls only touch the external store —
  // no local state is synchronized from this effect.
  useEffect(() => {
    if (open && idRef.current == null) {
      const options: BottomSheetOptions = {
        ...latest.current.rest,
        onDismiss: (reason: DismissReason) => {
          idRef.current = null;
          latest.current.onDismiss?.(reason);
        },
      };
      idRef.current = controller.present(latest.current.children, options);
    } else if (!open && idRef.current != null) {
      controller.dismiss(idRef.current);
      idRef.current = null;
    }
  }, [open, controller]);

  // Mirror content/option changes into the live sheet while it is open.
  useEffect(() => {
    if (idRef.current != null) {
      controller.update(idRef.current, {
        content: children,
        options: rest,
      });
    }
  });

  // Dismiss if the screen unmounts while the sheet is still open, so sheets do
  // not leak across navigation.
  useEffect(
    () => () => {
      if (idRef.current != null) {
        controller.dismiss(idRef.current);
        idRef.current = null;
      }
    },
    [controller],
  );

  return null;
};
