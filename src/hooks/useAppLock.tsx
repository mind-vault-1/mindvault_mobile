import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "../theme/ThemeProvider";
import { logError } from "../utils/errorLogger";

const ENABLED_KEY = "@mindvault_app_lock_enabled";
const TIMEOUT_KEY = "@mindvault_app_lock_timeout_minutes";
const BACKGROUND_KEY = "@mindvault_app_lock_backgrounded_at";
const REQUIRED_KEY = "@mindvault_app_lock_required";

export const APP_LOCK_TIMEOUT_OPTIONS = [1, 5, 10, 15, 30] as const;
export type AppLockTimeout = (typeof APP_LOCK_TIMEOUT_OPTIONS)[number];

interface AppLockContextValue {
  enabled: boolean;
  timeoutMinutes: AppLockTimeout;
  isLocked: boolean;
  error: string | null;
  setEnabled: (enabled: boolean) => Promise<boolean>;
  setTimeoutMinutes: (minutes: AppLockTimeout) => Promise<void>;
  unlock: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

function validTimeout(value: string | null): AppLockTimeout {
  const parsed = Number(value);
  return APP_LOCK_TIMEOUT_OPTIONS.includes(parsed as AppLockTimeout)
    ? (parsed as AppLockTimeout)
    : 5;
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const [enabled, setEnabledState] = useState(false);
  const [timeoutMinutes, setTimeoutMinutesState] = useState<AppLockTimeout>(5);
  const [isLocked, setIsLocked] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          justifyContent: "center",
          padding: 24,
          backgroundColor: colors.background,
        },
        title: { color: colors.text, fontSize: 24, fontWeight: "700" },
        body: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
        error: { color: colors.danger, fontSize: 14 },
        button: {
          minHeight: 48,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 10,
          backgroundColor: colors.primary,
        },
        buttonText: { color: "#ffffff", fontWeight: "600" },
      }),
    [colors],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      AsyncStorage.getItem(ENABLED_KEY),
      AsyncStorage.getItem(TIMEOUT_KEY),
      AsyncStorage.getItem(BACKGROUND_KEY),
      AsyncStorage.getItem(REQUIRED_KEY),
    ])
      .then(([savedEnabled, savedTimeout, savedBackground, savedRequired]) => {
        if (!active) return;
        const nextEnabled = savedEnabled === "true";
        const nextTimeout = validTimeout(savedTimeout);
        const elapsed = savedBackground ? Date.now() - Number(savedBackground) : 0;
        const expired =
          nextEnabled &&
          Number.isFinite(elapsed) &&
          elapsed >= nextTimeout * 60_000;
        setEnabledState(nextEnabled);
        setTimeoutMinutesState(nextTimeout);
        setIsLocked(nextEnabled && (savedRequired === "true" || expired));
        if (expired) void AsyncStorage.setItem(REQUIRED_KEY, "true");
        setIsReady(true);
      })
      .catch((err) => {
        logError("appLock.loadPreferences", err);
        if (active) {
          setError("Could not load app lock settings.");
          setIsLocked(true);
          setIsReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (previous === "active" && next !== "active") {
        const timestamp = Date.now();
        backgroundedAt.current = timestamp;
        void AsyncStorage.setItem(BACKGROUND_KEY, String(timestamp)).catch((err) => {
          logError("appLock.saveBackgroundTimestamp", err);
          setError("Could not save app inactivity state.");
        });
      } else if (previous !== "active" && next === "active") {
        const timestamp = backgroundedAt.current;
        const shouldLock =
          enabled &&
          timestamp !== null &&
          Date.now() - timestamp >= timeoutMinutes * 60_000;
        if (shouldLock) {
          setIsLocked(true);
          void AsyncStorage.setItem(REQUIRED_KEY, "true").catch((err) => {
            logError("appLock.saveLockState", err);
            setError("Could not save app lock state.");
          });
        } else {
          void AsyncStorage.removeItem(BACKGROUND_KEY).catch((err) => {
            logError("appLock.clearBackgroundTimestamp", err);
            setError("Could not update app inactivity state.");
          });
        }
        backgroundedAt.current = null;
      }
      previous = next;
    });

    return () => subscription.remove();
  }, [enabled, isReady, timeoutMinutes]);

  const setEnabled = useCallback(async (next: boolean) => {
    if (next) {
      try {
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!hasHardware || !isEnrolled) {
          setError("Set up device biometrics before enabling the app lock.");
          return false;
        }
      } catch (err) {
        logError("appLock.checkAuthentication", err);
        setError("Could not verify device authentication availability.");
        return false;
      }
    }

    try {
      if (!next) {
        await AsyncStorage.multiRemove([REQUIRED_KEY, BACKGROUND_KEY]);
        setIsLocked(false);
      }
      await AsyncStorage.setItem(ENABLED_KEY, String(next));
      setEnabledState(next);
      setError(null);
      return true;
    } catch (err) {
      logError("appLock.saveEnabledPreference", err);
      setError("Could not save app lock settings.");
      return false;
    }
  }, []);

  const setTimeoutMinutes = useCallback(async (minutes: AppLockTimeout) => {
    if (!APP_LOCK_TIMEOUT_OPTIONS.includes(minutes)) {
      throw new Error("Unsupported app lock timeout.");
    }
    try {
      await AsyncStorage.setItem(TIMEOUT_KEY, String(minutes));
      setTimeoutMinutesState(minutes);
      setError(null);
    } catch (err) {
      logError("appLock.saveTimeoutPreference", err);
      setError("Could not save app lock settings.");
    }
  }, []);

  const unlock = useCallback(async () => {
    setUnlocking(true);
    setError(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock MindVault",
        disableDeviceFallback: false,
      });
      if (!result.success) {
        setError("Authentication was not completed. Try again to unlock MindVault.");
        return;
      }
      await AsyncStorage.multiRemove([REQUIRED_KEY, BACKGROUND_KEY]);
      backgroundedAt.current = null;
      setIsLocked(false);
    } catch (err) {
      logError("appLock.authenticate", err);
      setError("Device authentication failed. Try again to unlock MindVault.");
    } finally {
      setUnlocking(false);
    }
  }, []);

  const value = useMemo(
    () => ({ enabled, timeoutMinutes, isLocked, error, setEnabled, setTimeoutMinutes, unlock }),
    [enabled, timeoutMinutes, isLocked, error, setEnabled, setTimeoutMinutes, unlock],
  );

  if (!isReady) return null;

  return (
    <AppLockContext.Provider value={value}>
      {children}
      <Modal visible={isLocked} animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.overlay}>
          <Text style={styles.title} accessibilityRole="header">MindVault is locked</Text>
          <Text style={styles.body}>
            Authenticate to return to your wallet and publisher screens.
          </Text>
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          <Pressable
            onPress={() => void unlock()}
            disabled={unlocking}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="Unlock MindVault"
            accessibilityState={{ disabled: unlocking, busy: unlocking }}
          >
            <Text style={styles.buttonText}>{unlocking ? "Authenticating…" : "Unlock"}</Text>
          </Pressable>
        </View>
      </Modal>
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error("useAppLock must be used within AppLockProvider.");
  }
  return context;
}
