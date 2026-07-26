import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BackHandler } from "react-native";

import { SheetView } from "./SheetView";
import { resolveSheetConfig } from "./config";
import { BottomSheetContext } from "./context";
import { isTopDismissible } from "./store";

import type { BottomSheetStore, SheetEntry } from "./store";

interface HostSheetProps {
  entry: SheetEntry;
  store: BottomSheetStore;
}

/** Renders and drives the lifecycle of a single stack entry. */
const HostSheet = ({ entry, store }: HostSheetProps) => {
  const config = useMemo(
    () => resolveSheetConfig(entry.options),
    [entry.options],
  );
  // `index` tracks user drags; once a dismissal is requested we render the
  // closed detent so the library animates the sheet out (then `onSettle`
  // finalizes it). Deriving this avoids a state-syncing effect.
  const [index, setIndex] = useState(config.openIndex);
  const renderIndex = entry.closing ? config.closedIndex : index;
  // Guards `onDismiss`/`remove` so they run exactly once per sheet.
  const finalizedRef = useRef(false);

  const finalize = () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    // `closing` ⇒ programmatic/back path carried the reason; otherwise the
    // user dragged or tapped the backdrop to the closed detent.
    const reason = entry.closing ? entry.reason : "user";
    store.remove(entry.id);
    entry.options.onDismiss?.(reason);
  };

  const handleIndexChange = (next: number) => {
    setIndex(next);
    entry.options.onIndexChange?.(next);
  };

  const handleSettle = (next: number) => {
    entry.options.onSettle?.(next);
    if (next === config.closedIndex) finalize();
  };

  const content =
    typeof entry.content === "function"
      ? entry.content({
          id: entry.id,
          dismiss: () => store.requestDismiss(entry.id, "programmatic"),
        })
      : entry.content;

  return (
    <SheetView
      index={renderIndex}
      config={config}
      options={entry.options}
      onIndexChange={handleIndexChange}
      onSettle={handleSettle}
    >
      {content}
    </SheetView>
  );
};

/**
 * Mounted once by the provider. Subscribes to the store and renders one modal
 * sheet per stack entry (later entries layer above earlier ones). Also owns the
 * single Android hardware-back subscription for the whole stack.
 */
export const BottomSheetHost = () => {
  const ctx = useContext(BottomSheetContext);
  if (ctx === null) {
    throw new Error(
      "`BottomSheetHost` must be used within `AppBottomSheetProvider`.",
    );
  }
  const { store } = ctx;

  const stack = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        const current = store.getSnapshot();
        if (current.length === 0) return false; // nothing open — let it propagate
        if (isTopDismissible(current)) {
          store.requestDismiss(undefined, "back");
        }
        // Consume the event while any sheet is open, even if non-dismissible.
        return true;
      },
    );
    return () => subscription.remove();
  }, [store]);

  return (
    <>
      {stack.map((entry) => (
        <HostSheet key={entry.id} entry={entry} store={store} />
      ))}
    </>
  );
};
