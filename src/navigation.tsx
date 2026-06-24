import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { CatalogScreen } from "./screens/CatalogScreen";
import { ResourceDetailScreen } from "./screens/ResourceDetailScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

export type RootStackParamList = {
  Catalog: undefined;
  ResourceDetail: { resourceId: string };
  Settings: undefined;
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
    </Stack.Navigator>
  );
}