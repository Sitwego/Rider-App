import {
  type ActionDispatch,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from "react";

import useRidePolling from "~/hooks/queries";
import { useEventAudio } from "~/hooks/useEventAudio";
import {
  nativeBridgeEventEmitter,
  stopWatchingLocationChanges,
  strartWatchingLocationChanges as startWatchingLocationChanges,
} from "~/lib/native";
import { navigateRef } from "~/navigation";
import { getCoordinatesFromLineStr } from "~/utils/geo";

import { useLoadingSheet } from "./LoadingSheetProvider";
import { useRideSearchState } from "./RideBookingModalProvider";

import type {
  DriverArrivedPayload,
  RideEvent,
} from "~/types/rideRequestEvents";
import type {
  ActiveRideState,
  RideRequestData,
} from "~/types/rideRequestTypes";
import type { ActionSheetACTRef } from "~/ui/views/ActiveRideSheet";

export type Action =
  | { type: "SET-ACTIVE-RIDE"; data: Partial<ActiveRideState> }
  | { type: "REMOVE-RIDE" }
  | { type: "UPDATE-ACTIVE-RIDE"; data: Partial<ActiveRideState> }
  | { type: "SET-RIDE-STATUS-UPDATE-KEYS"; data: string[] | undefined }
  | { type: "IS-RIDE-SEARCH-BUTTON-PRESSED"; data: Partial<ActiveRideState> };

export function useRideEvents(
  activeRideId: string | undefined,
  setActiveRideState: ActionDispatch<[action: Action]>,
) {
  const rideEndHandledRef = useRef(false);

  useEffect(() => {
    rideEndHandledRef.current = false;
  }, [activeRideId]);

  const onRideEvent = useCallback(
    async (event: RideEvent) => {
      if (event.ride_id !== activeRideId) return;
      console.log("Received ride event:", event.eventType, event);
      switch (event.eventType) {
        case "RideCancelEvent": {
          console.log("Received RideCancelEvent:", event.eventPayload);
          setActiveRideState({ type: "REMOVE-RIDE" });
          break;
        }
        case "DriverArrivedEvent": {
          console.log("Received DriverArrivedEvent:", event);
          const payload = event.eventPayload as unknown as DriverArrivedPayload;
          setActiveRideState({
            type: "UPDATE-ACTIVE-RIDE",
            data: {
              ride_status: "Arrived",
              rideData: {
                actual_arrival_time: payload.arrival_time,
              } as Partial<RideRequestData>,
              should_persist: true,
            },
          });
          break;
        }
        case "RideStartEvent": {
          console.log("Received RideStartEvent:", event);
          setActiveRideState({
            type: "UPDATE-ACTIVE-RIDE",
            data: {
              ride_status: "Inprogress",
              rideData: {
                ride_start_time: event.timestamp,
              } as Partial<RideRequestData>,
              should_persist: true,
            },
          });
          break;
        }
        case "RideEndEvent": {
          console.log("Received RideEndEvent:", event.ride_id);
          if (rideEndHandledRef.current) break;
          rideEndHandledRef.current = true;
          setActiveRideState({ type: "REMOVE-RIDE" });
          await navigateRef("RatingScreen", {
            driverId: event.driver_id,
            rideId: event.ride_id,
          });
          break;
        }
        default:
          break;
      }
    },
    [activeRideId, setActiveRideState],
  );

  useEffect(() => {
    const sub = nativeBridgeEventEmitter.addListener("rideEvent", onRideEvent);
    return () => sub.remove();
  }, [onRideEvent]);
}

export function useLocationUpdates(
  activeRideId: string | undefined,
  setActiveRideState: ActionDispatch<[action: Action]>,
) {
  useEffect(() => {
    if (!activeRideId) return;
    startWatchingLocationChanges(activeRideId);
    return () => {
      console.log("Stopping location changes for ride:", activeRideId);
      stopWatchingLocationChanges();
    };
  }, [activeRideId]);

  useEffect(() => {
    const sub = nativeBridgeEventEmitter.addListener(
      "locationChange",
      (data) => {
        console.log("Received locationChange event:", data);
        if (!data?.remainingCoordinates) return;
        try {
          const parsedCoordinates = JSON.parse(data.remainingCoordinates);
          setActiveRideState({
            type: "UPDATE-ACTIVE-RIDE",
            data: {
              rideData: {
                // Only the remaining-route remainder; the reducer deep-merges
                // ride_polyline so driver_to_pickup_polyline is preserved.
                ride_polyline: {
                  from_to: parsedCoordinates,
                },
              } as Partial<RideRequestData>,
              should_persist: true,
            },
          });
        } catch (error) {
          console.error(
            "Error parsing remainingCoordinates:",
            data.remainingCoordinates,
            error,
          );
        }
      },
    );
    return () => sub.remove();
  }, [setActiveRideState]);
}

export function useRidePollingEffect(
  rideStatusUpdateKeys: string[] | undefined,
  setActiveRideState: ActionDispatch<[action: Action]>,
) {
  const { playAccept } = useEventAudio();
  const { hide } = useLoadingSheet();
  const { searchData } = useRideSearchState();
  const { data } = useRidePolling(rideStatusUpdateKeys ?? []);

  const resetKeys = useCallback(() => {
    setActiveRideState({
      type: "SET-RIDE-STATUS-UPDATE-KEYS",
      data: undefined,
    });
    hide();
  }, [hide, setActiveRideState]);

  useEffect(() => {
    if (!data) return;
    resetKeys();
    playAccept();
    console.log("Updating active ride state with new data:", data.p1);
    setActiveRideState({
      type: "SET-ACTIVE-RIDE",
      data: {
        rideData: {
          ...data,
          ride_polyline: {
            from_to:
              Array.isArray(data.p1) && data.p1.length > 0
                ? getCoordinatesFromLineStr(data.p1)
                : [],
            // Driver->pickup leg arrives as p2 ([lng,lat] tuples), same shape
            // as p1; convert it the same way for the Accepted-phase marker.
            // Guard for a non-empty array: an empty/absent leg is omitted so
            // the map cleanly falls back to the trip route.
            driver_to_pickup_polyline:
              Array.isArray(data.p2) && data.p2.length > 0
                ? getCoordinatesFromLineStr(data.p2)
                : undefined,
          },
        },
        ride_status: data.request_status,
        should_persist: true,
      },
    });
  }, [data, playAccept, resetKeys, searchData, setActiveRideState]);
}

export function useRideSheet(
  ref: RefObject<ActionSheetACTRef | null>,
  activeRideId: string | undefined,
) {
  useEffect(() => {
    if (!activeRideId) return;
    console.log("Opening Active RideSheet");
    ref.current
      ?.open()
      .then(() => console.log("Active RideSheet opened successfully"))
      .catch((error) =>
        console.error("Error opening Active RideSheet:", error),
      );
  }, [activeRideId, ref]);
}
