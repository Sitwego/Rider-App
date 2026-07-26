import type {
  BottomSheetContent,
  BottomSheetOptions,
  BottomSheetPatch,
  DismissReason,
  SheetId,
} from "./types";

/**
 * Pure, framework-free registry for the bottom-sheet stack.
 *
 * This module intentionally imports NO react-native / library runtime values
 * (only erased types), so the stacking logic can be unit-tested in plain Node
 * with the project's existing ts-jest setup. All rendering and native wiring
 * lives in `BottomSheetHost`, which subscribes to this store.
 */

/** A single live sheet in the stack. */
export interface SheetEntry {
  id: SheetId;
  content: BottomSheetContent;
  options: BottomSheetOptions;
  /** Set once a dismissal has been requested; the host animates it closed. */
  closing: boolean;
  /** The reason recorded when dismissal was requested. */
  reason: DismissReason;
}

/** Immutable snapshot of the stack, bottom-most first, top-most last. */
export type SheetStack = readonly SheetEntry[];

export interface BottomSheetStore {
  /** Subscribe to stack changes; returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
  /** Current stack snapshot (stable reference until the next change). */
  getSnapshot: () => SheetStack;
  /** Push a new sheet and return its id. */
  present: (
    content: BottomSheetContent,
    options?: BottomSheetOptions,
  ) => SheetId;
  /** Merge new content/options into a live sheet. */
  update: (id: SheetId, patch: BottomSheetPatch) => void;
  /**
   * Mark a sheet as closing so the host animates it out. When `id` is omitted
   * the top-most sheet is targeted. No-op if the id is unknown or already
   * closing. Returns the id that was marked, or `undefined`.
   */
  requestDismiss: (id?: SheetId, reason?: DismissReason) => SheetId | undefined;
  /** Mark every sheet as closing (top-most keeps focus until removed). */
  dismissAll: (reason?: DismissReason) => void;
  /** Remove a sheet from the stack once its close animation has settled. */
  remove: (id: SheetId) => void;
}

let counter = 0;
/** Monotonic id generator — unique per process, no crypto/global state leak. */
const nextId = (): SheetId => `sheet-${++counter}`;

/** The top-most (most recently presented) entry, or `undefined` if empty. */
export const peekTop = (stack: SheetStack): SheetEntry | undefined =>
  stack.length > 0 ? stack[stack.length - 1] : undefined;

/**
 * The top-most entry that has not yet started closing — the one a hardware
 * back press or an untargeted `dismiss()` should act on.
 */
export const topInteractive = (stack: SheetStack): SheetEntry | undefined => {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (!stack[i].closing) return stack[i];
  }
  return undefined;
};

/** Whether the top interactive sheet may be dismissed by the user. */
export const isTopDismissible = (stack: SheetStack): boolean => {
  const top = topInteractive(stack);
  // `dismissible` defaults to true when unspecified.
  return top ? top.options.dismissible !== false : false;
};

/** Create an isolated store instance (one per provider — no module singleton). */
export const createBottomSheetStore = (): BottomSheetStore => {
  let stack: SheetStack = [];
  const listeners = new Set<() => void>();

  const emit = (next: SheetStack) => {
    stack = next;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => stack,

    present: (content, options = {}) => {
      const id = nextId();
      emit([
        ...stack,
        { id, content, options, closing: false, reason: "programmatic" },
      ]);
      return id;
    },

    update: (id, patch) => {
      if (!stack.some((entry) => entry.id === id)) return;
      emit(
        stack.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                content:
                  patch.content !== undefined ? patch.content : entry.content,
                options: patch.options
                  ? { ...entry.options, ...patch.options }
                  : entry.options,
              }
            : entry,
        ),
      );
    },

    requestDismiss: (id, reason = "programmatic") => {
      const target = id
        ? stack.find((entry) => entry.id === id)
        : topInteractive(stack);
      if (!target || target.closing) return undefined;
      emit(
        stack.map((entry) =>
          entry.id === target.id ? { ...entry, closing: true, reason } : entry,
        ),
      );
      return target.id;
    },

    dismissAll: (reason = "programmatic") => {
      if (stack.length === 0) return;
      emit(
        stack.map((entry) =>
          entry.closing ? entry : { ...entry, closing: true, reason },
        ),
      );
    },

    remove: (id) => {
      const next = stack.filter((entry) => entry.id !== id);
      if (next.length !== stack.length) emit(next);
    },
  };
};
