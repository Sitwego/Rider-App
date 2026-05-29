// ================================================================
// InAppUpdateProvider
//
// Wraps the app with:
//   • a CONTEXT  — descendants can read update state / trigger checks
//   • a BLOCKER  — for forced updates, renders a full-screen, back-
//                  press-proof overlay above children
//   • a MODAL    — for optional updates, renders a non-blocking sheet
//                  with "Update / Remind me later / Skip this version"
//
// Mount once near the top of the React tree (above any navigation
// stacks). Pass either a static `policy` or a `fetchPolicy` callback
// (or both) so remote config drives the forced/optional decision.
// ================================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import Icon from "~/components/Icons";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";
import {
  InAppUpdateService,
  type UpdateCheckResult,
  type UpdateError,
  type UpdateEvent,
  type UpdateEventListener,
  type UpdateMode,
  type UpdatePolicy,
  useInAppUpdates,
} from "~/utils/inAppUpdates";

// ----------------------------------------------------------------
// Context shape
// ----------------------------------------------------------------

export interface InAppUpdateContextValue {
  mode: UpdateMode;
  result: UpdateCheckResult | null;
  isChecking: boolean;
  isStarting: boolean;
  error: UpdateError | null;
  checkNow: () => Promise<void>;
  startUpdate: () => Promise<void>;
  skipCurrent: () => void;
  remindLater: () => void;
  dismiss: () => void;
}

const _notMounted = (name: string) => (): never => {
  throw new Error(
    `${name}: useInAppUpdateContext must be used within <InAppUpdateProvider>`,
  );
};

export const InAppUpdateContext = createContext<InAppUpdateContextValue>({
  mode: "none",
  result: null,
  isChecking: false,
  isStarting: false,
  error: null,
  checkNow: _notMounted("checkNow"),
  startUpdate: _notMounted("startUpdate"),
  skipCurrent: _notMounted("skipCurrent"),
  remindLater: _notMounted("remindLater"),
  dismiss: _notMounted("dismiss"),
});

export const useInAppUpdateContext = () => useContext(InAppUpdateContext);

// ----------------------------------------------------------------
// Provider props
// ----------------------------------------------------------------

export interface InAppUpdateProviderProps extends React.PropsWithChildren {
  /** Static fallback policy. */
  policy?: UpdatePolicy | null;
  /** Resolves the current policy from remote config. */
  fetchPolicy?: () => Promise<UpdatePolicy | null>;
  /** Analytics sink — receives every update event. */
  onEvent?: UpdateEventListener;
  /**
   * If true, auto-trigger Android IMMEDIATE update without the blocker
   * preamble when a forced update is detected. iOS still shows the
   * blocker since there is no in-app store flow. Defaults to false —
   * showing the blocker first is better UX in most cases.
   */
  autoStartForced?: boolean;
  /** Override the default cooldown windows. */
  checkCooldownMs?: number;
  remindLaterMs?: number;
  /**
   * If true, render the blocker even while the initial check is still
   * loading. Use when your app is incapable of running without an
   * up-to-date version (e.g. critical security release).
   * Defaults to false: children render during the first check.
   */
  blockUntilFirstCheck?: boolean;
  /**
   * Branded support contact, surfaced under the blocker so users with
   * an outdated device that cannot install the new version can reach
   * out for help.
   */
  supportEmail?: string;
}

// ----------------------------------------------------------------
// Provider
// ----------------------------------------------------------------

