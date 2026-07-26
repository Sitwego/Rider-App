import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  createBottomSheetStore,
  isTopDismissible,
  peekTop,
  topInteractive,
} from "../store";

import type { BottomSheetStore } from "../store";

describe("createBottomSheetStore", () => {
  let store: BottomSheetStore;

  beforeEach(() => {
    store = createBottomSheetStore();
  });

  describe("present", () => {
    it("adds an entry and returns a unique id", () => {
      const a = store.present("A");
      const b = store.present("B");

      expect(a).not.toEqual(b);
      expect(store.getSnapshot()).toHaveLength(2);
    });

    it("stacks entries in presentation order (top-most last)", () => {
      const a = store.present("A");
      const b = store.present("B");
      const c = store.present("C");

      const stack = store.getSnapshot();
      expect(stack.map((e) => e.id)).toEqual([a, b, c]);
      expect(peekTop(stack)?.id).toBe(c);
    });

    it("defaults a new entry to not-closing", () => {
      store.present("A");
      expect(store.getSnapshot()[0].closing).toBe(false);
    });

    it("notifies subscribers on change", () => {
      const listener = jest.fn();
      store.subscribe(listener);
      store.present("A");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("keeps a stable snapshot reference until the next mutation", () => {
      store.present("A");
      const first = store.getSnapshot();
      expect(store.getSnapshot()).toBe(first);
      store.present("B");
      expect(store.getSnapshot()).not.toBe(first);
    });
  });

  describe("update", () => {
    it("merges content and options into a live entry", () => {
      const id = store.present("A", { dismissible: true });
      store.update(id, {
        content: "A2",
        options: { accessibilityLabel: "label" },
      });

      const entry = store.getSnapshot()[0];
      expect(entry.content).toBe("A2");
      expect(entry.options.dismissible).toBe(true);
      expect(entry.options.accessibilityLabel).toBe("label");
    });

    it("ignores unknown ids", () => {
      store.present("A");
      const before = store.getSnapshot();
      store.update("missing", { content: "X" });
      expect(store.getSnapshot()).toBe(before);
    });
  });

  describe("requestDismiss", () => {
    it("marks the top sheet closing when no id is given", () => {
      store.present("A");
      const top = store.present("B");

      const dismissed = store.requestDismiss(undefined, "back");

      expect(dismissed).toBe(top);
      const stack = store.getSnapshot();
      expect(stack[0].closing).toBe(false);
      expect(stack[1].closing).toBe(true);
      expect(stack[1].reason).toBe("back");
    });

    it("targets a specific id", () => {
      const a = store.present("A");
      store.present("B");

      store.requestDismiss(a, "programmatic");

      const stack = store.getSnapshot();
      expect(stack[0].closing).toBe(true);
      expect(stack[1].closing).toBe(false);
    });

    it("skips an already-closing sheet and targets the next interactive one", () => {
      const a = store.present("A");
      const b = store.present("B");

      expect(store.requestDismiss()).toBe(b);
      // B is now closing; the next untargeted dismiss should hit A.
      expect(store.requestDismiss()).toBe(a);
    });

    it("returns undefined for unknown ids", () => {
      expect(store.requestDismiss("missing")).toBeUndefined();
    });

    it("returns undefined when the stack is empty", () => {
      expect(store.requestDismiss()).toBeUndefined();
    });
  });

  describe("dismissAll", () => {
    it("marks every sheet closing", () => {
      store.present("A");
      store.present("B");
      store.present("C");

      store.dismissAll("programmatic");

      expect(store.getSnapshot().every((e) => e.closing)).toBe(true);
    });

    it("is a no-op on an empty stack", () => {
      const listener = jest.fn();
      store.subscribe(listener);
      store.dismissAll();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes the settled sheet", () => {
      const a = store.present("A");
      const b = store.present("B");

      store.remove(a);

      const stack = store.getSnapshot();
      expect(stack).toHaveLength(1);
      expect(stack[0].id).toBe(b);
    });

    it("does not notify for an unknown id", () => {
      store.present("A");
      const listener = jest.fn();
      store.subscribe(listener);
      store.remove("missing");
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("selectors", () => {
    it("topInteractive skips closing sheets", () => {
      const a = store.present("A");
      store.present("B");
      store.requestDismiss(); // closes B

      expect(topInteractive(store.getSnapshot())?.id).toBe(a);
    });

    it("isTopDismissible reflects the top interactive sheet's option", () => {
      store.present("A", { dismissible: true });
      expect(isTopDismissible(store.getSnapshot())).toBe(true);

      store.present("B", { dismissible: false });
      expect(isTopDismissible(store.getSnapshot())).toBe(false);
    });

    it("isTopDismissible defaults to true when unspecified", () => {
      store.present("A");
      expect(isTopDismissible(store.getSnapshot())).toBe(true);
    });

    it("isTopDismissible is false for an empty stack", () => {
      expect(isTopDismissible(store.getSnapshot())).toBe(false);
    });
  });

  describe("back-button resolution scenario", () => {
    it("dismisses sheets top-down across repeated back presses", () => {
      const a = store.present("A");
      const b = store.present("B");

      // First back press hits B.
      const first = topInteractive(store.getSnapshot());
      expect(first?.id).toBe(b);
      store.requestDismiss(first?.id, "back");
      store.remove(b); // settle

      // Second back press hits A.
      const second = topInteractive(store.getSnapshot());
      expect(second?.id).toBe(a);
    });
  });
});
