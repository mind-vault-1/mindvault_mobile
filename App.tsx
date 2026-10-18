import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { initializeApiBaseUrl } from "./src/api/resources";
import { createLinkingOptions } from "./src/linking";
import { RootNavigator } from "./src/navigation";
import { getNavigationTheme } from "./src/theme";
import { ThemeProvider, useAppTheme } from "./src/theme/ThemeProvider";
import { logError } from "./src/utils/errorLogger";

function AppContent() {
  const { colors, colorScheme, isLoading } = useAppTheme();
  const [apiUrlReady, setApiUrlReady] = useState(false);

  // Apply the API base URL saved in Settings before the first request goes out.
  useEffect(() => {
    initializeApiBaseUrl()
      .catch((err) => logError("Failed to load saved API base URL", err))
      .finally(() => setApiUrlReady(true));
  }, []);

  // Render nothing themed until the saved theme and API URL are known,
  // so there is no light/dark flash and no request to the wrong server.
  if (isLoading || !apiUrlReady) return null;

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <NavigationContainer
        theme={getNavigationTheme(colors, colorScheme)}
        linking={createLinkingOptions()}
      >
        <RootNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
