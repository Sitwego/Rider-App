import { getAuth, onAuthStateChanged } from "@react-native-firebase/auth";
import React, { ReactNode, useCallback, useEffect } from "react";

import { useCreateCustomer } from "~/hooks/useUserApis";
import { activeRideStorage, userProfileStorage } from "~/storage";
import { CreateAccountType, UserState } from "~/types/accountTypes";

export const UserStateContext = React.createContext<UserState>({});

type AuthApi = {
  login: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  signup: (data: CreateAccountType) => Promise<void>;
};

const notImplemented = (): Promise<never> => {
  throw new Error("AuthProvider not mounted");
};

export const AuthApiContext = React.createContext<AuthApi>({
  login: notImplemented,
  logout: notImplemented,
  signup: notImplemented,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [userState, dispatch] = React.useReducer(reducers, null, () => {
    return userProfileStorage.get(["user_profile"]) ?? {};
  });

  const { mutateAsync: createAccount } = useCreateCustomer();

  const createCustomerAccount = useCallback(
    async (data: CreateAccountType) => {
      const response = await createAccount(data);
      dispatch({
        type: "SET_USER",
        payload: {
          token: response?.token,
          user: {
            id: response.profile_id,
            email: "",
            phone_number: "",
            name: "",
          },
        },
      });
    },
    [createAccount],
  );

  const loginCustomer = useCallback(async (data: any) => {
    dispatch({
      type: "SET_USER",
      payload: {
        token: data.token,
        user: {
          id: data.id,
          email: data.email,
          phone_number: data.phone_number,
          name: data?.name || "",
        },
      },
    });
  }, []);

  const authApi = React.useMemo(
    () => ({
      login: loginCustomer,
      logout: async () => {
        await getAuth()
          .signOut()
          .catch(() => {});
        activeRideStorage.remove(["active_ride"]);
        dispatch({ type: "LOGOUT" });
      },
      signup: createCustomerAccount,
    }),
    [createCustomerAccount, loginCustomer],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), (user) => {
      if (!user) {
        dispatch({ type: "LOGOUT" });
      }
    });

    return unsubscribe;
  }, []);

  return (
    <UserStateContext.Provider value={userState}>
      <AuthApiContext.Provider value={authApi}>
        {children}
      </AuthApiContext.Provider>
    </UserStateContext.Provider>
  );
};

type Actions =
  | { type: "SET_USER"; payload: UserState }
  | { type: "LOGOUT" }
  | { type: "UPDATE_USER"; payload: Partial<UserState> }
  | { type: "SET_TOKEN"; payload: string };

const reducers = (state: UserState, act: Actions): UserState => {
  switch (act.type) {
    case "SET_USER": {
      userProfileStorage.set(["user_profile"], act.payload);
      return { ...state, ...act.payload };
    }
    case "LOGOUT": {
      userProfileStorage.remove(["user_profile"]);
      return {};
    }
    case "UPDATE_USER": {
      const next = { ...state, ...act.payload };
      userProfileStorage.set(["user_profile"], next);
      return next;
    }
    case "SET_TOKEN": {
      const next = { ...state, token: act.payload };
      userProfileStorage.set(["user_profile"], next);
      return next;
    }
    default:
      return state;
  }
};

export const useUserState = () => React.useContext(UserStateContext);
export const useAuthApi = () => React.useContext(AuthApiContext);
