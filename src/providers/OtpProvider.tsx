import React, {
  ForwardedRef,
  ReactNode,
  useContext,
  useMemo,
  useRef,
} from "react";

import {
  type OTPConfirmationRef,
  OtpConfirmationModal,
} from "~/components/OtpConfirmationModal";

export const Context = React.createContext<OTPConfirmationRef>({
  show_otp_modal: function (props: any): void {},
  hide_otp_modal: function (): void {},
});

const { Provider } = Context;
export const useConfirmOtp = () => useContext(Context);
const OtpProvider = ({ children }: { children: ReactNode }) => {
  const ref: ForwardedRef<OTPConfirmationRef> = useRef(null);

  const getContext = useMemo(
    () => ({
      show_otp_modal: (props: any) => {
        ref.current?.show_otp_modal(props);
      },
      hide_otp_modal: () => {
        ref.current?.hide_otp_modal();
      },
    }),
    [],
  );

  return (
    <Provider value={getContext}>
      <OtpConfirmationModal ref={ref}>{children}</OtpConfirmationModal>
    </Provider>
  );
};
export default OtpProvider;
