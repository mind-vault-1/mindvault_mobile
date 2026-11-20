import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { TIP_PRESETS, initiateTip, type TipRequest } from "../api/tips";
import { useAppTheme } from "../theme/ThemeProvider";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";

interface TipSheetProps {
  publisherId: string;
  resourceId?: string;
  resourceTitle?: string;
  onTipInitiated: (amount: string) => void;
  onDismiss: () => void;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    header: {
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    presetsContainer: {
      marginBottom: spacing.lg,
    },
    presetsLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.text,
      marginBottom: spacing.sm,
    },
    presetsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    presetButton: {
      flex: 1,
      minWidth: "45%",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: 8,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      borderWidth: 2,
      borderColor: "transparent",
    },
    presetButtonActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    presetButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    presetButtonActiveText: {
      color: "white",
    },
    customContainer: {
      marginBottom: spacing.lg,
    },
    customLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.text,
      marginBottom: spacing.sm,
    },
    customInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    noteContainer: {
      marginBottom: spacing.lg,
    },
    noteLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.text,
      marginBottom: spacing.sm,
    },
    noteInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.surface,
      minHeight: 80,
      textAlignVertical: "top",
    },
    button: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: 8,
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    submitButton: {
      backgroundColor: colors.primary,
    },
    submitButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: "white",
    },
    cancelButton: {
      backgroundColor: colors.surfaceAlt,
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    errorText: {
      color: colors.danger,
      fontSize: 14,
      marginBottom: spacing.sm,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: spacing.xl,
    },
  });
}

export function TipSheet({
  publisherId,
  resourceId,
  resourceTitle,
  onTipInitiated,
  onDismiss,
}: TipSheetProps) {
  const colors = useAppTheme();
  const styles = createStyles(colors);

  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAmount = useCallback(() => {
    if (selectedPreset) return selectedPreset;
    return customAmount;
  }, [selectedPreset, customAmount]);

  const handleTip = useCallback(async () => {
    const amount = getAmount();
    if (!amount.trim()) {
      setError("Please enter a tip amount or select a preset.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const request: TipRequest = {
        publisherId,
        resourceId,
        amount,
        note: note.trim() || undefined,
      };

      await initiateTip(request);
      onTipInitiated(amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate tip");
      setLoading(false);
    }
  }, [getAmount, publisherId, resourceId, note, onTipInitiated]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Send a Tip</Text>
        {resourceTitle && <Text style={styles.subtitle}>For "{resourceTitle}"</Text>}
      </View>

      <View style={styles.presetsContainer}>
        <Text style={styles.presetsLabel}>Quick amounts</Text>
        <View style={styles.presetsGrid}>
          {TIP_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              style={[styles.presetButton, selectedPreset === preset && styles.presetButtonActive]}
              onPress={() => {
                setSelectedPreset(preset);
                setCustomAmount("");
              }}
            >
              <Text
                style={[
                  styles.presetButtonText,
                  selectedPreset === preset && styles.presetButtonActiveText,
                ]}
              >
                ${preset}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.customContainer}>
        <Text style={styles.customLabel}>Custom amount (USD)</Text>
        <TextInput
          style={styles.customInput}
          placeholder="0.00"
          placeholderTextColor={colors.textSecondary}
          keyboardType="decimal-pad"
          value={customAmount}
          onChangeText={(text) => {
            setCustomAmount(text);
            setSelectedPreset(null);
          }}
        />
      </View>

      <View style={styles.noteContainer}>
        <Text style={styles.noteLabel}>Optional note (visible to publisher)</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Thank you for this amazing content!"
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={4}
          value={note}
          onChangeText={setNote}
        />
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable style={[styles.button, styles.submitButton]} onPress={handleTip} disabled={loading}>
        <Text style={styles.submitButtonText}>Send Tip</Text>
      </Pressable>

      <Pressable style={[styles.button, styles.cancelButton]} onPress={onDismiss} disabled={loading}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}
