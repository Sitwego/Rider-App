import React, {
  createContext,
  ForwardedRef,
  useMemo,
  useReducer,
  useRef,
} from "react";

import {
  RideBookingModal,
  RideBookingModalRef,
} from "~/components/rideBooking/RideBookingModal";
import { type RideSearchType } from "~/types/searchDataType";

export type Action =
  | {
      type: "SET-RIDE-SEARCH-RESULT";
      payload: any;
    }
  | {
      type: "REMOVE-SEARCH-RESULTS";
    }
  | {
      type: "UPDATE-SEARCh-RESULTS";
      payload: any;
    }
  | {
      type: "TOGGLE-FINDING-ESTIMATES";
      payload: any;
    };

export type RSState = {
  readonly pickup: any;
  readonly dropOff: any;
  findingEstimates: boolean;
  searchData?: RideSearchType;
};

const reducers = (state: RSState, action: Action): RSState => {
  switch (action.type) {
    case "SET-RIDE-SEARCH-RESULT": {
      return {
        ...state,
        ...action.payload,
      };
    }
    case "REMOVE-SEARCH-RESULTS": {
      return {
        pickup: undefined,
        dropOff: undefined,
        findingEstimates: false,
      };
    }
    case "UPDATE-SEARCh-RESULTS": {
      return {
        ...state,
        ...action.payload,
      };
    }
    case "TOGGLE-FINDING-ESTIMATES": {
      const searchData = action.payload?.searchData;
      return {
        ...state,
        findingEstimates: action.payload.findingEstimates,
        searchData,
      };
    }
    default:
      return state;
  }
};

type RideSearchState = {
  pickup: any;
  dropOff: any;
  findingEstimates: boolean;
  searchData?: RideSearchType;
};

type RideSearchApi = {
  showModal: () => void;
  hideModal: () => void;
  dispatchRideSearchState: React.Dispatch<Action>;
};
const RideSearchStateProvider = createContext<RideSearchState>({
  pickup: undefined,
  dropOff: undefined,
  findingEstimates: false,
});
const Context = createContext<RideSearchApi>({
  showModal: function (): void {
    throw new Error("Function not implemented.");
  },
  hideModal: function (): void {
    throw new Error("Function not implemented.");
  },
  dispatchRideSearchState: function (action: any): void {
    throw new Error("Function not implemented.");
  },
});

export const RideBookingModalProvider: React.FC<
  React.PropsWithChildren<unknown>
> = ({ children }) => {
  const ref: ForwardedRef<RideBookingModalRef> = useRef(null);
  const [rideSearchState, setRideSearchState] = useReducer(
    reducers,
    null,
    () => ({
      pickup: undefined,
      dropOff: undefined,
      findingEstimates: false,
    }),
  );

  const getContext = useMemo(
    () => ({
      showModal: () => {
        ref.current?.open();
      },
      hideModal: () => {
        ref.current?.close();
      },
      dispatchRideSearchState: setRideSearchState,
    }),
    [],
  );
  const state = useMemo(
    () => ({
      ...rideSearchState,
    }),
    [rideSearchState],
  );

  return (
    <RideSearchStateProvider.Provider value={state}>
      <Context.Provider value={getContext}>
        <RideBookingModal ref={ref}>{children}</RideBookingModal>
      </Context.Provider>
    </RideSearchStateProvider.Provider>
  );
};
export const useRideRequsetMoadal = () => React.useContext(Context);
export const useRideSearchState = () =>
  React.useContext(RideSearchStateProvider);
