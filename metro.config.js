const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Force all React/React Native imports to resolve from the app's node_modules.
// This prevents duplicate React errors when a library ships its own nested
// node_modules that include react or react-native (e.g. react-native-place-picker).
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: path.resolve(__dirname, "node_modules/react"),
  "react-native": path.resolve(__dirname, "node_modules/react-native"),
  "react-native-nitro-modules": path.resolve(
    __dirname,
    "node_modules/react-native-nitro-modules",
  ),
};

// Exclude CMake build artifact directories from Metro's file watcher.
// These contain volatile temp files that trigger ENOENT errors during bundling.
config.watchFolders = (config.watchFolders ?? []).filter(Boolean);
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : []),
  /node_modules[/\\].*[/\\]\.cxx[/\\].*/,
  /android[/\\]\.cxx[/\\].*/,
];

module.exports = config;
