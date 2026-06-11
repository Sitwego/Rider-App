import { TrueSheetProvider } from "@lodev09/react-native-true-sheet";
import { ReanimatedTrueSheetProvider } from "@lodev09/react-native-true-sheet/reanimated";
import * as SplashScreen from "expo-splash-screen";
import { FiberProvider } from "its-fine";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { RootSiblingParent } from "react-native-root-siblings";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureDetectorProvider } from "react-native-screens/gesture-handler";

import { NetworkQueryProvider } from "../lib/net";

import { ToastComponent } from "./components/Toast";
import { RouterNavigation } from "./navigation";
import { AuthProvider } from "./providers/AuthProvider";
import { InAppUpdateProvider } from "./providers/InAppUpdateProvider";
import { Provider } from "./providers/Portal";
import { ThemeProvider } from "./ui/theme";
import { atoms } from "./ui/theme/atoms";

import type { UpdatePolicy } from "./utils/inAppUpdates";

// import "~/lib/bgJobs";

// Static fallback policy — kept here as a module constant so it has a
// stable reference identity across renders (avoids re-running the
// fetchPolicy effect when App re-renders).
//
// CRITICAL: `minSupportedVersion` must ALWAYS be <= the version currently
// installed on devices in the wild. If it is higher (e.g. "1.0.0" while the
// app ships as "0.0.18-alpha"), `_resolveMode` treats every install as
// "below minimum" and shows the forced-update blocker on every cold start.
//
// Leaving it undefined means "no hard minimum" — only an explicit
// forceUpdate flag or a newer store build will trigger a prompt. Raise
// minSupportedVersion only via remote config once the matching build has
// been live for 24h+.
const STATIC_UPDATE_POLICY: UpdatePolicy = {
  forceUpdate: false,
};

// Resolves the live policy from your backend / remote config. Returning
// null falls back to STATIC_UPDATE_POLICY — never throws. Replace the
// URL with your actual /app-config endpoint.
//
// Hoisted outside the component so its identity is stable.
const fetchUpdatePolicy = async (): Promise<UpdatePolicy | null> => {
  // TODO: replace with your real remote-config endpoint. Until then,
  // returning null causes the provider to use STATIC_UPDATE_POLICY only.
  return null;
};

const App: React.FC = () => {
  useEffect(() => {
    // Keep the splash screen visible while we fetch resources
    SplashScreen.preventAutoHideAsync();
  }, []);
  return (
    <SafeAreaProvider>
      <FiberProvider>
        <ThemeProvider themeMode="dark">
          <Provider>
            <RootSiblingParent>
              <GestureHandlerRootView style={[atoms.flex_1]}>
                <GestureDetectorProvider>
                  <TrueSheetProvider>
                    <ReanimatedTrueSheetProvider>
                      <NetworkQueryProvider clientId="">
                        <AuthProvider>
                          {/*
                           * Mounted INSIDE AuthProvider so authenticated
                           * API helpers are available for fetchPolicy if
                           * the remote-config endpoint requires auth.
                           *
                           * Mounted ABOVE RouterNavigation so the blocker
                           * covers every screen including the splash and
                           * auth flows.
                           */}
                          <InAppUpdateProvider
                            policy={STATIC_UPDATE_POLICY}
                            fetchPolicy={fetchUpdatePolicy}
                            onEvent={(e) => {
                              if (__DEV__) {
                                console.log("[InAppUpdate]", e.name, e);
                              }
                              // TODO: forward to analytics (Segment / Mixpanel / Firebase).
                            }}
                            supportEmail="support@transli.com"
                          >
                            <RouterNavigation />
                            <ToastComponent />
                          </InAppUpdateProvider>
                        </AuthProvider>
                      </NetworkQueryProvider>
                    </ReanimatedTrueSheetProvider>
                  </TrueSheetProvider>
                </GestureDetectorProvider>
              </GestureHandlerRootView>
            </RootSiblingParent>
          </Provider>
        </ThemeProvider>
      </FiberProvider>
    </SafeAreaProvider>
  );
};

export default App;
