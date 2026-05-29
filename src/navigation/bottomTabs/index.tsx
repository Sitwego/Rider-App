import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { TabBar } from "./tabBar";
import {
  HelpScreenTab,
  RiderHistoryScreenTab,
  RiderHomeScreenTab,
  RiderProfileScreenTab,
} from "../stacks";
const BottomTabs = createBottomTabNavigator();

export const BottomTabsNavigator = () => {
  return (
    <BottomTabs.Navigator
      backBehavior="initialRoute"
      detachInactiveScreens={true}
      tabBar={(tabsProps) => <TabBar {...tabsProps} />}
      screenOptions={{
        tabBarStyle: [
          {
            height: 300,
            borderTopWidth: 1,
            elevation: 5,
          },
        ],
        tabBarShowLabel: false,
        headerShown: false,
        popToTopOnBlur: true,
      }}
    >
      <BottomTabs.Screen
        name="MapPinHouse"
        component={RiderHomeScreenTab}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // Prevent default action
            e.preventDefault();

            // Do something manually
            navigation.navigate("MapPinHouse");
          },
        })}
      />
      <BottomTabs.Screen
        name="Route"
        component={RiderHistoryScreenTab}
        options={{ tabBarStyle: { display: "none" } }}
      />
      <BottomTabs.Screen
        name="Headset"
        component={HelpScreenTab}
        options={{ tabBarStyle: { display: "none" } }}
      />
      <BottomTabs.Screen
        name="CircleUserRound"
        component={RiderProfileScreenTab}
        options={{ tabBarStyle: { display: "none" } }}
      />
    </BottomTabs.Navigator>
  );
};
