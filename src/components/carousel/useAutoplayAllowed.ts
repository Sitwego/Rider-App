import { NavigationContext } from "@react-navigation/native";
import { useContext, useEffect, useState } from "react";
import { AccessibilityInfo, AppState } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

/**
 * Focus of the enclosing screen, or `true` outside a navigator — so the
 * carousel can be used anywhere (`useIsFocused` throws without one).
 */
export function useOptionalIsFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setActive(s === "active"),
    );
    return () => sub.remove();
  }, []);
  return active;
}

function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setEnabled);
    const sub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setEnabled,
    );
    return () => sub.remove();
  }, []);
  return enabled;
}

/**
 * Whether auto-advancing content may move: the app is in the foreground,
 * the screen is focused, and the user has neither reduce-motion nor a
 * screen reader on.
 */
export function useAutoplayAllowed(): boolean {
  const focused = useOptionalIsFocused();
  const appActive = useAppActive();
  const reducedMotion = useReducedMotion();
  const screenReader = useScreenReaderEnabled();
  return focused && appActive && !reducedMotion && !screenReader;
}
