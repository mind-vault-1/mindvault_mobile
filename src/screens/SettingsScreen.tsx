import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAppTheme } from "../theme/ThemeProvider";

export function SettingsScreen() {
  const { colors, shared } = useAppTheme();

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
