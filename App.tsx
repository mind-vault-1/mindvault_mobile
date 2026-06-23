import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { CatalogScreen } from "./src/screens/CatalogScreen";
import { ResourceDetailScreen } from "./src/screens/ResourceDetailScreen";
import { ScannerScreen } from "./src/screens/ScannerScreen";
import type { RootStackParamList } from "./src/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Catalog">
        <Stack.Screen
          name="Catalog"
          component={CatalogScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{ title: "Scan QR Code", presentation: "modal" }}
        />
        <Stack.Screen
          name="ResourceDetail"
          component={ResourceDetailScreen}
          options={{ title: "Resource" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
