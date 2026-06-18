import { describe, expect, it } from "@jest/globals";

import { AnimationController } from "../AnimationController";

/** Manual requestAnimationFrame harness. */
function createFakeRaf() {
  let nextHandle = 1;
  const pending = new Map<number, (time: number) => void>();
  return {
    raf: (cb: (time: number) => void) => {
      const handle = nextHandle++;
      pending.set(handle, cb);
      return handle;
    },
    cancel: (handle: number) => {
      pending.delete(handle);
    },
    /** Fires all currently pending frame callbacks at `time`. */
    fire(time: number) {
      const callbacks = Array.from(pending.values());
      pending.clear();
      for (const cb of callbacks) cb(time);
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

describe("AnimationController", () => {
  it("starts with the first subscriber and stops with the last", () => {
    const fake = createFakeRaf();
    const controller = new AnimationController(fake.raf, fake.cancel);

    expect(controller.isRunning).toBe(false);
    const unsubscribe = controller.add(() => {});
    expect(controller.isRunning).toBe(true);

    unsubscribe();
    expect(controller.isRunning).toBe(false);
    expect(fake.pendingCount).toBe(0);
  });

  it("reports delta time in seconds, zero on the first frame", () => {
    const fake = createFakeRaf();
    const controller = new AnimationController(fake.raf, fake.cancel);
    const deltas: number[] = [];
    controller.add((dt) => deltas.push(dt));

    fake.fire(1000);
    fake.fire(1016);
    fake.fire(1049);
    expect(deltas[0]).toBe(0);
    expect(deltas[1]).toBeCloseTo(0.016, 6);
    expect(deltas[2]).toBeCloseTo(0.033, 6);
  });

  it("clamps pathological frame gaps", () => {
    const fake = createFakeRaf();
    const controller = new AnimationController(fake.raf, fake.cancel);
    const deltas: number[] = [];
    controller.add((dt) => deltas.push(dt));

    fake.fire(0);
    fake.fire(5000); // 5 s stall must not become a 5 s delta
    expect(deltas[1]).toBe(0.25);
  });

  it("pauses without losing subscribers and re-bases the clock on resume", () => {
    const fake = createFakeRaf();
    const controller = new AnimationController(fake.raf, fake.cancel);
    const deltas: number[] = [];
    controller.add((dt) => deltas.push(dt));

    fake.fire(1000);
    controller.pause();
    expect(controller.isRunning).toBe(false);
    expect(fake.pendingCount).toBe(0);

    controller.resume();
    expect(controller.isRunning).toBe(true);
    // 9 s passed while backgrounded — the first resumed frame must be 0.
    fake.fire(10_000);
    expect(deltas[deltas.length - 1]).toBe(0);
    fake.fire(10_016);
    expect(deltas[deltas.length - 1]).toBeCloseTo(0.016, 6);
  });

  it("drives all subscribers from one loop", () => {
    const fake = createFakeRaf();
    const controller = new AnimationController(fake.raf, fake.cancel);
    let a = 0;
    let b = 0;
    controller.add(() => a++);
    controller.add(() => b++);

    fake.fire(0);
    expect(fake.pendingCount).toBe(1); // exactly ONE rAF chain
    fake.fire(16);
    expect(a).toBe(2);
    expect(b).toBe(2);
  });
});
