import { type ComponentType } from "react";
import { Pressable, Text } from "react-native";
import { useNavigation, useTheme } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";

import { CatalogScreen } from "./screens/CatalogScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";

/**
 * Wraps a screen so its module is required on first render, not at startup.
 * Metro only evaluates a module when its `require` runs, so screens a user never
 * opens (scanner, wallet, ...) add no startup work.
 */
function lazyScreen(load: () => ComponentType<any>): ComponentType<any> {
  let Screen: ComponentType<any> | undefined;
  return function LazyScreen(props: any) {
    Screen ??= load();
    return <Screen {...props} />;
  };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FavoritesScreen = lazyScreen(() => require("./screens/FavoritesScreen").FavoritesScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ResourceDetailScreen = lazyScreen(() => require("./screens/ResourceDetailScreen").ResourceDetailScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ScannerScreen = lazyScreen(() => require("./screens/ScannerScreen").ScannerScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SettingsScreen = lazyScreen(() => require("./screens/SettingsScreen").SettingsScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DevSignerScreen = lazyScreen(() => require("./screens/DevSignerScreen").DevSignerScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PublisherResourcesScreen = lazyScreen(() => require("./screens/PublisherResourcesScreen").PublisherResourcesScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PublisherProfileScreen = lazyScreen(() => require("./screens/PublisherProfileScreen").PublisherProfileScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PublisherAnalyticsScreen = lazyScreen(() => require("./screens/PublisherAnalyticsScreen").PublisherAnalyticsScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PublisherPublicScreen = lazyScreen(() => require("./screens/PublisherPublicScreen").PublisherPublicScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WalletScreen = lazyScreen(() => require("./screens/WalletScreen").WalletScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LeaderboardScreen = lazyScreen(() => require("./screens/LeaderboardScreen").LeaderboardScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PurchaseHistoryScreen = lazyScreen(() => require("./screens/PurchaseHistoryScreen").PurchaseHistoryScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReceiptDetailScreen = lazyScreen(() => require("./screens/ReceiptDetailScreen").ReceiptDetailScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PublishResourceScreen = lazyScreen(() => require("./screens/PublishResourceScreen").PublishResourceScreen);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PublisherResourceDetailScreen = lazyScreen(() => require("./screens/PublisherResourceDetailScreen").PublisherResourceDetailScreen);

export type RootStackParamList = {
  Onboarding: undefined;
  /** `owner` opens the catalog filtered to one publisher wallet. */
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

/** Header button on Publisher Resources that opens the publisher's profile. */
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
    <Stack.Navigator
      initialRouteName={showOnboarding ? "Onboarding" : "Catalog"}
    >
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
