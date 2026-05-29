import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAppTheme } from "~/ui/theme";
import { sharedStackScreens } from "./sharedStacks";
import { RiderHistoryScreen } from "~/ui/screens/RiderHistoryScreen";
import { RiderHomeScreen } from "~/ui/screens/RiderHomeScreen";
import { HelpScreen } from "~/ui/screens/HelpScreen";
import { RiderProfileScreen } from "~/ui/screens/RiderProfileScreen";
import { EditProfileScreen } from "~/ui/screens/EditProfileScreen";
import { UserAddressScreen } from "~/ui/screens/UserAddressScreen";

const RiderHomeScreenStack = createNativeStackNavigator();
const RiderHistoryScreenStack = createNativeStackNavigator();
const HelpScreenStack = createNativeStackNavigator();
const RiderProfileScreenStack = createNativeStackNavigator();

export function RiderHomeScreenTab() {
  const { colors } = useAppTheme();
  return (
    <RiderHomeScreenStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        animationDuration: 300,
        headerStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <RiderHomeScreenStack.Screen
        name="RiderHomeScreen"
        component={RiderHomeScreen}
        options={{ headerShown: false }}
      />
      {sharedStackScreens(RiderHomeScreenStack)}
    </RiderHomeScreenStack.Navigator>
  );
}
export function RiderHistoryScreenTab() {
  const { colors } = useAppTheme();
  return (
    <RiderHistoryScreenStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        animationDuration: 300,
        headerStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <RiderHistoryScreenStack.Screen
        name="RiderHistoryScreen"
        component={RiderHistoryScreen}
      />
      {sharedStackScreens(RiderHistoryScreenStack)}
    </RiderHistoryScreenStack.Navigator>
  );
}

export function HelpScreenTab() {
  const { colors } = useAppTheme();
  return (
    <HelpScreenStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        animationDuration: 300,
        headerStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <HelpScreenStack.Screen name="HelpScreen" component={HelpScreen} />
      {sharedStackScreens(HelpScreenStack)}
    </HelpScreenStack.Navigator>
  );
}

export function RiderProfileScreenTab() {
  const { colors } = useAppTheme();
  return (
    <RiderProfileScreenStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        animationDuration: 300,
        headerStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <RiderProfileScreenStack.Screen
        name="RiderProfileScreen"
        component={RiderProfileScreen}
      />
      <RiderProfileScreenStack.Screen
        name="EditProfileScreen"
        component={EditProfileScreen}
      />
      <RiderProfileScreenStack.Screen
        name="UserAddressScreen"
        component={UserAddressScreen}
      />
      {sharedStackScreens(RiderProfileScreenStack)}
    </RiderProfileScreenStack.Navigator>
  );
}
