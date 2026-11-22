import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import type { PaymentReceipt } from "../services/receipts";
import {
  exportReceipts,
  filterReceiptsByRange,
  RECEIPT_EXPORT_RANGES,
  type ReceiptExportFormat,
  type ReceiptExportRange,
} from "../utils/receiptExport";
import { spacing } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

interface ReceiptExportButtonProps {
  receipts: PaymentReceipt[];
}

const FORMATS: { value: ReceiptExportFormat; label: string }[] = [
  { value: "json", label: "JSON" },
  { value: "csv", label: "CSV" },
];

/** Lets the buyer pick a format and date range, then shares the export text. */
export function ReceiptExportButton({ receipts }: ReceiptExportButtonProps) {
  const { colors, shared } = useAppTheme();
  const [format, setFormat] = useState<ReceiptExportFormat>("json");
  const [range, setRange] = useState<ReceiptExportRange>("all");
  const [error, setError] = useState<string | null>(null);

  const count = filterReceiptsByRange(receipts, range, new Date()).length;

  async function handleExport() {
    if (count === 0) return;
    const text = exportReceipts(receipts, format, range, new Date());
    try {
      // A dismissed share sheet is not an error, so nothing is reported for it.
      await Share.share({ title: "MindVault receipts", message: text });
      setError(null);
    } catch {
      setError("Unable to share receipts.");
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>Format</Text>
      <View style={styles.options}>
        {FORMATS.map((option) => (
          <OptionPill
            key={option.value}
            label={option.label}
            selected={format === option.value}
            onPress={() => setFormat(option.value)}
          />
        ))}
      </View>

      <Text style={[styles.label, { color: colors.textMuted }]}>Range</Text>
      <View style={styles.options}>
        {RECEIPT_EXPORT_RANGES.map((option) => (
          <OptionPill
            key={option.value}
            label={option.label}
            selected={range === option.value}
            onPress={() => setRange(option.value)}
          />
        ))}
      </View>

      <Pressable
        onPress={() => void handleExport()}
        disabled={count === 0}
        accessibilityRole="button"
        accessibilityLabel="Export receipts"
        accessibilityHint="Opens the share sheet with your receipts as text"
        accessibilityState={{ disabled: count === 0 }}
        style={[shared.button, shared.primaryButton, count === 0 ? styles.disabled : null]}
      >
        <Text style={[shared.buttonText, shared.primaryButtonText]}>
          {count === 0
            ? "No receipts to export"
            : `Export ${count} ${count === 1 ? "receipt" : "receipts"} as ${format.toUpperCase()}`}
        </Text>
      </Pressable>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function OptionPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={[styles.pill, { backgroundColor: selected ? colors.primary : colors.neutralBg }]}
    >
      <Text style={[styles.pillText, { color: selected ? "#ffffff" : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pill: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
  error: {
    fontSize: 13,
  },
});
