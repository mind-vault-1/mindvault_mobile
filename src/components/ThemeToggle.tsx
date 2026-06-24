import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/ThemeProvider";
import type { ThemeMode } from "../theme";

export function ThemeToggle() {
  const { colors, themeMode, setThemeMode } = useAppTheme();

  const themes: { mode: ThemeMode; label: string; symbol: string }[] = [
    { mode: "light", label: "Light", symbol: "☀" },
    { mode: "dark", label: "Dark", symbol: "☾" },
    { mode: "system", label: "System", symbol: "◐" },
  ];

  function handleThemeChange(mode: ThemeMode) {
    setThemeMode(mode);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Theme</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Choose your preferred theme
        </Text>
        <View style={styles.options}>
          {themes.map((theme) => (
            <Pressable
              key={theme.mode}
              style={[
                styles.option,
                { backgroundColor: colors.neutralBg, borderColor: colors.border },
                themeMode === theme.mode && {
                  backgroundColor: colors.primaryMuted,
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => handleThemeChange(theme.mode)}
            >
              <Text
                style={[
                  styles.optionSymbol,
                  { color: themeMode === theme.mode ? colors.primary : colors.textMuted },
                ]}
              >
                {theme.symbol}
              </Text>
              <Text
                style={[
                  styles.optionText,
                  { color: themeMode === theme.mode ? colors.primary : colors.textMuted },
                ]}
              >
                {theme.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  option: {
    flex: 1,
    minWidth: 100,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  optionSymbol: {
    fontSize: 20,
    lineHeight: 24,
  },
  optionText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
