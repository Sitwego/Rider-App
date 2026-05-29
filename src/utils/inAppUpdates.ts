// ================================================================
// IN-APP UPDATE SYSTEM
//
// Layering:
//   1. UpdatePolicy       — remote-config-driven decision input
//   2. InAppUpdateService — stateless module, dedupes in-flight checks,
//                            owns persistence, no React
//   3. useInAppUpdates    — React hook: AppState integration, cooldown,
//                            mode resolution, lifecycle
//   4. InAppUpdateProvider — context + blocker/modal UI (see provider file)
//
// Why this split: the package itself only knows "is there a newer
// build on the store?". It cannot tell you whether that update is
// MANDATORY. We layer policy (force flag + min supported version)
// on top of the package's answer to derive `forced | optional | none`.
//
// Package quirks worth knowing (expo-in-app-updates@0.9.0):
//   • No event listeners. There is NO addUpdateListener / 'updateCancelled'.
//     Cancellation is detected implicitly: startUpdate() resolves and the
//     app returns to the foreground without a version bump.
//   • Android IMMEDIATE blocks via Play's native overlay; flexible only
//     downloads in background — without listeners we cannot reliably
//     install a flexible update, so we treat flexible as "redirect-style"
//     and reserve immediate for forced.
//   • iOS has no true in-app update. startUpdate() opens the App Store.
//     The user can always come back without updating, so enforcement
//     has to happen in our own UI (the blocker screen).
// ================================================================

import * as Application from "expo-application";
import * as ExpoInAppUpdates from "expo-in-app-updates";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";

import { Storage } from "~/storage";

// ----------------------------------------------------------------
// Public types
// ----------------------------------------------------------------

/**
 * Decision input — typically loaded from remote config (Firebase
 * Remote Config, LaunchDarkly, your own /config endpoint).
 *
 * The provider treats a check as "forced" when ANY of:
 *   • forceUpdate === true
 *   • currentVersion is below minSupportedVersion (semver)
 *
 * Otherwise, if the store has a newer build → "optional".
 */
export interface UpdatePolicy {
  /** Minimum semver the user is allowed to run. Below this → forced. */
  minSupportedVersion?: string;
  /** Latest version available — displayed in the optional update modal. */
  latestVersion?: string;
  /** Hard override: if true, force regardless of version comparison. */
  forceUpdate?: boolean;
  /** Optional release notes for the optional update modal. */
  releaseNotes?: string;
  /**
   * Rollout gate (0–100). The provider hashes a stable device id and
   * compares; below the cutoff, optional prompts are shown.
   * Forced updates IGNORE rollout — safety overrides experimentation.
   */
  rolloutPercentage?: number;
}

export type UpdateMode = "forced" | "optional" | "none";

export interface UpdateCheckResult {
  mode: UpdateMode;
  updateAvailable: boolean;
  /** Store version string. On Android this is the versionCode. */
  storeVersion: string | null;
  /** Currently installed app semver (iOS) or version name (Android). */
  currentVersion: string;
  /** Android only — set by the Play SDK based on update priority. */
  immediateAllowed: boolean;
  flexibleAllowed: boolean;
  /** Android only — days since Play knew about the update. */
  daysSinceRelease: number | null;
  policy: UpdatePolicy | null;
}

export type UpdateErrorCode =
  | "UNSUPPORTED_PLATFORM" // web or unknown OS
  | "DEV_MODE" // running __DEV__ — never check
  | "CHECK_FAILED" // checkForUpdate threw
  | "START_FAILED" // startUpdate threw or returned false
  | "STORE_UNAVAILABLE" // Play services missing / device unsupported
  | "ALREADY_IN_PROGRESS" // a concurrent call is already running
  | "NETWORK_ERROR"; // best-effort network failure detection

export interface UpdateError {
  code: UpdateErrorCode;
  message: string;
  /** True when the user (or AppState) can retry without reinstalling. */
  recoverable: boolean;
}

export type UpdateResult =
  | { ok: true; data: UpdateCheckResult }
  | { ok: false; error: UpdateError };

/**
 * Structured analytics events — wired by the provider's onEvent prop.
 * Names are stable so analytics dashboards can be built against them.
 */
