import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { CatalogScreen } from "./screens/CatalogScreen";
import { ResourceDetailScreen } from "./screens/ResourceDetailScreen";
import { ScannerScreen } from "./screens/ScannerScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { DevSignerScreen } from "./screens/DevSignerScreen";
import { PublisherResourcesScreen } from "./screens/PublisherResourcesScreen";

export type RootStackParamList = {
  Catalog: undefined;
  ResourceDetail: { resourceId: string };
  Scanner: undefined;
  Settings: undefined;
  DevSigner: undefined;
  PublisherResources: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator>
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
      <Stack.Screen
        name="DevSigner"
        component={DevSignerScreen}
        options={{ title: "Dev Signer PoC" }}
      />
      <Stack.Screen
        name="PublisherResources"
        component={PublisherResourcesScreen}
        options={{ title: "Publisher Resources" }}
      />
    </Stack.Navigator>
  );
}