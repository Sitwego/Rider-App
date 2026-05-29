import * as Notification from "expo-notifications";
import { useCallback, useEffect, useRef } from "react";

import { isAndroid, isNative } from "~/helpers/device";
import { navigateRef } from "~/navigation";

import { useUpdateDeviceInfo } from "./api";

// ---------------------------------------------------------------------------
// Notification data payload shape sent by the server.
// Every push notification from the backend must include a `data.type` field
// so we know where to route the user on tap.
// ---------------------------------------------------------------------------
type NotificationData =
  | { type: "driver_arrival"; ride_id: string }
  | { type: "ride_updates"; ride_id: string }
  | { type: "chat"; ride_id?: string }
  | { type: "payments"; ride_id?: string }
  | { type: "safety"; ride_id?: string }
  | { type: "promotions" }
  | { type: "reminders" }
  | { type: "account" };

// ---------------------------------------------------------------------------
// Tap handler
// ---------------------------------------------------------------------------

/**
 * Central router called whenever the user taps a notification.
 * Works for all three app states:
 *   - Foreground  → fired immediately via useLastNotificationResponse
 *   - Background  → fired when the user taps the system tray notification
 *   - Cold start  → fired once on mount via useLastNotificationResponse
 *
 * Add new `case` blocks here as you introduce new notification types.
 */
function handleNotificationTap(
  response: Notification.NotificationResponse,
): void {
  const data = response.notification.request.content.data as
    | NotificationData
    | undefined;

  if (!data?.type) return;

  switch (data.type) {
    case "driver_arrival":
    case "ride_updates":
    case "chat":
    case "safety":
      navigateRef("MapPinHouse");
      break;

    // Completed-ride receipt → open the specific ride in history
    case "payments":
      if (data.ride_id) {
        navigateRef("RideHistoryScreen", { rideId: data.ride_id });
      } else {
        navigateRef("Route");
      }
      break;

    case "promotions":
    case "reminders":
      navigateRef("MapPinHouse");
      break;

    case "account":
      navigateRef("CircleUserRound");
      break;

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Global handler — must be set before any notification can arrive
// ---------------------------------------------------------------------------

// Controls how notifications behave when the app is in the foreground.
Notification.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useNotificationHandler() {
  // Covers all three app states via a single reactive value:
  //   - Cold start  → returns the response that opened the app (if any)
  //   - Background  → updates when the user taps a system-tray notification
  //   - Foreground  → updates when the user taps a heads-up notification
  const lastResponse = Notification.useLastNotificationResponse();
  useEffect(() => {
    if (lastResponse) handleNotificationTap(lastResponse);
  }, [lastResponse]);

  useEffect(() => {
    if (!isAndroid) return;

    Promise.all([
      Notification.setNotificationChannelAsync("ride-updates", {
        name: "Ride Updates",
        importance: Notification.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF6B00",
        description: "Real-time updates about your current ride status",
      }),
      Notification.setNotificationChannelAsync("on-driver-arrival", {
        name: "Arrival",
        importance: Notification.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500],
        lightColor: "#ed1380",
        sound: "glory", // glory.mp3 in android/app/src/main/res/raw/
        description: "Alerts when your driver is arriving or has arrived",
      }),
      Notification.setNotificationChannelAsync("safety", {
        name: "Safety Alerts",
        importance: Notification.AndroidImportance.MAX,
        vibrationPattern: [0, 1000, 500, 1000],
        lightColor: "#F44336",
        sound: "glory", // same high-attention sound as driver arrival
        description: "Critical safety notifications and emergency alerts",
      }),
      Notification.setNotificationChannelAsync("chat", {
        name: "Chat Messages",
        importance: Notification.AndroidImportance.HIGH,
        vibrationPattern: [0, 200],
        lightColor: "#9C27B0",
        description: "Messages from your driver or support",
      }),
      Notification.setNotificationChannelAsync("payments", {
        name: "Payments & Receipts",
        importance: Notification.AndroidImportance.HIGH,
        lightColor: "#2196F3",
        description: "Payment confirmations, receipts, and billing alerts",
      }),
      Notification.setNotificationChannelAsync("promotions", {
        name: "Promotions & Offers",
        importance: Notification.AndroidImportance.DEFAULT,
        lightColor: "#FFC107",
        description: "Discounts, promo codes, and special offers",
      }),
      Notification.setNotificationChannelAsync("reminders", {
        name: "Trip Reminders",
        importance: Notification.AndroidImportance.DEFAULT,
        lightColor: "#00BCD4",
        description: "Scheduled ride reminders and trip suggestions",
      }),
      Notification.setNotificationChannelAsync("account", {
        name: "Account Updates",
        importance: Notification.AndroidImportance.LOW,
        description: "Account changes, verification, and general updates",
      }),
    ]).catch(console.error);
  }, []);
}

export function useRequestPushNotificationPermission() {
  const getToken = useGetPushNotificationToken();
  const { mutateAsync: updateDeviceInfo } = useUpdateDeviceInfo();

  return useCallback(
    async (screen: string) => {
      if (!isNative || screen !== "Home") return;

      const permission = await Notification.getPermissionsAsync();
      if (permission.status === "granted" || !permission.canAskAgain) return;

      const response = await Notification.requestPermissionsAsync();
      if (!response.granted) return;

      const token = await getToken();
      if (token) {
        await updateDeviceInfo({ device_token: token }).catch(console.error);
      }
    },
    [getToken, updateDeviceInfo],
  );
}

export function useGetPushNotificationToken() {
  return useCallback(async () => {
    const { granted } = await Notification.getPermissionsAsync();
    if (granted) {
      return (await Notification.getDevicePushTokenAsync()).data;
    }
  }, []);
}

export function useGetAndUpdatePushToken() {
  const registerToken = useGetAndRegisterPushToken();
  const { mutateAsync: updateDeviceInfo } = useUpdateDeviceInfo();
  // Prevents the mount call and the token-refresh listener from racing
  const isRegistering = useRef(false);

  useEffect(() => {
    registerToken().catch(console.error);

    const sub = Notification.addPushTokenListener(({ data }) => {
      if (isRegistering.current) return;
      updateDeviceInfo({ device_token: data }).catch(console.error);
    });

    return () => sub.remove();
  }, [registerToken, updateDeviceInfo]);
}

export function useGetAndRegisterPushToken() {
  const getToken = useGetPushNotificationToken();
  const { mutateAsync: updateDeviceInfo } = useUpdateDeviceInfo();

  return useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    // Small delay to ensure the NavigationContainer is mounted and ready
    // before any side-effects triggered by token registration fire.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await updateDeviceInfo({ device_token: token }).catch(console.error);
  }, [getToken, updateDeviceInfo]);
}
