import React, {
  ForwardedRef,
  ReactNode,
  useContext,
  useMemo,
  useRef,
} from "react";
import LoadingSheet, { type LoadingSheetRef } from "~/components/LoadingSheet";

export const Context = React.createContext<LoadingSheetRef>({
  show: function (): void {},
  hide: function (): void {},
});

const { Provider } = Context;
export const useLoadingSheet = () => useContext(Context);
const LoadingSheetProvider = ({ children }: { children: ReactNode }) => {
  const ref: ForwardedRef<LoadingSheetRef> = useRef(null);

  const getContext = useMemo(
    () => ({
      show: () => {
        ref.current?.show();
      },
      hide: () => {
        ref.current?.hide();
      },
    }),
    [],
  );

  return (
    <Provider value={getContext}>
      <LoadingSheet ref={ref}>{children}</LoadingSheet>
    </Provider>
  );
};
export default LoadingSheetProvider;
