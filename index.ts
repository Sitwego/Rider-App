// Add this line to your `index.js`
import "react-native-get-random-values";
import messaging from "@react-native-firebase/messaging";
import { registerRootComponent } from "expo";
import * as SplashScreen from "expo-splash-screen";
//@ts-ignore
import { Platform } from "react-native";
//@ts-ignore
import BackgroundTimer from "react-native-background-timer";

import App from "~/App";

// ---------------------------------------------------------------------------
// FCM background / quit-state message handler
//
// This runs in a HEADLESS JS context — there is no React tree, no navigator,
// and no UI. The only safe operations here are storage reads/writes and
// scheduling local notifications.
//
// When this fires:
//   • Notification-type FCM messages  → FCM already displayed the system
//     notification for you. This handler is NOT called for those.
//   • Data-only FCM messages (no `notification` key in the payload) → FCM
//     delivers silently; you must display the notification yourself here.
//
// After the user taps the resulting notification, `useLastNotificationResponse`
// in notification.ts picks it up and routes them to the correct screen.
// ---------------------------------------------------------------------------
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  const { notification, data } = remoteMessage;

  // Notification-type messages are handled by FCM automatically — skip them.
  if (notification) return;
  console.log("Received background FCM message with data:", data);

  // Data-only message: schedule a local notification so the OS shows it.
  // The `data` object must include at minimum a `type` field (matching
  // NotificationData in notification.ts) so the tap handler can route correctly.
  if (data?.type) {
    const { scheduleNotificationAsync, SchedulableTriggerInputTypes } =
      await import("expo-notifications");

    const channelId = (data.channel_id as string | undefined) ?? "ride-updates";

    await scheduleNotificationAsync({
      content: {
        title: (data.title as string) ?? "Notification",
        body: (data.body as string) ?? "",
        data: data as Record<string, unknown>,
        sound: true,
      },
      trigger: {
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        channelId,
      },
    });
  }
});

/**
 * On Android, timers (setTimeout, setInterval) are paused when the app is in the background.
 * See https://github.com/ocetnik/react-native-background-timer
 */

function setUpGloabals() {
  // Let timers run while Android app is in the background.
  if (Platform.OS === "android") {
    global.clearTimeout = BackgroundTimer.clearTimeout.bind(BackgroundTimer);
    global.clearInterval = BackgroundTimer.clearInterval.bind(BackgroundTimer);
    global.setInterval = BackgroundTimer.setInterval.bind(BackgroundTimer);
    //@ts-ignore
    global.setTimeout = (fn: () => void, ms = 0) =>
      BackgroundTimer.setTimeout(fn, ms);
  }
}

setUpGloabals();

// Keep the native splash visible until the app explicitly hides it.
// Must be called as early as possible — before registerRootComponent.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 1000, fade: true });

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
