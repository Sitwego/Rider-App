import React, { createContext, useContext } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";

import Icon from "~/components/Icons";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import {
  type LocationPermissionError,
  type LocationPermissionResult,
  type LocationPermissionStatus,
  useLocationPermission,
} from "~/utils/geo";

// ----------------------------------------------------------------
// Context type
// ----------------------------------------------------------------

export interface LocationPermissionContextValue {
  status: LocationPermissionStatus | null;
  isLoading: boolean;
  error: LocationPermissionError | null;
  isFullyGranted: boolean;
  isForegroundGranted: boolean;
  isServicesEnabled: boolean;
  requestForeground: () => Promise<LocationPermissionResult>;
  requestBackground: () => Promise<LocationPermissionResult>;
  refresh: () => Promise<void>;
  openSettings: () => Promise<void>;
  promptEnableServices: () => Promise<void>;
}

// ----------------------------------------------------------------
// Context
// Action defaults throw so any consumer used outside the provider
// fails loudly at development time.
// ----------------------------------------------------------------

const _notMounted = (name: string) => (): never => {
  throw new Error(
    `${name}: useLocationPermissionContext must be used within <LocationPermissionProvider>`,
  );
};

export const LocationPermissionContext =
  createContext<LocationPermissionContextValue>({
    status: null,
    isLoading: true,
    error: null,
    isFullyGranted: false,
    isForegroundGranted: false,
    isServicesEnabled: false,
    requestForeground: _notMounted("requestForeground"),
    requestBackground: _notMounted("requestBackground"),
    refresh: _notMounted("refresh"),
    openSettings: _notMounted("openSettings"),
    promptEnableServices: _notMounted("promptEnableServices"),
  });

// ----------------------------------------------------------------
// Provider
//
// Mount once at the root of the authenticated app (inside MainApp
// in navigation.tsx). Renders a permission gate until the user
// grants foreground location; once granted, renders children and
// keeps the context populated with live state for any descendant.
//
// Every screen below this provider can call
// useLocationPermissionContext() and trust that:
//   - isForegroundGranted is true
//   - isServicesEnabled is true
//   - status is never null
// ----------------------------------------------------------------

export const LocationPermissionProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const permission = useLocationPermission();

  const {
    status,
    isLoading,
    error,
    isFullyGranted,
    isForegroundGranted,
    isServicesEnabled,
    requestForeground,
    requestBackground,
    refresh,
    openSettings,
    promptEnableServices,
  } = permission;

  // ---- Gate: show blocking UI until location is available --------

  if (isLoading && !status) {
    return <CheckingView />;
  }

  if (!isServicesEnabled) {
    return (
      <GpsDisabledView
        onEnable={promptEnableServices}
        onOpenSettings={openSettings}
      />
    );
  }

  if (!isForegroundGranted) {
    return (
      <PermissionDeniedView
        isBlocked={status?.foreground === "blocked"}
        isRequesting={isLoading}
        onRequest={requestForeground}
        onOpenSettings={openSettings}
      />
    );
  }

  // ---- Location available — provide live state to the tree -------

  return (
    <LocationPermissionContext.Provider
      value={{
        status,
        isLoading,
        error,
        isFullyGranted,
        isForegroundGranted,
        isServicesEnabled,
        requestForeground,
        requestBackground,
        refresh,
        openSettings,
        promptEnableServices,
      }}
    >
      {children}
    </LocationPermissionContext.Provider>
  );
};

// ----------------------------------------------------------------
// Consumer hook
// ----------------------------------------------------------------

export const useLocationPermissionContext = () =>
  useContext(LocationPermissionContext);

// ----------------------------------------------------------------
// Gate UI (private to this module — prefixed with _ to signal that)
// ----------------------------------------------------------------

const CheckingView: React.FC = () => {
  const { colors } = useAppTheme();
  return (
    <RnView
      style={[atoms.flex_1, _s.center, { backgroundColor: colors.background }]}
    >
      <ActivityIndicator size="large" color={colors.primary_500} />
      <RnText style={[_s.title, { color: colors.text }]}>
        Checking location…
      </RnText>
    </RnView>
  );
};

const GpsDisabledView: React.FC<{
  onEnable: () => void;
  onOpenSettings: () => void;
}> = ({ onEnable, onOpenSettings }) => {
  const { colors } = useAppTheme();
  return (
    <RnView
      style={[atoms.flex_1, _s.center, { backgroundColor: colors.background }]}
    >
      <Icon name="MapPinOff" size={56} color={colors.gray_400} />
      <RnText style={[_s.title, { color: colors.text }]}>
        GPS is turned off
      </RnText>
      <RnText style={[_s.subtitle, { color: colors.gray_400 }]}>
        Enable location services so we can find your position and show nearby
        drivers.
      </RnText>
      <TouchableOpacity
        style={[_s.primaryBtn, { backgroundColor: colors.primary_500 }]}
        onPress={onEnable}
      >
        <RnText style={_s.primaryLabel}>Enable GPS</RnText>
      </TouchableOpacity>
      <TouchableOpacity style={_s.secondaryBtn} onPress={onOpenSettings}>
        <RnText style={[_s.secondaryLabel, { color: colors.gray_400 }]}>
          Open Settings instead
        </RnText>
      </TouchableOpacity>
    </RnView>
  );
};

const PermissionDeniedView: React.FC<{
  isBlocked: boolean;
  isRequesting: boolean;
  onRequest: () => void;
  onOpenSettings: () => void;
}> = ({ isBlocked, isRequesting, onRequest, onOpenSettings }) => {
  const { colors } = useAppTheme();
  return (
    <RnView
      style={[atoms.flex_1, _s.center, { backgroundColor: colors.background }]}
    >
      <Icon name="MapPin" size={56} color={colors.primary_500} />
      <RnText style={[_s.title, { color: colors.text }]}>
        Location access needed
      </RnText>
      <RnText style={[_s.subtitle, { color: colors.gray_400 }]}>
        {isBlocked
          ? "Location access was permanently denied. Open Settings and enable it to continue."
          : "We need your location to show nearby drivers, calculate fares, and navigate your ride."}
      </RnText>
      {isBlocked ? (
        <TouchableOpacity
          style={[_s.primaryBtn, { backgroundColor: colors.primary_500 }]}
          onPress={onOpenSettings}
        >
          <RnText style={_s.primaryLabel}>Open Settings</RnText>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[
            _s.primaryBtn,
            {
              backgroundColor: colors.primary_500,
              opacity: isRequesting ? 0.6 : 1,
            },
          ]}
          onPress={onRequest}
          disabled={isRequesting}
        >
          {isRequesting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <RnText style={_s.primaryLabel}>Allow Location</RnText>
          )}
        </TouchableOpacity>
      )}
    </RnView>
  );
};

// ----------------------------------------------------------------
// Styles (private)
// ----------------------------------------------------------------

const _s = StyleSheet.create({
  center: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  primaryBtn: {
    marginTop: 6,
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 32,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 200,
  },
  primaryLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryLabel: {
    fontSize: 13,
  },
});
