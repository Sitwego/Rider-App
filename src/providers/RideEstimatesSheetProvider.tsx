import React, {
  ForwardedRef,
  ReactNode,
  useContext,
  useMemo,
  useRef,
} from "react";

import { RideEstimatesSheet } from "~/ui/views/RideEstimateSheet";

export const Context = React.createContext<ActionSheetACT>({
  show: async function (): Promise<void> {},
  hide: async function (): Promise<void> {},
});

const { Provider } = Context;
export const useRideEstimateBottomSheet = () => useContext(Context);
const RideEstimatesSheetProvider = ({ children }: { children: ReactNode }) => {
  const ref: ForwardedRef<ActionSheetACT> = useRef(null);

  const getContext: ActionSheetACT = useMemo(
    () => ({
      show: async () => {
        ref.current?.show();
      },
      hide: async () => {
        ref.current?.hide();
      },
    }),
    [],
  );

  return (
    <Provider value={getContext}>
      <RideEstimatesSheet ref={ref}>{children}</RideEstimatesSheet>
    </Provider>
  );
};
export default RideEstimatesSheetProvider;

export interface ActionSheetACT {
  show: () => Promise<void>;
  hide: () => Promise<void>;
}
