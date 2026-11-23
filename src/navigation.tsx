import { Pressable, Text } from "react-native";
import { useNavigation, useTheme } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";

import { CatalogScreen } from "./screens/CatalogScreen";
import { ResourceDetailScreen } from "./screens/ResourceDetailScreen";
import { ScannerScreen } from "./screens/ScannerScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { DevSignerScreen } from "./screens/DevSignerScreen";
import { PublisherResourcesScreen } from "./screens/PublisherResourcesScreen";
import { PublisherProfileScreen } from "./screens/PublisherProfileScreen";
import { PublisherAnalyticsScreen } from "./screens/PublisherAnalyticsScreen";
import { PurchaseHistoryScreen } from "./screens/PurchaseHistoryScreen";
import { ReceiptDetailScreen } from "./screens/ReceiptDetailScreen";
import { PublishResourceScreen } from "./screens/PublishResourceScreen";
import { PublisherResourceDetailScreen } from "./screens/PublisherResourceDetailScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { WalletScreen } from "./screens/WalletScreen";

export type RootStackParamList = {
  Onboarding: undefined;
  Catalog: undefined;
  ResourceDetail: { resourceId: string };
  Scanner: undefined;
  Settings: undefined;
  DevSigner: undefined;
  PublisherResources: undefined;
  PublisherResourceDetail: { resourceId: string };
  PublisherProfile: undefined;
  PublisherAnalytics: undefined;
  PurchaseHistory: undefined;
  ReceiptDetail: { txHash: string };
  PublishResource: undefined;
  Wallet: undefined;
  ImportWallet: undefined;
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
      <Stack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ title: "Wallet" }}
      />
      <Stack.Screen
        name="ImportWallet"
        component={WalletScreen}
        options={{ title: "Import Wallet" }}
      />
    </Stack.Navigator>
  );
}
