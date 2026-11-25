import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, I18nManager } from "react-native";
import { NavigationContainer, type NavigationState } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";

import { initializeApiBaseUrl } from "./src/api/resources";
import { loadRemoteConfig, refreshRemoteConfig } from "./src/config/remoteConfig";
import { createLinkingOptions } from "./src/linking";
import { RootNavigator } from "./src/navigation";
import {
  describeMutation,
  flushMutations,
} from "./src/services/mutationQueue";
import { registerPublishNotificationLinks } from "./src/services/notifications";
import { getNavigationTheme } from "./src/theme";
import { ThemeProvider, useAppTheme } from "./src/theme/ThemeProvider";
import { logError } from "./src/utils/errorLogger";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { ToastProvider, useToast } from "./src/components/ToastProvider";
import { useNetworkStatus } from "./src/hooks/useNetworkStatus";
import { useReceiptSync } from "./src/hooks/useReceiptSync";
import { AppLockProvider } from "./src/hooks/useAppLock";
import { AppQueryProvider } from "./src/hooks/queries";
import { STORAGE_KEYS } from "./src/services/storage";
import { isCurrentLocaleRtl, loadLanguagePreference, refreshSystemLanguage, useLayoutDirection, useLocale } from "./src/i18n";

const ONBOARDING_KEY = `${STORAGE_KEYS.catalogFilters}:onboarding`;
export const BOOT_TIMEOUT_MS = 5000;

const bootStartedAt = Date.now();
let splashHidden = false;
let bootDurationMs: number | null = null;

export function getBootDurationMs(): number {
  return bootDurationMs ?? Date.now() - bootStartedAt;
}

export function resetSplashForTests(): void {
  splashHidden = false;
  bootDurationMs = null;
}

async function hideAppSplash(): Promise<void> {
  if (splashHidden) return;
  splashHidden = true;
  bootDurationMs = Date.now() - bootStartedAt;
  try {
    await SplashScreen.hideAsync();
  } catch (error) {
    logError("Failed to hide splash screen", error);
  }
}

export async function hideSplashAfterBoot(
  ready: Promise<unknown>,
  timeoutMs: number = BOOT_TIMEOUT_MS
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ready,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    await hideAppSplash();
  }
}

function AppContent() {
  const { colors, colorScheme, isLoading } = useAppTheme();
  const [apiUrlReady, setApiUrlReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [languageReady, setLanguageReady] = useState(false);
  const toast = useToast();
  const locale = useLocale();
  const { isRtl } = useLayoutDirection();
  // Kept across the remount below so a language change doesn't reset navigation.
  const navigationState = useRef<NavigationState | undefined>(undefined);

  // Reconciles local receipts with the server in the background.
  useReceiptSync(apiUrlReady);

  useEffect(() => registerPublishNotificationLinks(), []);

  useEffect(() => {
    void SplashScreen.preventAutoHideAsync().catch((error) =>
      logError("Failed to keep splash screen visible", error)
    );
    const timeout = setTimeout(() => void hideAppSplash(), BOOT_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);

  const bootReady = !isLoading && apiUrlReady && onboardingChecked && languageReady;
  useEffect(() => {
    if (bootReady) void hideAppSplash();
  }, [bootReady]);

  // Replays queued offline actions in FIFO order, with a toast per action.
  const drainMutationQueue = useCallback(() => {
    void flushMutations({
      onCompleted: (mutation) => toast.success(`${describeMutation(mutation)} completed`),
      onFailed: (mutation) => toast.error(`${describeMutation(mutation)} failed — open it to retry`),
    });
  }, [toast]);

  const { isOffline } = useNetworkStatus({ onReconnect: drainMutationQueue });

  // Cached remote config (API host, limits, flags) is applied before the first request.
  // The latest copy is fetched after boot and takes effect on the next request.
  useEffect(() => {
    const boot = loadRemoteConfig()
      .catch((err) => logError("Failed to load cached remote config", err))
      .then(() => initializeApiBaseUrl())
      .catch((err) => logError("Failed to load saved API base URL", err))
      .finally(() => setApiUrlReady(true));
    void boot
      .then(() => refreshRemoteConfig())
      .then(() => initializeApiBaseUrl())
      .catch((err) => logError("Failed to refresh remote config", err));
  }, []);

  // Restore the language chosen in Settings before the first screen renders.
  useEffect(() => {
    loadLanguagePreference()
      .catch((err) => logError("Failed to load saved language", err))
      .finally(() => setLanguageReady(true));
  }, []);

  // Native text/layout direction follows the resolved locale/direction override.
  useEffect(() => {
    I18nManager.allowRTL(true);
    if (I18nManager.isRTL !== isRtl) {
      I18nManager.forceRTL(isRtl);
    }
  }, [isRtl]);

  // "System" follows the device: pick up a language change made while backgrounded.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") refreshSystemLanguage();
    });
    return () => subscription.remove();
  }, []);

  // Check if onboarding has been seen
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const hasSeenOnboarding = await AsyncStorage.getItem(ONBOARDING_KEY);
        setShowOnboarding(!hasSeenOnboarding);
      } catch {
        setShowOnboarding(true);
      } finally {
        setOnboardingChecked(true);
      }
    };
    void checkOnboarding();
  }, []);

  // Also drain once the app is ready: actions queued before a restart must not
  // wait for the next offline→online transition.
  useEffect(() => {
    if (apiUrlReady) drainMutationQueue();
  }, [apiUrlReady, drainMutationQueue]);

  // Render nothing themed until the saved theme and API URL are known,
  // so there is no light/dark flash and no request to the wrong server.
  if (!bootReady) return null;

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <OfflineBanner isOffline={isOffline} />
      <AppLockProvider>
        <NavigationContainer
          // Strings are read at render time, so remount the screens in the new
          // language, restoring the current stack.
          key={locale}
          initialState={navigationState.current}
          onStateChange={(state) => {
            navigationState.current = state;
          }}
          theme={getNavigationTheme(colors, colorScheme)}
          linking={createLinkingOptions()}
        >
          <RootNavigator showOnboarding={showOnboarding} />
        </NavigationContainer>
      </AppLockProvider>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <AppQueryProvider>
            <ToastProvider>
              <AppContent />
            </ToastProvider>
          </AppQueryProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
