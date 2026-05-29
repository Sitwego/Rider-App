import React, {
  memo,
  ReactNode,
  useContext,
  useMemo,
  useReducer,
  useRef,
} from "react";

import { ACTIVE_RIDE_STORAGE_KEY } from "~/constants/RIDE_CONSTANTS";
import { activeRideStorage } from "~/storage";
import { ActiveRideState } from "~/types/rideRequestTypes";
import ActiveRideSheet, {
  type ActionSheetACTRef,
} from "~/ui/views/ActiveRideSheet";

import {
  type Action,
  useLocationUpdates,
  useRideEvents,
  useRidePollingEffect,
  useRideSheet,
} from "./activeRideHooks";

// re-export so existing consumers of `import { Action } from './ActiveRideProvider'` keep working
export type { Action };

type SetStateApi = {
  open: () => Promise<void>;
  close: () => Promise<void>;
  setActiveRideState: React.ActionDispatch<[action: Action]>;
};

export const Context = React.createContext<SetStateApi>({
  open: async function () {},
  close: async function () {},
  setActiveRideState: function (action: Action): void {
    throw new Error("Function not implemented.");
  },
});

const StateContext = React.createContext<ActiveRideState>({
  ride_status: null,
  rideData: undefined,
  ride_status_update_keys: [],
  isRideSearchButtonPressed: false,
});

const { Provider } = Context;

const ActiveRideSheetProvider = ({ children }: { children: ReactNode }) => {
  const [activeRideState, setActiveRideState] = useReducer<
    ActiveRideState,
    null,
    [act: Action]
  >(reducers, null, () => {
    const storedData = activeRideStorage.get([ACTIVE_RIDE_STORAGE_KEY]);
    return (
      storedData ?? {
        ride_status: null,
        rideData: undefined,
        isRideSearchButtonPressed: false,
        ride_status_update_keys: undefined,
      }
    );
  });

  const ref = useRef<ActionSheetACTRef>(null);

  useRideEvents(activeRideState.rideData?.id, setActiveRideState);
  useLocationUpdates(activeRideState.rideData?.id, setActiveRideState);
  useRidePollingEffect(
    activeRideState.ride_status_update_keys,
    setActiveRideState,
  );
  useRideSheet(ref, activeRideState.rideData?.id);

  const getContext = useMemo(
    () => ({
      open: async () => {
        await ref.current?.open();
      },
      close: async () => {
        await ref.current?.close();
      },
      setActiveRideState,
    }),
    [setActiveRideState],
  );

  return (
    <StateContext.Provider value={activeRideState}>
      <Provider value={getContext}>
        <ActiveRideSheet ref={ref}>{children}</ActiveRideSheet>
      </Provider>
    </StateContext.Provider>
  );
};

// Shared helper — removes undefined values before writing to storage
const filterUndefined = <T extends Record<string, any>>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined),
  ) as T;

const reducers = (state: ActiveRideState, action: Action): ActiveRideState => {
  switch (action.type) {
    case "SET-ACTIVE-RIDE": {
      if (action.data.should_persist) {
        const { should_persist, ...dataToStore } = action.data;
        activeRideStorage.set(
          [ACTIVE_RIDE_STORAGE_KEY],
          filterUndefined(dataToStore) as Omit<
            ActiveRideState,
            "should_persist"
          >,
        );
      }
      return {
        ...state,
        ...action.data,
      };
    }
    case "REMOVE-RIDE": {
      activeRideStorage.remove([ACTIVE_RIDE_STORAGE_KEY]);
      return {
        ride_status: null,
        rideData: undefined,
        isRideSearchButtonPressed: false,
        ride_status_update_keys: undefined,
      };
    }
    case "UPDATE-ACTIVE-RIDE": {
      const baseMerged = action.data.rideData
        ? { ...state.rideData, ...action.data.rideData }
        : state.rideData;

      // When ride_start_time arrives, snap frozen_wait_elapsed so WaitingTimer
      // can display a static value without ever running a setInterval.
      // Computed here in the reducer because this is the only place where both
      // actual_arrival_time (from state) and ride_start_time (from action) meet.
      const mergedRideData =
        action.data.rideData?.ride_start_time !== undefined &&
        state.rideData?.actual_arrival_time !== undefined
          ? {
              ...baseMerged,
              frozen_wait_elapsed: Math.max(
                0,
                Math.floor(
                  (action.data.rideData.ride_start_time -
                    state.rideData.actual_arrival_time) /
                    1000,
                ),
              ),
            }
          : baseMerged;

      if (action.data.should_persist) {
        const { rideData: _rd, ...restToStore } = action.data;
        const current = activeRideStorage.get([ACTIVE_RIDE_STORAGE_KEY]);
        activeRideStorage.set(
          [ACTIVE_RIDE_STORAGE_KEY],
          filterUndefined({
            ...current,
            ...restToStore,
            // Must use already-merged rideData — shallow spread would wipe stored fields
            rideData: mergedRideData,
          }) as Omit<ActiveRideState, "should_persist">,
        );
      }

      return {
        ...state,
        ...action.data,
        rideData: mergedRideData,
      };
    }
    case "SET-RIDE-STATUS-UPDATE-KEYS": {
      return {
        ...state,
        ride_status_update_keys: action.data,
      };
    }
    case "IS-RIDE-SEARCH-BUTTON-PRESSED": {
      if (action.data.should_persist) {
        const { should_persist, rideData: _rd, ...restToStore } = action.data;
        const current = activeRideStorage.get([ACTIVE_RIDE_STORAGE_KEY]);
        // Deep-merge rideData in storage — same pattern as UPDATE-ACTIVE-RIDE
        const mergedRideData = action.data.rideData
          ? { ...current?.rideData, ...action.data.rideData }
          : current?.rideData;
        activeRideStorage.set(
          [ACTIVE_RIDE_STORAGE_KEY],
          filterUndefined({
            ...current,
            ...restToStore,
            rideData: mergedRideData,
          }) as Omit<ActiveRideState, "should_persist">,
        );
      }
      return {
        ...state,
        ...action.data,
      };
    }
    default:
      return state;
  }
};

export const useActiveRide = () => useContext(Context);
export const useActiveRideState = () => useContext(StateContext);
export default memo(ActiveRideSheetProvider);
