import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState, useEffect, useCallback } from "react";
import { RootStackParamList } from "../navigation";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAppTheme } from "../theme/ThemeProvider";
import {
  getDefaultApiBaseUrl,
  loadApiBaseUrl,
  saveApiBaseUrl,
} from "../api/apiSettings";
import { initializeApiBaseUrl } from "../api/resources";

export function SettingsScreen() {
  const { colors, shared } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [apiUrl, setApiUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadUrl = useCallback(async () => {
    const url = await loadApiBaseUrl();
    setApiUrl(url);
    setSavedUrl(url);
  }, []);

  useEffect(() => {
    loadUrl();
  }, [loadUrl]);

  const handleSave = async () => {
    const trimmed = apiUrl.trim();
    if (!trimmed) {
      Alert.alert("Invalid URL", "API base URL cannot be empty.");
      return;
    }
    setIsSaving(true);
    try {
      await saveApiBaseUrl(trimmed);
      await initializeApiBaseUrl();
      setSavedUrl(trimmed);
      Alert.alert("Saved", "API base URL updated successfully.");
    } catch {
      Alert.alert("Error", "Failed to save API base URL.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    const defaultUrl = getDefaultApiBaseUrl();
    setApiUrl(defaultUrl);
    setIsSaving(true);
    try {
      await saveApiBaseUrl(defaultUrl);
      await initializeApiBaseUrl();
      setSavedUrl(defaultUrl);
      Alert.alert("Reset", "API base URL reset to default.");
    } catch {
      Alert.alert("Error", "Failed to reset API base URL.");
    } finally {
      setIsSaving(false);
    }
  };

  const isDirty = apiUrl.trim() !== savedUrl;

  return (
    <SafeAreaView style={shared.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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

        {/* API Base URL */}
        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              marginTop: 32,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            API Base URL
          </Text>
          <Text
            style={[
              styles.infoText,
              { color: colors.textMuted, marginBottom: 12 },
            ]}
          >
            The base URL used for all API requests. Restart the app after
            changing.
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.neutralBg,
                borderColor: isDirty ? colors.primary : colors.border,
              },
            ]}
            value={apiUrl}
            onChangeText={setApiUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={getDefaultApiBaseUrl()}
            placeholderTextColor={colors.textSubtle}
            editable={!isSaving}
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                shared.button,
                { flex: 1, backgroundColor: colors.neutralBg },
                !isDirty && styles.disabledButton,
              ]}
              onPress={handleReset}
              disabled={isSaving}
            >
              <Text style={[shared.buttonText, { color: colors.textMuted }]}>
                Reset to Default
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                shared.button,
                shared.primaryButton,
                { flex: 1 },
                !isDirty && styles.disabledButton,
              ]}
              onPress={handleSave}
              disabled={!isDirty || isSaving}
            >
              <Text style={[shared.buttonText, shared.primaryButtonText]}>
                {isSaving ? "Saving…" : "Save"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.warningBg, marginTop: 32 },
          ]}
        >
          <Text
            style={[
              styles.title,
              { fontSize: 16, color: colors.warning, marginBottom: 8 },
            ]}
          >
            Developer Options
          </Text>
          <Text
            style={[
              styles.infoText,
              { color: colors.warning, marginBottom: 16 },
            ]}
          >
            These tools are for testing purposes only.
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.warning }]}
            onPress={() => navigation.navigate("DevSigner")}
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>
              Open Dev Signer PoC
            </Text>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "monospace",
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
