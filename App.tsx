import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { initializeApiBaseUrl } from "./src/api/resources";
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
import { STORAGE_KEYS } from "./src/services/storage";

const ONBOARDING_KEY = `${STORAGE_KEYS.catalogFilters}:onboarding`;

function AppContent() {
  const { colors, colorScheme, isLoading } = useAppTheme();
  const [apiUrlReady, setApiUrlReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const toast = useToast();

  // Reconciles local receipts with the server in the background.
  useReceiptSync(apiUrlReady);

  useEffect(() => registerPublishNotificationLinks(), []);

  // Replays queued offline actions in FIFO order, with a toast per action.
  const drainMutationQueue = useCallback(() => {
    void flushMutations({
      onCompleted: (mutation) => toast.success(`${describeMutation(mutation)} completed`),
      onFailed: (mutation) => toast.error(`${describeMutation(mutation)} failed — open it to retry`),
    });
  }, [toast]);

  const { isOffline } = useNetworkStatus({ onReconnect: drainMutationQueue });

  // Apply the API base URL saved in Settings before the first request goes out.
  useEffect(() => {
    initializeApiBaseUrl()
      .catch((err) => logError("Failed to load saved API base URL", err))
      .finally(() => setApiUrlReady(true));
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
  if (isLoading || !apiUrlReady || !onboardingChecked) return null;

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <OfflineBanner isOffline={isOffline} />
      <AppLockProvider>
        <NavigationContainer
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
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