export type UpdateEvent =
  | { name: "update_check_started"; trigger: "mount" | "resume" | "manual" }
  | {
      name: "update_check_completed";
      mode: UpdateMode;
      updateAvailable: boolean;
      storeVersion: string | null;
      currentVersion: string;
    }
  | { name: "update_check_failed"; code: UpdateErrorCode; message: string }
  | { name: "update_prompt_shown"; mode: "forced" | "optional" }
  | {
      name: "update_prompt_dismissed";
      mode: "forced" | "optional";
      action: "update_now" | "remind_later" | "skip_version";
    }
  | { name: "update_start_called"; immediate: boolean }
  | {
      name: "update_start_failed";
      code: UpdateErrorCode;
      message: string;
    }
  | { name: "update_blocked"; reason: "min_version" | "force_flag" };

export type UpdateEventListener = (event: UpdateEvent) => void;

// ----------------------------------------------------------------
// Persistence layer
//
// Using the project's MMKV-backed Storage abstraction (see
// src/storage/index.ts). MMKV is synchronous and faster than
// AsyncStorage; we chose it to match the rest of the codebase.
// ----------------------------------------------------------------

type InAppUpdateSchema = {
  /** Versions the user explicitly chose to skip (optional updates only). */
  skipped_versions: string[];
  /** Unix ms — last time the user tapped "Remind me later". */
  last_remind_later_at: number;
  /** Unix ms — last successful checkForUpdate() resolution. */
  last_check_at: number;
  /** Stable per-install id used for rollout bucketing. */
  bucket_id: string;
};

export const IN_APP_UPDATE_STORAGE_KEY = "in_app_updates";

const updateStorage = new Storage<[], InAppUpdateSchema>(
  IN_APP_UPDATE_STORAGE_KEY,
);

// ----------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------

/** Minimum interval between automatic checks. Protects from check spam. */
export const DEFAULT_CHECK_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * After the user taps "Remind me later", suppress the optional modal
 * for this long. Forced updates ignore this — they cannot be deferred.
 */
export const DEFAULT_REMIND_LATER_MS = 24 * 60 * 60 * 1000; // 24 hours

/** AppState resume debounce — avoids a flurry of checks on app switches. */
const APPSTATE_DEBOUNCE_MS = 800;

// ----------------------------------------------------------------
// Semver helpers (X.Y.Z only — no pre-release support).
// Avoids pulling in a dependency for one comparison.
// ----------------------------------------------------------------

function parseSemver(
  v: string | null | undefined,
): [number, number, number] | null {
  if (!v) return null;
  const parts = v.split(".").map((p) => parseInt(p, 10));
  if (parts.length < 1 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** Returns -1 if a < b, 1 if a > b, 0 if equal/unknown. */
export function compareSemver(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (!va || !vb) return 0;
  for (let i = 0; i < 3; i++) {
    if (va[i] < vb[i]) return -1;
    if (va[i] > vb[i]) return 1;
  }
  return 0;
}

// ----------------------------------------------------------------
// Internal: cheap deterministic hash for rollout bucketing.
// FNV-1a (32-bit). Stable across runs given the same input.
// ----------------------------------------------------------------

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash =
      (hash +
        ((hash << 1) +
          (hash << 4) +
          (hash << 7) +
          (hash << 8) +
          (hash << 24))) >>>
      0;
  }
  return hash >>> 0;
}

function inRollout(deviceId: string, percentage: number | undefined): boolean {
  if (percentage == null || percentage >= 100) return true;
  if (percentage <= 0) return false;
  const bucket = fnv1a(deviceId) % 100;
  return bucket < percentage;
}

function getCurrentVersion(): string {
  // nativeApplicationVersion: iOS CFBundleShortVersionString / Android versionName
  // Fall back to "0.0.0" so semver comparisons remain well-defined.
  return Application.nativeApplicationVersion ?? "0.0.0";
}

