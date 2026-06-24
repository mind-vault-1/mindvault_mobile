import { ScrollView, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAppTheme } from "../theme/ThemeProvider";

export function SettingsScreen() {
  const { colors, shared } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={shared.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Customize your app experience
          </Text>
        </View>
        
        <ThemeToggle />
        
        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg }]}>
          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            Theme preferences are saved locally and persist across app launches.
          </Text>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.warningBg, marginTop: 32 }]}>
          <Text style={[styles.title, { fontSize: 16, color: colors.warning, marginBottom: 8 }]}>Developer Options</Text>
          <Text style={[styles.infoText, { color: colors.warning, marginBottom: 16 }]}>
            These tools are for testing purposes only.
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.warning }]}
            onPress={() => navigation.navigate("DevSigner")}
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>Open Dev Signer PoC</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 15,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
  },
});