export const InAppUpdateProvider: React.FC<InAppUpdateProviderProps> = ({
  children,
  policy = null,
  fetchPolicy,
  onEvent,
  autoStartForced = false,
  checkCooldownMs,
  remindLaterMs,
  blockUntilFirstCheck = false,
  supportEmail,
}) => {
  // Wire analytics — single subscription for the provider's lifetime.
  useEffect(() => {
    if (!onEvent) return;
    return InAppUpdateService.addEventListener(onEvent);
  }, [onEvent]);

  const update = useInAppUpdates({
    policy,
    fetchPolicy,
    autoStartForced,
    checkCooldownMs,
    remindLaterMs,
  });

  const {
    mode,
    result,
    isChecking,
    isStarting,
    error,
    showOptional,
    checkNow,
    startUpdate,
    skipCurrent,
    remindLater,
    dismiss,
  } = update;

  // ---- Android back-button: only intercept while blocker is shown.
  //
  // The handler reads a ref-fresh boolean so it never captures a stale
  // value. Returning `true` prevents default (which would normally exit
  // the activity). We do NOT register this when the blocker is hidden —
  // we don't want to interfere with normal in-app navigation.

  const isForcedRef = React.useRef(false);
  isForcedRef.current = mode === "forced";

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (mode !== "forced") return;

    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      // Always block when forced is showing. Never block otherwise.
      return isForcedRef.current;
    });
    return () => sub.remove();
  }, [mode]);

  // ---- Fire the "prompt shown" analytics event once per mode change.

  const lastShownMode = React.useRef<UpdateMode>("none");
  useEffect(() => {
    if (mode === "none") {
      lastShownMode.current = "none";
      return;
    }
    if (mode === lastShownMode.current) return;

    if (mode === "forced") {
      _emit({ name: "update_prompt_shown", mode: "forced" }, onEvent);
    } else if (mode === "optional" && showOptional) {
      _emit({ name: "update_prompt_shown", mode: "optional" }, onEvent);
    }
    lastShownMode.current = mode;
  }, [mode, showOptional, onEvent]);

  // ---- Context value, memoized so consumers don't re-render needlessly.

  const ctx = useMemo<InAppUpdateContextValue>(
    () => ({
      mode,
      result,
      isChecking,
      isStarting,
      error,
      checkNow,
      startUpdate,
      skipCurrent,
      remindLater,
      dismiss,
    }),
    [
      mode,
      result,
      isChecking,
      isStarting,
      error,
      checkNow,
      startUpdate,
      skipCurrent,
      remindLater,
      dismiss,
    ],
  );

  // ---- Render order matters:
  //
  //   1. children (always rendered — keeps navigation / providers warm,
  //      so when the update completes we don't lose state)
  //   2. forced blocker (renders on top, covers everything)
  //   3. optional modal (renders on top, dismissible)
  //
  // Exception: if `blockUntilFirstCheck`, the children are hidden
  // until the first check resolves. This is the safer default for
  // apps where running an outdated binary can corrupt server state.

  const shouldRenderChildren = blockUntilFirstCheck
    ? result !== null || error !== null
    : true;

  return (
    <InAppUpdateContext.Provider value={ctx}>
      {shouldRenderChildren ? children : <_FirstCheckPlaceholder />}

      {mode === "forced" ? (
        <ForcedUpdateScreen
          storeVersion={result?.storeVersion ?? null}
          currentVersion={result?.currentVersion ?? null}
          isStarting={isStarting}
          error={error}
          onUpdate={startUpdate}
          supportEmail={supportEmail}
        />
      ) : null}

      <OptionalUpdateModal
        visible={mode === "optional" && showOptional}
        storeVersion={result?.storeVersion ?? null}
        releaseNotes={result?.policy?.releaseNotes}
        isStarting={isStarting}
        onUpdate={startUpdate}
        onRemindLater={remindLater}
        onSkip={skipCurrent}
        onDismiss={dismiss}
      />
    </InAppUpdateContext.Provider>
  );
};

function _emit(event: UpdateEvent, sink: UpdateEventListener | undefined) {
  if (!sink) return;
  try {
    sink(event);
  } catch {
    // analytics sink errors must never break the provider
  }
}

// ================================================================
// Forced update screen
// ================================================================