function getStableDeviceId(): string {
  // Persist a random per-install id so rollout bucketing is well-
  // distributed across devices but stable for any given install.
  // applicationId alone has zero entropy across users.
  let id = updateStorage.get(["bucket_id"]);
  if (!id) {
    id = `${Application.applicationId ?? "app"}::${Date.now().toString(36)}::${Math.random()
      .toString(36)
      .slice(2)}`;
    updateStorage.set(["bucket_id"], id);
  }
  return id;
}

// ----------------------------------------------------------------
// InAppUpdateService
// Stateless module — safe to call outside React (e.g., navigation
// guards, deep-link handlers, push-notification handlers).
//
// Internally holds:
//   • _inflight: dedupes concurrent checkForUpdate() calls so two
//                providers / hooks / navigations don't double-fire.
// ----------------------------------------------------------------

let _inflight: Promise<UpdateResult> | null = null;
let _listeners: Set<UpdateEventListener> = new Set();

function _emit(event: UpdateEvent) {
  _listeners.forEach((l) => {
    try {
      l(event);
    } catch {
      // listener crashes must not affect update flow
    }
  });
}

function _makeError(
  code: UpdateErrorCode,
  message: string,
  recoverable: boolean,
): UpdateError {
  return { code, message, recoverable };
}

function _resolveMode(
  updateAvailable: boolean,
  currentVersion: string,
  policy: UpdatePolicy | null,
  deviceId: string,
): UpdateMode {
  // Below minSupportedVersion → ALWAYS forced, regardless of store state.
  // This guards against the case where a critical fix is shipped but
  // the user has Play auto-update disabled — we still block them.
  if (policy?.minSupportedVersion) {
    if (compareSemver(currentVersion, policy.minSupportedVersion) < 0) {
      _emit({ name: "update_blocked", reason: "min_version" });
      return "forced";
    }
  }

  if (policy?.forceUpdate) {
    _emit({ name: "update_blocked", reason: "force_flag" });
    return "forced";
  }

  if (!updateAvailable) return "none";

  // Optional updates respect rollout — gradual ramp for new versions.
  if (!inRollout(deviceId, policy?.rolloutPercentage)) return "none";

  return "optional";
}

