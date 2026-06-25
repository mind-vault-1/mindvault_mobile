import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { CatalogScreen } from "./screens/CatalogScreen";
import { ResourceDetailScreen } from "./screens/ResourceDetailScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { DevSignerScreen } from "./screens/DevSignerScreen";

export type RootStackParamList = {
  Catalog: undefined;
  ResourceDetail: { resourceId: string };
  Settings: undefined;
  DevSigner: undefined;
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
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <Stack.Screen
        name="DevSigner"
        component={DevSignerScreen}
        options={{ title: "Dev Signer PoC" }}
      />
    </Stack.Navigator>
  );
}