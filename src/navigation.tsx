/* eslint-disable @typescript-eslint/no-require-imports */
import { lazy, Suspense, type ComponentType } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation, useTheme } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";

import { CatalogScreen } from "./screens/CatalogScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";

type ScreenComponent = ComponentType<any>;

function ScreenFallback() {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.fallback, { backgroundColor: colors.background }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading screen"
    >
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.fallbackText, { color: colors.text }]}>Loading…</Text>
    </View>
  );
}

function lazyScreen(load: () => Promise<{ default: ScreenComponent }>): ScreenComponent {
  const Lazy = lazy(load);
  return function LoadableScreen(props: any) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}

function lazyRequire(load: () => ScreenComponent): () => Promise<{ default: ScreenComponent }> {
  return () => Promise.resolve({ default: load() });
}

const FavoritesScreen = lazyScreen(lazyRequire(() => require("./screens/FavoritesScreen").FavoritesScreen));
const ResourceDetailScreen = lazyScreen(
  lazyRequire(() => require("./screens/ResourceDetailScreen").ResourceDetailScreen)
);
const ScannerScreen = lazyScreen(lazyRequire(() => require("./screens/ScannerScreen").ScannerScreen));
const SettingsScreen = lazyScreen(lazyRequire(() => require("./screens/SettingsScreen").SettingsScreen));
const DevSignerScreen = lazyScreen(lazyRequire(() => require("./screens/DevSignerScreen").DevSignerScreen));
const PublisherResourcesScreen = lazyScreen(
  lazyRequire(() => require("./screens/PublisherResourcesScreen").PublisherResourcesScreen)
);
const PublisherProfileScreen = lazyScreen(
  lazyRequire(() => require("./screens/PublisherProfileScreen").PublisherProfileScreen)
);
const PublisherAnalyticsScreen = lazyScreen(
  lazyRequire(() => require("./screens/PublisherAnalyticsScreen").PublisherAnalyticsScreen)
);
const PublisherPublicScreen = lazyScreen(
  lazyRequire(() => require("./screens/PublisherPublicScreen").PublisherPublicScreen)
);
const WalletScreen = lazyScreen(lazyRequire(() => require("./screens/WalletScreen").WalletScreen));
const LeaderboardScreen = lazyScreen(
  lazyRequire(() => require("./screens/LeaderboardScreen").LeaderboardScreen)
);
const PurchaseHistoryScreen = lazyScreen(
  lazyRequire(() => require("./screens/PurchaseHistoryScreen").PurchaseHistoryScreen)
);
const ReceiptDetailScreen = lazyScreen(
  lazyRequire(() => require("./screens/ReceiptDetailScreen").ReceiptDetailScreen)
);
const PublishResourceScreen = lazyScreen(
  lazyRequire(() => require("./screens/PublishResourceScreen").PublishResourceScreen)
);
const PublisherResourceDetailScreen = lazyScreen(
  lazyRequire(() => require("./screens/PublisherResourceDetailScreen").PublisherResourceDetailScreen)
);

export type RootStackParamList = {
  Onboarding: undefined;
  Catalog: { owner?: string } | undefined;
  Favorites: undefined;
  ResourceDetail: { resourceId: string };
  Scanner: undefined;
  Settings: undefined;
  DevSigner: undefined;
  PublisherResources: undefined;
  PublisherResourceDetail: { resourceId: string };
  PublisherProfile: undefined;
  PublisherAnalytics: undefined;
  PublisherPublic: { address: string };
  Leaderboard: undefined;
  Wallet: undefined;
  PurchaseHistory: undefined;
  ReceiptDetail: { txHash: string };
  PublishResource: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function PublisherProfileButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => navigation.navigate("PublisherProfile")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Publisher profile"
    >
      <Text style={{ color: colors.primary, fontWeight: "600" }}>Profile</Text>
    </Pressable>
  );
}

interface RootNavigatorProps {
  showOnboarding: boolean;
}

export function RootNavigator({ showOnboarding }: RootNavigatorProps) {
  return (
    <Stack.Navigator initialRouteName={showOnboarding ? "Onboarding" : "Catalog"}>
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Catalog" component={CatalogScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ title: "Saved Favourites" }}
      />
      <Stack.Screen
        name="ResourceDetail"
        component={ResourceDetailScreen}
        options={{ title: "Resource Detail" }}
      />
      <Stack.Screen
        name="Scanner"
        component={ScannerScreen}
        options={{ title: "Scan QR Code" }}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      {__DEV__ ? (
        <Stack.Screen
          name="DevSigner"
          component={DevSignerScreen}
          options={{ title: "Dev Signer PoC" }}
        />
      ) : null}
      <Stack.Screen
        name="PublisherResources"
        component={PublisherResourcesScreen}
        options={{ title: "Publisher Resources", headerRight: PublisherProfileButton }}
      />
      <Stack.Screen
        name="PublisherResourceDetail"
        component={PublisherResourceDetailScreen}
        options={{ title: "Manage Resource" }}
      />
      <Stack.Screen
        name="PublisherProfile"
        component={PublisherProfileScreen}
        options={{ title: "Publisher Profile" }}
      />
      <Stack.Screen
        name="PublisherAnalytics"
        component={PublisherAnalyticsScreen}
        options={{ title: "Publisher Analytics" }}
      />
      <Stack.Screen
        name="PublisherPublic"
        component={PublisherPublicScreen}
        options={{ title: "Publisher" }}
      />
      <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: "Wallet" }} />
      <Stack.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{ title: "Leaderboard" }}
      />
      <Stack.Screen
        name="PurchaseHistory"
        component={PurchaseHistoryScreen}
        options={{ title: "Purchase History" }}
      />
      <Stack.Screen
        name="ReceiptDetail"
        component={ReceiptDetailScreen}
        options={{ title: "Receipt Detail" }}
      />
      <Stack.Screen
        name="PublishResource"
        component={PublishResourceScreen}
        options={{ title: "Publish Link" }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  fallbackText: {
    fontSize: 14,
  },
});
