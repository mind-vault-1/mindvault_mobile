import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAppTheme } from "../theme/ThemeProvider";
import type { ThemeColors } from "../theme";
import { spacing } from "../theme";
import { storeApiKey } from "../services/secureStorage";
import { registerPublisher, type RegisterPublisherRequest } from "../api/publishers";

interface PublisherSignupSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (apiKey: string) => void;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      padding: spacing.lg,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: spacing.lg,
      maxHeight: "90%",
      width: "100%",
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: spacing.lg,
    },
    formGroup: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    inputError: {
      borderColor: colors.danger,
    },
    errorText: {
      fontSize: 12,
      color: colors.danger,
    },
    submitButton: {
      marginTop: spacing.md,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonText: {
      color: "#ffffff",
      fontWeight: "600",
      fontSize: 15,
    },
    cancelButton: {
      marginTop: spacing.sm,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.neutralBg,
      alignItems: "center",
    },
    cancelButtonText: {
      color: colors.text,
      fontWeight: "600",
      fontSize: 15,
    },
    loadingContainer: {
      alignItems: "center",
      paddingVertical: spacing.xl,
      gap: spacing.md,
    },
    successContainer: {
      alignItems: "center",
      paddingVertical: spacing.xl,
      gap: spacing.md,
    },
    successTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.success,
    },
    apiKeyContainer: {
      width: "100%",
      backgroundColor: colors.neutralBg,
      borderRadius: 12,
      padding: spacing.md,
      gap: spacing.sm,
    },
    apiKeyLabel: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
    },
    apiKeyValue: {
      fontSize: 13,
      fontFamily: "monospace",
      color: colors.text,
      textAlign: "center",
      letterSpacing: 0.5,
    },
    copyButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
      borderRadius: 8,
      alignSelf: "center",
    },
    copyButtonText: {
      color: "#ffffff",
      fontWeight: "600",
    },
    confirmButton: {
      marginTop: spacing.sm,
      paddingVertical: 12,
      paddingHorizontal: 24,
      backgroundColor: colors.success,
      borderRadius: 12,
    },
    confirmButtonText: {
      color: "#ffffff",
      fontWeight: "600",
    },
    hint: {
      fontSize: 12,
      color: colors.textSubtle,
      textAlign: "center",
      marginTop: spacing.xs,
    },
  });
}

function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address";
  return null;
}

function validateStellarAddress(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return "Wallet address is required";
  // Stellar addresses start with G and are 56 characters
  if (!/^G[A-Z0-9]{55}$/.test(trimmed)) return "Enter a valid Stellar public key (starts with G, 56 chars)";
  return null;
}

function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name is required";
  if (trimmed.length < 2) return "Name must be at least 2 characters";
  if (trimmed.length > 100) return "Name must be 100 characters or fewer";
  return null;
}

