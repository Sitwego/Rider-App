import { PlatformPressable } from "@react-navigation/elements";
import { useLinkBuilder } from "@react-navigation/native";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "~/components/Icons";
import { useAppTheme } from "~/ui/theme";

export function TabBar({ state, descriptors, navigation }: any) {
  const { buildHref } = useLinkBuilder();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const focusedTabState = state.routes[state.index]?.state;
  const activeRoute =
    focusedTabState?.routes?.[focusedTabState.index ?? 0]?.name;
  if (activeRoute === "ConfirmPickupScreen") return null;

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.background, // "rgb(30, 61, 73)",
        justifyContent: "space-between",
        alignSelf: "center",
        alignItems: "center",
        borderRadius: 20,
        width: "90%",
        height: 50,
        position: "absolute",
        bottom: insets.bottom + 5, // Adjusted to account for bottom inset
        paddingHorizontal: 20,
      }}
    >
      {state.routes.map(
        (
          route: {
            key: string | number;
            name: string;
            params: object | undefined;
          },
          index: React.Key | null | undefined,
        ) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <PlatformPressable
              key={index}
              href={buildHref(route.name, route.params)}
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={{}}
            >
              <Icon
                name={label}
                size={28}
                color={isFocused ? colors.primary : colors.text}
                strokeWidth={2}
              />
            </PlatformPressable>
          );
        },
      )}
    </View>
  );
}
