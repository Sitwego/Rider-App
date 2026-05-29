import {
  createNavigationContainerRef,
  NavigationContainer,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useEffect, useMemo } from "react";
import { SystemBars } from "react-native-edge-to-edge";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { LocationPermissionProvider } from "./providers/LocationPermissionProvider";
import {
  useGetAndUpdatePushToken,
  useNotificationHandler,
} from "./hooks/notification";
import { BottomTabsNavigator } from "./navigation/bottomTabs";
import ActiveRideSheetProvider from "./providers/ActiveRideProvider";
import { useUserState } from "./providers/AuthProvider";
import LoadingSheetProvider from "./providers/LoadingSheetProvider";
import { LocationPickerProvider } from "./providers/LocationPickerProvider";
import OtpProvider from "./providers/OtpProvider";
import { RideBookingModalProvider } from "./providers/RideBookingModalProvider";
import RideEstimatesSheetProvider from "./providers/RideEstimatesSheetProvider";
import { useAppTheme } from "./ui/theme";
import { darkTheme, lightTheme } from "./ui/theme/theme";
import { ForgotPassword } from "./ui/views/Screens/Auth/ForgotPassword";
import { Join } from "./ui/views/Screens/Auth/Join";
import { Login } from "./ui/views/Screens/Auth/Login";
import { UserInfo } from "./ui/views/Screens/Auth/UserInfo";
import { delay } from "./utils/delay";
import { startBgLocationUpdate, stopBgLocationUpdate } from "./utils/geo";

const navigatetionRef = createNavigationContainerRef();

const AuthStack = createNativeStackNavigator();

const BaseAuthNavigator = () => {
  return (
    <OtpProvider>
      <AuthStack.Navigator
        initialRouteName="Login"
        screenOptions={{ headerShown: false }}
      >
        <AuthStack.Screen name="Login" component={Login} />
        <AuthStack.Screen name="Join" component={Join} />
        <AuthStack.Screen name="ForgotPassword" component={ForgotPassword} />
        <AuthStack.Screen name="UserInfo" component={UserInfo} />
      </AuthStack.Navigator>
    </OtpProvider>
  );
};

export const getCurrentRouteName = () => {
  if (navigatetionRef.isReady()) {
    const route = navigatetionRef.getCurrentRoute();
    return route?.name;
  }
  return null;
};

export const navigateRef = (name: string, params?: object) => {
  if (navigatetionRef.isReady()) {
    return Promise.race([
      new Promise<void>((resolve) => {
        const handler = () => {
          resolve();
          navigatetionRef.removeListener("state", handler);
        };
        navigatetionRef.addListener("state", handler);
        // @ts-ignore
        navigatetionRef.navigate(name, params);
      }),
      delay(1e3),
    ]);
  }
  return Promise.resolve();
};

const MainApp = () => {
  useGetAndUpdatePushToken();
  useNotificationHandler();

  return (
    <LocationPickerProvider>
      <RideBookingModalProvider>
        <ActiveRideSheetProvider>
          <LoadingSheetProvider>
            <RideEstimatesSheetProvider>
              <BottomTabsNavigator />
            </RideEstimatesSheetProvider>
          </LoadingSheetProvider>
        </ActiveRideSheetProvider>
      </RideBookingModalProvider>
    </LocationPickerProvider>
  );
};

export const RouterNavigation = ({ children }: React.PropsWithChildren) => {
  const t = useAppTheme();
  const userState = useUserState();
  const systemBarStyle = useMemo(
    () => (t.themeMode === "dark" ? "light" : "dark"),
    [t.themeMode],
  );
  const theme = useMemo(
    () => (t.themeMode === "dark" ? darkTheme : lightTheme),
    [t],
  );

  console.log("RouterNavigation render with userState:", userState);

  const token = useMemo(() => {
    return userState?.token;
  }, [userState?.token]);

  return (
    <KeyboardProvider>
      <NavigationContainer
        // @ts-ignore
        theme={theme}
        ref={navigatetionRef}
      >
        <SystemBars style={systemBarStyle} />
        {/*
         * LocationPermissionProvider wraps the entire app — both the auth
         * stack and the main app. This means the user must grant location
         * permission before they can sign up, log in, or use any feature.
         * The gate shows a rationale screen; once granted the chosen stack
         * (auth or main) mounts normally and the context is available
         * everywhere via useLocationPermissionContext().
         */}
        <LocationPermissionProvider>
          {token ? <MainApp /> : <BaseAuthNavigator />}
        </LocationPermissionProvider>
      </NavigationContainer>
    </KeyboardProvider>
  );
};