export function PublisherSignupSheet({
  visible,
  onClose,
  onSuccess,
}: PublisherSignupSheetProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [phase, setPhase] = useState<"form" | "loading" | "success">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [apiKey, setApiKey] = useState("");
  const [keyCopied, setKeyCopied] = useState(false);

  const validateField = useCallback((field: string, value: string) => {
    switch (field) {
      case "name":
        return validateName(value);
      case "email":
        return validateEmail(value);
      case "walletAddress":
        return validateStellarAddress(value);
      default:
        return null;
    }
  }, []);

  const handleBlur = useCallback((field: string, value: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validateField(field, value);
    setErrors((prev) => ({ ...prev, [field]: error ?? "" }));
  }, [validateField]);

  const handleChange = useCallback((field: string, value: string) => {
    if (field === "name") setName(value);
    else if (field === "email") setEmail(value);
    else if (field === "walletAddress") setWalletAddress(value);

    // Clear error on change if field was touched
    if (touched[field]) {
      const error = validateField(field, value);
      setErrors((prev) => ({ ...prev, [field]: error ?? "" }));
    }
  }, [touched, validateField]);

  const handleSubmit = async () => {
    // Validate all fields
    const nameError = validateName(name);
    const emailError = validateEmail(email);
    const walletError = validateStellarAddress(walletAddress);

    const newErrors: Record<string, string> = {};
    if (nameError) newErrors.name = nameError;
    if (emailError) newErrors.email = emailError;
    if (walletError) newErrors.walletAddress = walletError;

    setErrors(newErrors);
    setTouched({ name: true, email: true, walletAddress: true });

    if (nameError || emailError || walletError) {
      return;
    }

    Keyboard.dismiss();
    setPhase("loading");

    try {
      const response = await registerPublisher({
        name: name.trim(),
        email: email.trim(),
        walletAddress: walletAddress.trim(),
      });

      // Store the API key immediately
      await storeApiKey(response.apiKey);
      setApiKey(response.apiKey);
      setPhase("success");
    } catch (err) {
      setPhase("form");
      const message = err instanceof Error ? err.message : "Registration failed. Please try again.";
      Alert.alert("Registration Failed", message);
    }
  };

  const handleCopyKey = async () => {
    await Alert.alert("Copied!", "API key copied to clipboard");
    setKeyCopied(true);
  };

  const handleConfirmSaved = () => {
    onSuccess(apiKey);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          {phase === "form" && (
            <>
              <Text style={styles.title}>Create Publisher Account</Text>
              <Text style={styles.subtitle}>
                Enter your details to register as a publisher. Your API key will be shown once — save it securely.
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  value={name}
                  onChangeText={(v) => handleChange("name", v)}
                  onBlur={(e) => handleBlur("name", e.nativeEvent.text)}
                  placeholder="Your name or organization"
                  placeholderTextColor={colors.textSubtle}
                  style={[styles.input, errors.name && styles.inputError]}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={phase !== "loading"}
                  accessibilityLabel="Publisher name"
                  accessibilityErrorMessage={touched.name ? errors.name : undefined}
                />
                {touched.name && errors.name && (
                  <Text style={styles.errorText} accessibilityLiveRegion="assertive">
                    {errors.name}
                  </Text>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={(v) => handleChange("email", v)}
                  onBlur={(e) => handleBlur("email", e.nativeEvent.text)}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textSubtle}
                  style={[styles.input, errors.email && styles.inputError]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={phase !== "loading"}
                  accessibilityLabel="Email address"
                  accessibilityErrorMessage={touched.email ? errors.email : undefined}
                />
                {touched.email && errors.email && (
                  <Text style={styles.errorText} accessibilityLiveRegion="assertive">
                    {errors.email}
                  </Text>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Wallet Address (Public Key)</Text>
                <TextInput
                  value={walletAddress}
                  onChangeText={(v) => handleChange("walletAddress", v)}
                  onBlur={(e) => handleBlur("walletAddress", e.nativeEvent.text)}
                  placeholder="G... (56 characters)"
                  placeholderTextColor={colors.textSubtle}
                  style={[styles.input, errors.walletAddress && styles.inputError]}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={phase !== "loading"}
                  accessibilityLabel="Stellar wallet address"
                  accessibilityErrorMessage={touched.walletAddress ? errors.walletAddress : undefined}
                />
                {touched.walletAddress && errors.walletAddress && (
                  <Text style={styles.errorText} accessibilityLiveRegion="assertive">
                    {errors.walletAddress}
                  </Text>
                )}
                <Text style={styles.hint}>
                  Your Stellar public key starting with G. This will be the owner of your resources.
                </Text>
              </View>

              <Pressable
                onPress={handleSubmit}
                disabled={phase === "loading"}
                style={[styles.submitButton, phase === "loading" && styles.submitButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Create publisher account"
                accessibilityState={{ disabled: phase === "loading", busy: phase === "loading" }}
              >
                {phase === "loading" ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitButtonText}>Create Account</Text>
                )}
              </Pressable>

              <Pressable
                onPress={onClose}
                disabled={phase === "loading"}
                style={[styles.cancelButton, phase === "loading" && styles.submitButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </>
          )}

          {phase === "loading" && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={typography.body}>Creating your publisher account…</Text>
            </View>
          )}

          {phase === "success" && (
            <View style={styles.successContainer}>
              <Text style={styles.successTitle}>Account Created!</Text>
              <Text style={typography.body} textAlign="center">
                Your publisher account is ready. Copy your API key now — it won't be shown again.
              </Text>

              <View style={styles.apiKeyContainer}>
                <Text style={styles.apiKeyLabel}>API Key</Text>
                <Text style={styles.apiKeyValue} selectable={true}>
                  {apiKey}
                </Text>
                <Pressable
                  onPress={handleCopyKey}
                  style={styles.copyButton}
                  accessibilityRole="button"
                  accessibilityLabel="Copy API key to clipboard"
                >
                  <Text style={styles.copyButtonText}>{keyCopied ? "Copied!" : "Copy Key"}</Text>
                </Pressable>
              </View>

              <Text style={styles.hint}>
                Store this key securely. You'll need it to access your publisher resources.
              </Text>

              <Pressable
                onPress={handleConfirmSaved}
                style={styles.confirmButton}
                accessibilityRole="button"
                accessibilityLabel="I've saved the API key"
              >
                <Text style={styles.confirmButtonText}>I've Saved It</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}