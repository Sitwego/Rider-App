const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";

/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: "mobility-customer",
  slug: "mobility-customer",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0F2424",
  },
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    config: {
      googleMaps: {
        apiKey: googleMapsApiKey,
      },
    },
    googleServicesFile: "./google-services.json",
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      // "ACCESS_BACKGROUND_LOCATION", // TODO: re-enable when background location is needed
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
    ],
    package: "com.transli.mobilitycustomer",
  },
  web: {
    favicon: "",
  },
  plugins: [
    [
      "react-native-edge-to-edge",
      {
        android: {
          parentTheme: "Default",
          enforceNavigationBarContrast: false,
        },
      },
    ],
    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey: googleMapsApiKey,
      },
    ],
    [
      "expo-location",
      {
        // locationAlwaysPermission: "Allow $(PRODUCT_NAME) to use your location at all times.",
        // isAndroidBackgroundLocationEnabled: true, // TODO: re-enable when background location is needed
        isAndroidForegroundServiceEnabled: true,
        androidForegroundService: {
          notificationTitle: "Mobility Customer",
          notificationBody: "Tracking your location in the background",
        },
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/adaptive-icon.png",
        color: "#0f1e24",
        androidMode: "default",
        sounds: ["./assets/glory.mp3"],
      },
    ],
    "@react-native-firebase/app",
    "@react-native-firebase/auth",
    "@react-native-firebase/messaging",
    "@react-native-google-signin/google-signin",
    "expo-audio",
    "expo-image",
    "expo-asset",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0F2424",
        image: "./assets/splash-icon.png",
        resizeMode: "cover",
      },
    ],
  ],
  extra: {
    eas: {
      projectId: "13d4013d-ebcc-4642-bacd-b6d742caad26",
    },
  },
  experiments: {
    reactCompiler: true,
  },
  owner: "transli",
};

module.exports = config;