export const InAppUpdateService = {
  /**
   * Run a check. Idempotent across concurrent callers — returns the same
   * promise to the second caller. Does NOT show any UI.
   *
   * @param policy  Remote-config policy (or null to defer to store-only).
   */
  async check(policy: UpdatePolicy | null = null): Promise<UpdateResult> {
    // Hard skips — never check on dev / web. The package's native modules
    // are not present in those environments and would throw.
    if (__DEV__) {
      return {
        ok: false,
        error: _makeError(
          "DEV_MODE",
          "Update checks disabled in __DEV__.",
          false,
        ),
      };
    }
    if (Platform.OS === "web") {
      return {
        ok: false,
        error: _makeError(
          "UNSUPPORTED_PLATFORM",
          "In-app updates are not supported on web.",
          false,
        ),
      };
    }

    if (_inflight) return _inflight;

    _inflight = (async () => {
      const currentVersion = getCurrentVersion();
      const deviceId = getStableDeviceId();

      try {
        const result = await ExpoInAppUpdates.checkForUpdate();

        // Persist last-check timestamp on success so AppState resumes
        // don't re-check inside the cooldown window.
        updateStorage.set(["last_check_at"], Date.now());

        const mode = _resolveMode(
          !!result.updateAvailable,
          currentVersion,
          policy,
          deviceId,
        );

        const data: UpdateCheckResult = {
          mode,
          updateAvailable: !!result.updateAvailable,
          storeVersion: result.storeVersion ?? null,
          currentVersion,
          immediateAllowed: !!result.immediateAllowed,
          flexibleAllowed: !!result.flexibleAllowed,
          daysSinceRelease:
            result.daysSinceRelease != null
              ? parseInt(String(result.daysSinceRelease), 10)
              : null,
          policy,
        };

        _emit({
          name: "update_check_completed",
          mode,
          updateAvailable: data.updateAvailable,
          storeVersion: data.storeVersion,
          currentVersion: data.currentVersion,
        });

        return { ok: true, data };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Update check failed";
        // The native module on Android throws when Play Services is
        // missing / device-side updates are disabled.
        const code: UpdateErrorCode = message.toLowerCase().includes("play")
          ? "STORE_UNAVAILABLE"
          : message.toLowerCase().includes("network")
            ? "NETWORK_ERROR"
            : "CHECK_FAILED";

        _emit({ name: "update_check_failed", code, message });

        return { ok: false, error: _makeError(code, message, true) };
      } finally {
        _inflight = null;
      }
    })();

    return _inflight;
  },

  /**
   * Trigger the actual update flow.
   *
   * Android:
   *   • immediate=true → Play overlay covers the app. Returns when the
   *     overlay is dismissed (success OR user cancel).
   *   • immediate=false → Play starts a background download. Without
   *     install listeners we cannot reliably complete a flexible update;
   *     callers should prefer immediate for forced updates.
   * iOS:
   *   • Opens the App Store via openURL. The `immediate` param is ignored.
   */
  async start(immediate: boolean): Promise<UpdateResult> {
    if (__DEV__ || Platform.OS === "web") {
      return {
        ok: false,
        error: _makeError(
          "UNSUPPORTED_PLATFORM",
          "Cannot start an update on this platform.",
          false,
        ),
      };
    }

    _emit({ name: "update_start_called", immediate });

    try {
      const ok = await ExpoInAppUpdates.startUpdate(
        Platform.OS === "android" ? immediate : false,
      );

      if (ok === false) {
        // startUpdate returns false when Play declines the request — for
        // example because the update priority does not allow the chosen
        // flow, or because the app was just installed and Play is still
        // syncing. Treat as recoverable; the caller may re-check later.
        const err = _makeError(
          "START_FAILED",
          "Update could not be started. Please try again.",
          true,
        );
        _emit({
          name: "update_start_failed",
          code: err.code,
          message: err.message,
        });
        return { ok: false, error: err };
      }

      // Re-check after the user comes back from the store flow so the
      // provider can update its mode (e.g. drop the blocker if updated).
      return InAppUpdateService.check(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to start update";
      const err = _makeError("START_FAILED", message, true);
      _emit({
        name: "update_start_failed",
        code: err.code,
        message: err.message,
      });
      return { ok: false, error: err };
    }
  },

  // -------- Persisted user choices --------

  isVersionSkipped(version: string | null | undefined): boolean {
    if (!version) return false;
    const list = updateStorage.get(["skipped_versions"]) ?? [];
    return list.includes(version);
  },

  skipVersion(version: string): void {
    const list = updateStorage.get(["skipped_versions"]) ?? [];
    if (!list.includes(version)) {
      updateStorage.set(["skipped_versions"], [...list, version]);
    }
  },

  /**
   * Clear skipped versions older than the current store version so the
   * user is not permanently locked into skipping every release.
   * Call this from a cleanup task on app start.
   */
  pruneSkippedVersions(storeVersion: string | null): void {
    if (!storeVersion) return;
    const list = updateStorage.get(["skipped_versions"]) ?? [];
    const next = list.filter((v) => compareSemver(v, storeVersion) >= 0);
    if (next.length !== list.length) {
      updateStorage.set(["skipped_versions"], next);
    }
  },

  remindLater(): void {
    updateStorage.set(["last_remind_later_at"], Date.now());
  },

  isInRemindLaterCooldown(
    now = Date.now(),
    windowMs = DEFAULT_REMIND_LATER_MS,
  ): boolean {
    const last = updateStorage.get(["last_remind_later_at"]) ?? 0;
    return now - last < windowMs;
  },

  isInCheckCooldown(
    now = Date.now(),
    windowMs = DEFAULT_CHECK_COOLDOWN_MS,
  ): boolean {
    const last = updateStorage.get(["last_check_at"]) ?? 0;
    return now - last < windowMs;
  },

  // -------- Analytics --------

  addEventListener(listener: UpdateEventListener): () => void {
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  },

  /** Test-only: reset persisted state. Never call from app code. */
  __resetForTest(): void {
    updateStorage.remove(["skipped_versions"]);
    updateStorage.remove(["last_remind_later_at"]);
    updateStorage.remove(["last_check_at"]);
    _inflight = null;
    _listeners = new Set();
  },
} as const;

// ----------------------------------------------------------------
// useInAppUpdates hook
//
// Wraps the service with React state, AppState integration, and the
// remind-later / skip-version cooldowns. The provider consumes this;
// most app code should consume the provider's context instead.
// ----------------------------------------------------------------

export interface UseInAppUpdatesOptions {
  /** Static policy. Either this OR fetchPolicy (or both) should be supplied. */
  policy?: UpdatePolicy | null;
  /**
   * Resolves the latest policy from remote config. Called before each
   * check. Errors are swallowed — the static `policy` is used as fallback.
   */
  fetchPolicy?: () => Promise<UpdatePolicy | null>;
  /**
   * If true, the hook calls `start(immediate)` automatically when a
   * forced update is detected. Defaults to false — the provider's
   * blocker UI presents a CTA the user can tap.
   *
   * Set to true only if you want Play's IMMEDIATE overlay to take over
   * the screen with no preamble. Note: on iOS this would yank the user
   * straight to the App Store with no context, which usually scores
   * poorly in user research.
   */
  autoStartForced?: boolean;
  /** Override default check cooldown (ms). */
  checkCooldownMs?: number;
  /** Override default remind-later window (ms). */
  remindLaterMs?: number;
  /** Skip the cooldown on mount (use for explicit retry buttons). */
  forceImmediateCheck?: boolean;
}

export interface UseInAppUpdatesState {
  mode: UpdateMode;
  result: UpdateCheckResult | null;
  isChecking: boolean;
  isStarting: boolean;
  error: UpdateError | null;
  /** True when the optional modal should be visible (after cooldown checks). */
  showOptional: boolean;
}

export interface UseInAppUpdatesActions {
  /** Run a check now. Bypasses the cooldown. */
  checkNow: () => Promise<void>;
  /** Trigger the store flow. */
  startUpdate: () => Promise<void>;
  /** Mark current store version as skipped (optional updates). */
  skipCurrent: () => void;
  /** Suppress the optional prompt for `remindLaterMs`. */
  remindLater: () => void;
  /** Hide the optional modal without persisting a choice. */
  dismiss: () => void;
}

export function useInAppUpdates(
  options: UseInAppUpdatesOptions = {},
): UseInAppUpdatesState & UseInAppUpdatesActions {
  const {
    policy: staticPolicy = null,
    fetchPolicy,
    autoStartForced = false,
    checkCooldownMs = DEFAULT_CHECK_COOLDOWN_MS,
    remindLaterMs = DEFAULT_REMIND_LATER_MS,
    forceImmediateCheck = false,
  } = options;

  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<UpdateError | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number>(0);

  // Refs to avoid stale-closure traps inside AppState listeners.
  const isCheckingRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  const mountedRef = useRef(true);

  // Stash the dynamic policy fetcher so the effect identity is stable.
  const fetchPolicyRef = useRef(fetchPolicy);
  fetchPolicyRef.current = fetchPolicy;
  const staticPolicyRef = useRef(staticPolicy);
  staticPolicyRef.current = staticPolicy;

  const autoStartRef = useRef(autoStartForced);
  autoStartRef.current = autoStartForced;

  // -------- Internal: run a check, respecting cooldown --------

  const runCheck = useCallback(
    async (opts: {
      ignoreCooldown?: boolean;
      trigger: "mount" | "resume" | "manual";
    }) => {
      if (isCheckingRef.current) return;

      if (
        !opts.ignoreCooldown &&
        InAppUpdateService.isInCheckCooldown(Date.now(), checkCooldownMs)
      ) {
        return;
      }

      isCheckingRef.current = true;
      if (mountedRef.current) setIsChecking(true);

      // Resolve policy: dynamic fetch wins, static fallback if it fails.
      let policy: UpdatePolicy | null = staticPolicyRef.current;
      const fetcher = fetchPolicyRef.current;
      if (fetcher) {
        try {
          const remote = await fetcher();
          if (remote) policy = { ...(policy ?? {}), ...remote };
        } catch {
          // remote-config failure is non-fatal; keep static fallback
        }
      }

      _emit({ name: "update_check_started", trigger: opts.trigger });
      const res = await InAppUpdateService.check(policy);

      if (!mountedRef.current) {
        isCheckingRef.current = false;
        return;
      }

      if (res.ok) {
        setResult(res.data);
        setError(null);

        // Housekeeping: drop stale skipped-version entries.
        InAppUpdateService.pruneSkippedVersions(res.data.storeVersion);

        // Auto-start path for forced updates if the caller opted in.
        if (res.data.mode === "forced" && autoStartRef.current && !isStarting) {
          // Fire-and-forget; the provider's blocker still renders as backup.
          void startUpdateInternal(true);
        }
      } else {
        setError(res.error);
      }

      isCheckingRef.current = false;
      if (mountedRef.current) setIsChecking(false);
    },
    // intentionally excluding isStarting / startUpdateInternal — they're
    // accessed via fresh refs at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkCooldownMs],
  );

  // -------- Internal: start the update flow --------

  const startUpdateInternal = useCallback(async (immediate: boolean) => {
    if (mountedRef.current) {
      setIsStarting(true);
      setError(null);
    }
    const res = await InAppUpdateService.start(immediate);
    if (!mountedRef.current) return;
    setIsStarting(false);
    if (!res.ok) {
      setError(res.error);
    } else {
      setResult(res.data);
    }
  }, []);

  // -------- Mount: initial check --------

  useEffect(() => {
    mountedRef.current = true;
    void runCheck({
      ignoreCooldown: forceImmediateCheck,
      trigger: "mount",
    });
    return () => {
      mountedRef.current = false;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [forceImmediateCheck, runCheck]);

  // -------- AppState: re-check on foreground (debounced) --------
  //
  // Why debounce: iOS fires `inactive → active` for many spurious
  // reasons (sheet dismissal, control center, biometric prompt).
  // We want to only fire on a real background → active transition,
  // and only after a short window so flapping doesn't double-check.

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = next;

      if (next !== "active") return;
      if (prev !== "background" && prev !== "inactive") return;

      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => {
        resumeTimerRef.current = null;
        void runCheck({ trigger: "resume" });
      }, APPSTATE_DEBOUNCE_MS);
    });

    return () => {
      sub.remove();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [runCheck]);

  // -------- Public actions --------

  const checkNow = useCallback(
    () => runCheck({ ignoreCooldown: true, trigger: "manual" }),
    [runCheck],
  );

  const startUpdate = useCallback(async () => {
    // Forced → always immediate on Android. Optional → flexible
    // (which on this package means: redirect to store).
    const immediate = result?.mode === "forced";
    await startUpdateInternal(immediate);
  }, [result?.mode, startUpdateInternal]);

  const skipCurrent = useCallback(() => {
    if (result?.storeVersion && result.mode === "optional") {
      InAppUpdateService.skipVersion(result.storeVersion);
      _emit({
        name: "update_prompt_dismissed",
        mode: "optional",
        action: "skip_version",
      });
      setDismissedAt(Date.now());
    }
  }, [result?.storeVersion, result?.mode]);

  const remindLater = useCallback(() => {
    InAppUpdateService.remindLater();
    _emit({
      name: "update_prompt_dismissed",
      mode: "optional",
      action: "remind_later",
    });
    setDismissedAt(Date.now());
  }, []);

  const dismiss = useCallback(() => {
    setDismissedAt(Date.now());
  }, []);

  // -------- Derive optional-modal visibility --------
  //
  // Optional modal shows iff:
  //   • mode === "optional"
  //   • store version is NOT in skipped list
  //   • remind-later cooldown elapsed
  //   • not dismissed within this session
  //
  // Forced mode bypasses all of the above and renders unconditionally
  // (see the provider). This is the linchpin of the "cannot bypass"
  // guarantee — these gates only apply to OPTIONAL.

  const showOptional =
    result?.mode === "optional" &&
    !InAppUpdateService.isVersionSkipped(result.storeVersion) &&
    !InAppUpdateService.isInRemindLaterCooldown(Date.now(), remindLaterMs) &&
    dismissedAt === 0;

  return {
    mode: result?.mode ?? "none",
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
  };
}
