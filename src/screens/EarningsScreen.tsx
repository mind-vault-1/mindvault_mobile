import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from "react-native";

import { fetchPayouts, type Payout } from "../api/payouts";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import {
  exportEarnings,
  filterPayoutsByKind,
  filterPayoutsByRange,
  totalsByAsset,
  type IncludedKinds,
  type OptionalKind,
} from "../utils/earningsExport";
import { RECEIPT_EXPORT_RANGES, type ReceiptExportFormat, type ReceiptExportRange } from "../utils/receiptExport";
import { openExternalUrl, stellarExpertTxUrl } from "../utils/stellarExpert";

const OPTIONAL_KINDS: { kind: OptionalKind; label: string }[] = [
  { kind: "tip", label: "Include tips" },
  { kind: "lease", label: "Include leases" },
  { kind: "purchase", label: "Include purchases" },
];

function shortHash(hash: string): string {
  return hash.length <= 14 ? hash : `${hash.slice(0, 6)}…${hash.slice(-6)}`;
}

export function EarningsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<ReceiptExportRange>("all");
  const [include, setInclude] = useState<IncludedKinds>({});

  useEffect(() => {
    let active = true;
    fetchPayouts()
      .then((rows) => { if (active) setPayouts(rows); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load payouts");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(
    () => filterPayoutsByKind(filterPayoutsByRange(payouts, range, new Date()), include),
    [payouts, range, include],
  );
  const totals = useMemo(() => Object.entries(totalsByAsset(visible)), [visible]);

  async function share(format: ReceiptExportFormat) {
    const message = exportEarnings(payouts, format, range, include, new Date());
    try {
      await Share.share({ message, title: `Earnings (${format.toUpperCase()})` });
    } catch {
      Alert.alert("Export failed", "Could not open the share sheet.");
    }
  }

  if (loading) {
    return <ActivityIndicator style={styles.loading} color={colors.primary} accessibilityLabel="Loading payouts" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Period">
        {RECEIPT_EXPORT_RANGES.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.chip, range === option.value && styles.chipSelected]}
            onPress={() => setRange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: range === option.value }}
          >
            <Text style={range === option.value ? styles.chipTextSelected : styles.text}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      {OPTIONAL_KINDS.map(({ kind, label }) => (
        <View key={kind} style={styles.toggleRow}>
          <Text style={styles.text}>{label}</Text>
          <Switch
            value={include[kind] === true}
            onValueChange={(value) => setInclude((prev) => ({ ...prev, [kind]: value }))}
            accessibilityLabel={label}
          />
        </View>
      ))}

      <View style={styles.card} accessibilityLabel="Totals">
        <Text style={styles.title}>Total</Text>
        {totals.length === 0 ? (
          <Text style={styles.muted}>No payouts in this period.</Text>
        ) : (
          totals.map(([asset, amount]) => (
            <Text key={asset} style={styles.text}>
              {amount} {asset}
            </Text>
          ))
        )}
      </View>

      <View style={styles.row}>
        <Pressable style={styles.button} onPress={() => void share("csv")} accessibilityRole="button" accessibilityLabel="Export CSV">
          <Text style={styles.buttonText}>Export CSV</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => void share("json")} accessibilityRole="button" accessibilityLabel="Export JSON">
          <Text style={styles.buttonText}>Export JSON</Text>
        </Pressable>
      </View>

      {visible.map((payout) => (
        <View key={payout.id} style={styles.card} accessibilityLabel={`Payout ${payout.amount} ${payout.asset}`}>
          <Text style={styles.title}>
            {payout.amount} {payout.asset}
            {payout.kind !== "payout" ? ` · ${payout.kind}` : ""}
          </Text>
          <Text style={styles.muted}>{new Date(payout.paidAt).toLocaleString()}</Text>
          <Pressable
            onPress={() =>
              openExternalUrl(stellarExpertTxUrl({ txHash: payout.txHash, network: payout.network || undefined })).catch(
                () => Alert.alert("Unable to open explorer"),
              )
            }
            accessibilityRole="link"
            accessibilityLabel={`View transaction ${payout.txHash} on explorer`}
          >
            <Text style={styles.link}>{shortHash(payout.txHash)}</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loading: { marginTop: spacing.lg },
    container: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.background },
    row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipTextSelected: { color: colors.onPrimary },
    card: { padding: spacing.md, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    title: { color: colors.text, fontWeight: "600" },
    text: { color: colors.text },
    muted: { color: colors.textMuted },
    link: { color: colors.primary, textDecorationLine: "underline" },
    error: { color: colors.danger },
    button: { flex: 1, padding: spacing.sm, borderRadius: 8, alignItems: "center", backgroundColor: colors.primary },
    buttonText: { color: colors.onPrimary, fontWeight: "600" },
  });
}
