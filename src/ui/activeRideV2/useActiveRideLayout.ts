import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  cancelAnimation,
  clamp,
  ReduceMotion,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
  type WithSpringConfig,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

export type LayoutState = "compact" | "expanding" | "expanded" | "collapsing";
export type SettledMode = "compact" | "expanded";

// Near-critical damping instead of overshootClamping: a clamped spring that
// is reversed mid-flight ends on its first frame (a visible snap).
const SPRING: WithSpringConfig = {
  damping: 26,
  stiffness: 180,
  mass: 1,
  reduceMotion: ReduceMotion.Never,
};
const REDUCED_MOTION_MS = 150;
// The spring's tail is invisible; settle when the motion is visually done.
const SETTLE_EPSILON = 0.01;
// Seconds of release velocity projected when deciding where a drag lands.
const VELOCITY_PROJECTION_S = 0.2;

type Options = {
  /** Header drag distance that maps to a full collapse. */
  dragDistance: number;
  onSettled?: (mode: SettledMode) => void;
};

export type ActiveRideLayout = {
  /** 0 = compact, 1 = expanded. Single source of truth for all motion. */
  progress: SharedValue<number>;
  state: LayoutState;
  expand: () => void;
  collapse: () => void;
  headerPan: ReturnType<typeof Gesture.Pan>;
};

export function useActiveRideLayout({
  dragDistance,
  onSettled,
}: Options): ActiveRideLayout {
  const progress = useSharedValue(0);
  const target = useSharedValue(0);
  const runId = useSharedValue(0);
  const settledRun = useSharedValue(0);
  const dragging = useSharedValue(false);
  const reducedMotion = useReducedMotion();

  const [state, setState] = useState<LayoutState>("compact");
  const stateRef = useRef<LayoutState>("compact");
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  const applyState = useCallback((next: LayoutState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const settle = useCallback(
    (to: number) => {
      const mode: SettledMode = to === 1 ? "expanded" : "compact";
      applyState(mode);
      onSettledRef.current?.(mode);
    },
    [applyState],
  );

  useAnimatedReaction(
    () => progress.get(),
    (p) => {
      if (dragging.get() || settledRun.get() === runId.get()) return;
      if (Math.abs(p - target.get()) < SETTLE_EPSILON) {
        settledRun.set(runId.get());
        scheduleOnRN(settle, target.get());
      }
    },
  );

  const animateTo = useCallback(
    (to: 0 | 1, velocity = 0) => {
      "worklet";
      target.set(to);
      runId.set(runId.get() + 1);
      progress.set(
        reducedMotion
          ? withTiming(to, { duration: REDUCED_MOTION_MS })
          : withSpring(to, { ...SPRING, velocity }),
      );
    },
    [progress, reducedMotion, runId, target],
  );

  const expand = useCallback(() => {
    if (stateRef.current === "expanded") return;
    applyState("expanding");
    animateTo(1);
  }, [animateTo, applyState]);

  const collapse = useCallback(() => {
    if (stateRef.current === "compact") return;
    applyState("collapsing");
    animateTo(0);
  }, [animateTo, applyState]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (stateRef.current === "compact") return false;
        collapse();
        return true;
      });
      return () => sub.remove();
    }, [collapse]),
  );

  // Enabled through the collapse the drag itself starts (gating on
  // 'expanded' cancels slow drags as soon as state flips to 'collapsing').
  const panEnabled = state !== "compact";
  // Gesture callbacks run on the UI thread, not during render.
  /* eslint-disable react-hooks/refs */
  const headerPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(panEnabled)
        .activeOffsetY(8)
        .onStart(() => {
          dragging.set(true);
          cancelAnimation(progress);
          scheduleOnRN(applyState, "collapsing");
        })
        .onUpdate((e) => {
          progress.set(clamp(1 - e.translationY / dragDistance, 0, 1));
        })
        .onFinalize((e) => {
          if (!dragging.get()) return;
          dragging.set(false);
          const velocity = -e.velocityY / dragDistance;
          const projected = progress.get() + velocity * VELOCITY_PROJECTION_S;
          const to = projected < 0.5 ? 0 : 1;
          scheduleOnRN(applyState, to === 1 ? "expanding" : "collapsing");
          animateTo(to, velocity);
        }),
    [animateTo, applyState, dragDistance, dragging, panEnabled, progress],
  );
  /* eslint-enable react-hooks/refs */

  return { progress, state, expand, collapse, headerPan };
}
