// ----------------------------------------------------------------
// useVehicleAnimation — React entry point to the tracking engine.
//
// Owns a VehicleStateManager, registers ONE frame callback with the
// app-wide shared AnimationController, and fans per-frame vehicle
// positions out to subscribers (VehicleMarker instances) via
// callbacks — never via React state. Nothing in this hook re-renders
// per frame; the only React lifecycle involvement is mount/unmount.
//
// The controller is paused while the app is backgrounded (AppState is
// React Native's `visibilitychange`) and re-bases its clock on resume,
// so returning to the app never produces a giant delta-time spike.
// ----------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { sharedAnimationController } from "~/tracking/AnimationController";
import { VehicleStateManager } from "~/tracking/VehicleStateManager";

import type {
  GpsUpdate,
  RouteInput,
  TrackerConfig,
  VehicleFrame,
} from "~/tracking/types";

export type VehicleFrameListener = (frame: VehicleFrame) => void;

export interface UseVehicleAnimationOptions {
  /** Engine tuning overrides — see DEFAULT_TRACKER_CONFIG. */
  config?: Partial<TrackerConfig>;
  /** Auto-remove vehicles after this long without updates. 0 disables. */
  evictAfterMs?: number;
}

export interface UseVehicleAnimationApi {
  /**
   * Creates the vehicle (when new) and/or replaces its route.
   * Must be called before GPS updates for that vehicle are accepted.
   */
  setVehicleRoute: (vehicleId: string, route: RouteInput) => void;
  /** Feeds one GPS sample into the pipeline. Drops it if no route is set. */
  ingestGpsUpdate: (vehicleId: string, update: GpsUpdate) => boolean;
  removeVehicle: (vehicleId: string) => void;
  hasVehicle: (vehicleId: string) => boolean;
  /**
   * Subscribes to per-frame rendered positions for one vehicle.
   * Returns an unsubscribe function. Intended for VehicleMarker.
   */
  subscribeVehicle: (
    vehicleId: string,
    listener: VehicleFrameListener,
  ) => () => void;
}

/** Eviction is cheap but needs no per-frame precision — run it sparsely. */
const EVICTION_CHECK_INTERVAL_MS = 5_000;

export function useVehicleAnimation(
  options: UseVehicleAnimationOptions = {},
): UseVehicleAnimationApi {
  const { evictAfterMs = 0 } = options;

  // Lazy one-time construction; the manager instance is stable for the
  // lifetime of the hook and mutated imperatively (never re-rendered on).
  const [manager] = useState(() => new VehicleStateManager(options.config));

  const listenersRef = useRef(new Map<string, Set<VehicleFrameListener>>());
  const lastEvictionRef = useRef(0);

  // ---- the per-frame pump (one callback for ALL vehicles) ----------
  useEffect(() => {
    const listeners = listenersRef.current;

    const unsubscribe = sharedAnimationController.add((dtSeconds, nowMs) => {
      manager.forEach((tracker) => {
        const frame = tracker.getFrame(dtSeconds, nowMs);
        const vehicleListeners = listeners.get(tracker.vehicleId);
        if (vehicleListeners) {
          for (const listener of vehicleListeners) listener(frame);
        }
      });

      if (
        evictAfterMs > 0 &&
        nowMs - lastEvictionRef.current > EVICTION_CHECK_INTERVAL_MS
      ) {
        lastEvictionRef.current = nowMs;
        manager.evictInactive(evictAfterMs, nowMs);
      }
    });

    return () => {
      unsubscribe();
      manager.clear();
    };
  }, [manager, evictAfterMs]);

  // ---- background/foreground handling ------------------------------
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") sharedAnimationController.resume();
      else sharedAnimationController.pause();
    });
    return () => subscription.remove();
  }, []);

  // ---- stable API ---------------------------------------------------
  const setVehicleRoute = useCallback(
    (vehicleId: string, route: RouteInput) => {
      manager.ensure(vehicleId, route, { replaceRoute: true });
    },
    [manager],
  );

  const ingestGpsUpdate = useCallback(
    (vehicleId: string, update: GpsUpdate) => {
      const accepted = manager.ingest(vehicleId, update);
      if (!accepted && __DEV__) {
        console.warn(
          `[useVehicleAnimation] GPS update for unknown vehicle "${vehicleId}" dropped — call setVehicleRoute first.`,
        );
      }
      return accepted;
    },
    [manager],
  );

  const removeVehicle = useCallback(
    (vehicleId: string) => {
      manager.remove(vehicleId);
      listenersRef.current.delete(vehicleId);
    },
    [manager],
  );

  const hasVehicle = useCallback(
    (vehicleId: string) => manager.has(vehicleId),
    [manager],
  );

  const subscribeVehicle = useCallback(
    (vehicleId: string, listener: VehicleFrameListener) => {
      let set = listenersRef.current.get(vehicleId);
      if (!set) {
        set = new Set();
        listenersRef.current.set(vehicleId, set);
      }
      set.add(listener);
      return () => {
        const current = listenersRef.current.get(vehicleId);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) listenersRef.current.delete(vehicleId);
      };
    },
    [],
  );

  return {
    setVehicleRoute,
    ingestGpsUpdate,
    removeVehicle,
    hasVehicle,
    subscribeVehicle,
  };
}
