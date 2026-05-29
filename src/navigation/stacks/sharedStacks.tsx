/* eslint-disable @typescript-eslint/no-require-imports */
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";

import { ConfirmPickupScreen } from "~/ui/screens/Stacks/ConfirmPickupScreen";
import { RideFairEstimateScreen } from "~/ui/screens/Stacks/RidesFairEstimates";
export const stack = createNativeStackNavigator();
export type Stack = typeof stack;
export function sharedStackScreens(Stack: Stack): React.JSX.Element {
  return (
    <>
      <Stack.Screen
        name="ConfirmPickupScreen"
        options={{ headerShown: false }}
        component={ConfirmPickupScreen}
      />
      <Stack.Screen
        name="RideFairEstimateScreen"
        options={{ headerShown: false }}
        component={RideFairEstimateScreen}
      />
      <Stack.Screen
        name="RideDetailsScreen"
        options={{ headerShown: true }}
        getComponent={() =>
          require("~/ui/views/Screens/RideDetailsScreen").RideDetailsScreen
        }
      />
      <Stack.Screen
        name="RatingScreen"
        options={{ headerShown: false }}
        component={require("~/ui/screens/Stacks/RatingScreen").RatingScreen}
      />
      {/* A Group for modal screens */}
      {/* <Stack.Group
        screenOptions={{
          headerShown: false,
          sheetAllowedDetents: [1.0],
          presentation: "formSheet",
          sheetElevation: 24,
          animation: "slide_from_bottom",
          // unstable_sheetFooter: () => null,
        }}
      >
        
      </Stack.Group> */}
    </>
  );
}