const ForcedUpdateScreen: React.FC<{
  storeVersion: string | null;
  currentVersion: string | null;
  isStarting: boolean;
  error: UpdateError | null;
  onUpdate: () => void;
  supportEmail?: string;
}> = ({
  storeVersion,
  currentVersion,
  isStarting,
  error,
  onUpdate,
  supportEmail,
}) => {
  const { colors } = useAppTheme();

  // Disable hardware-back propagation by rendering as a transparent-bg
  // modal with onRequestClose intercepted (Android).
  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      // Android: tapping system back triggers onRequestClose — swallow it.
      onRequestClose={() => {
        // no-op — the forced screen is non-dismissible
      }}
      statusBarTranslucent
      // iOS: full-screen presentation, no swipe-to-dismiss
      presentationStyle="fullScreen"
    >
      <View
        style={[styles.blockerRoot, { backgroundColor: colors.background }]}
        // accessibility: announce as a non-dismissible alert
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
      >
        <View style={styles.blockerInner}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.primary_500 + "22" },
            ]}
          >
            <Icon name="Download" size={48} color={colors.primary_500} />
          </View>

          <RnText style={[styles.title, { color: colors.text }]}>
            Update Required
          </RnText>

          <RnText style={[styles.subtitle, { color: colors.gray_400 }]}>
            A critical update is required to continue. Please install the latest
            version to keep using the app safely.
          </RnText>

          {storeVersion ? (
            <RnText style={[styles.versionLine, { color: colors.gray_400 }]}>
              {currentVersion ? `v${currentVersion} → ` : ""}v{storeVersion}
            </RnText>
          ) : null}

          {error ? (
            <RnText style={[styles.errorText, { color: "#ff6b6b" }]}>
              {error.message}
            </RnText>
          ) : null}

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor: colors.primary_500,
                opacity: isStarting ? 0.6 : 1,
              },
            ]}
            disabled={isStarting}
            onPress={onUpdate}
            accessibilityRole="button"
            accessibilityLabel="Update now"
          >
            {isStarting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <RnText style={styles.primaryLabel}>
                {Platform.OS === "ios" ? "Open App Store" : "Update Now"}
              </RnText>
            )}
          </TouchableOpacity>

          {supportEmail ? (
            <RnText style={[styles.support, { color: colors.gray_400 }]}>
              Trouble updating? Contact {supportEmail}
            </RnText>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

// ================================================================
// Optional update modal
// ================================================================

const OptionalUpdateModal: React.FC<{
  visible: boolean;
  storeVersion: string | null;
  releaseNotes?: string;
  isStarting: boolean;
  onUpdate: () => void;
  onRemindLater: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}> = ({
  visible,
  storeVersion,
  releaseNotes,
  isStarting,
  onUpdate,
  onRemindLater,
  onSkip,
  onDismiss,
}) => {
  const { colors } = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable
        style={styles.modalScrim}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss update prompt"
      >
        <Pressable
          // Stop propagation — taps inside the card must not dismiss.
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.background,
              borderColor: colors.gray_400 + "33",
            },
          ]}
        >
          <View
            style={[
              styles.iconCircleSm,
              { backgroundColor: colors.primary_500 + "22" },
            ]}
          >
            <Icon name="Download" size={28} color={colors.primary_500} />
          </View>

          <RnText style={[styles.modalTitle, { color: colors.text }]}>
            A new version is available
          </RnText>

          {storeVersion ? (
            <RnText style={[styles.modalVersion, { color: colors.gray_400 }]}>
              v{storeVersion}
            </RnText>
          ) : null}

          {releaseNotes ? (
            <RnText
              style={[styles.modalNotes, { color: colors.gray_400 }]}
              numberOfLines={6}
            >
              {releaseNotes}
            </RnText>
          ) : (
            <RnText style={[styles.modalNotes, { color: colors.gray_400 }]}>
              Update to get the latest features and improvements.
            </RnText>
          )}

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              styles.modalBtn,
              {
                backgroundColor: colors.primary_500,
                opacity: isStarting ? 0.6 : 1,
              },
            ]}
            onPress={onUpdate}
            disabled={isStarting}
            accessibilityRole="button"
            accessibilityLabel="Update now"
          >
            {isStarting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <RnText style={styles.primaryLabel}>Update Now</RnText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalBtnGhost}
            onPress={onRemindLater}
            accessibilityRole="button"
            accessibilityLabel="Remind me later"
          >
            <RnText style={[styles.ghostLabel, { color: colors.text }]}>
              Remind me later
            </RnText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalBtnGhost}
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip this version"
          >
            <RnText style={[styles.ghostLabel, { color: colors.gray_400 }]}>
              Skip this version
            </RnText>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ================================================================
// First-check placeholder (only used when blockUntilFirstCheck=true)
// ================================================================

const _FirstCheckPlaceholder: React.FC = () => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { colors } = useAppTheme();
  return (
    <RnView
      style={[
        atoms.flex_1,
        styles.center,
        { backgroundColor: colors.background },
      ]}
    >
      <ActivityIndicator size="large" color={colors.primary_500} />
    </RnView>
  );
};

// ================================================================
// Styles
// ================================================================

const styles = StyleSheet.create({
  blockerRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  blockerInner: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: 16,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  iconCircleSm: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  versionLine: {
    fontSize: 13,
    textAlign: "center",
    marginTop: -4,
  },
  errorText: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
  },
  primaryBtn: {
    marginTop: 8,
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 32,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 220,
  },
  primaryLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  support: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    padding: 22,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  modalVersion: {
    fontSize: 13,
    textAlign: "center",
  },
  modalNotes: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  modalBtn: {
    width: "100%",
    minWidth: 0,
  },
  modalBtnGhost: {
    paddingVertical: 10,
  },
  ghostLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
});
