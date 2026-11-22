import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ReceiptExportButton } from "../components/ReceiptExportButton";
import { clearReceipts, listReceipts, type PaymentReceipt } from "../services/receipts";
import { fetchBuyerPayments } from "../api/payments";
import { getPublicKey } from "../services/wallet";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { openExternalUrl, stellarExpertTxUrl } from "../utils/stellarExpert";
import type { RootStackParamList } from "../navigation";

/** Receipts store amounts in USDC base units (7 decimals): "12500000" is 1.25 USDC. */
export function formatUsdc(atomic: string): string {
  const padded = atomic.padStart(8, "0");
  const whole = padded.slice(0, -7).replace(/^0+(?=\d)/, "");
  const fraction = padded.slice(-7).replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${fraction} USDC`;
}

export function PurchaseHistoryScreen() {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [receipts, setReceipts] = useState<(PaymentReceipt & { source: "local" | "on-chain" })[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);

  const loadReceipts = useCallback(async () => {
    try {
      const local = await listReceipts();
      const localEntries = local.map((receipt) => ({ ...receipt, source: "local" as const }));
      setReceipts(localEntries);
      setNextOffset(null);
      setError(null);

      const address = await getPublicKey();
      if (address) {
        try {
          const page = await fetchBuyerPayments(address, { limit: 20, offset: 0 });
          const seenHashes = new Set(local.map((receipt) => receipt.txHash));
          const chainEntries = page.payments
            .filter((payment) => {
              if (seenHashes.has(payment.txHash)) return false;
              seenHashes.add(payment.txHash);
              return true;
            })
            .map((payment) => ({
              resourceId: payment.resourceId,
              title: payment.resourceTitle,
              amount: payment.amount,
              asset: payment.asset,
              network: payment.network,
              txHash: payment.txHash,
              payer: payment.payer,
              paidAt: payment.paidAt,
              source: "on-chain" as const,
            }));
          setReceipts([...localEntries, ...chainEntries].sort(
            (a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt)
          ));
          setNextOffset(page.nextOffset);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to load on-chain purchase history.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load purchase history.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || nextOffset === null) return;
    setLoadingMore(true);
    try {
      const address = await getPublicKey();
      if (!address) { setNextOffset(null); return; }
      const page = await fetchBuyerPayments(address, { limit: 20, offset: nextOffset });
      setReceipts((current) => {
        const known = new Set(current.map((receipt) => receipt.txHash));
        const additions = page.payments
          .filter((payment) => !known.has(payment.txHash))
          .map((payment) => ({
            resourceId: payment.resourceId,
            title: payment.resourceTitle,
            amount: payment.amount,
            asset: payment.asset,
            network: payment.network,
            txHash: payment.txHash,
            payer: payment.payer,
            paidAt: payment.paidAt,
            source: "on-chain" as const,
          }));
        return [...current, ...additions].sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt));
      });
      setNextOffset(page.nextOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load more purchases.");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextOffset]);

  // Reload on focus, so a purchase made elsewhere in the app shows up straight away.
  useFocusEffect(
    useCallback(() => {
      void loadReceipts();
    }, [loadReceipts])
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? receipts.filter((receipt) => receipt.title.toLowerCase().includes(term)) : receipts;
  }, [receipts, query]);

  async function handleClear() {
    setConfirmingClear(false);
    try {
      await clearReceipts();
      await loadReceipts();
    } catch {
      setError("Unable to clear purchase history.");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={shared.screen} edges={["left", "right", "bottom"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Loading purchase history" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={shared.screen} edges={["left", "right", "bottom"]}>
      <FlatList
        data={visible}
        keyExtractor={(receipt) => receipt.txHash}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            {receipts.length > 0 ? <ReceiptExportButton receipts={receipts} /> : null}

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by title"
              placeholderTextColor={colors.textSubtle}
              autoCorrect={false}
              style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              accessibilityLabel="Search purchases"
            />

            {error ? (
              <Text style={[typography.body, { color: colors.danger }]} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            {receipts.length > 0 ? (
              <Pressable
                onPress={() => setConfirmingClear(true)}
                style={[shared.button, { backgroundColor: colors.dangerBg }]}
                accessibilityRole="button"
                accessibilityLabel="Clear history"
                accessibilityHint="Asks for confirmation before deleting every saved receipt"
              >
                <Text style={[shared.buttonText, { color: colors.danger }]}>Clear history</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={typography.cardTitle}>
              {receipts.length === 0 ? "No purchases yet" : "No matching purchases"}
            </Text>
            <Text style={typography.body}>
              {receipts.length === 0
                ? "Receipts appear here after you unlock a paid resource."
                : `Nothing matches "${query.trim()}".`}
            </Text>
          </View>
        }
        renderItem={({ item }) => <ReceiptRow receipt={item} />}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading more purchases" /> : null}
      />

      <Modal
        visible={confirmingClear}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmingClear(false)}
      >
        <View style={styles.overlay}>
          <View style={[styles.dialog, { backgroundColor: colors.surface }]}>
            <Text style={typography.cardTitle}>Clear purchase history?</Text>
            <Text style={typography.body}>
              This removes the receipts saved on this device. Your purchases on the network are not affected.
            </Text>
            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setConfirmingClear(false)}
                style={[shared.button, styles.dialogButton, { backgroundColor: colors.neutralBg }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[shared.buttonText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleClear()}
                style={[shared.button, styles.dialogButton, { backgroundColor: colors.danger }]}
                accessibilityRole="button"
                accessibilityLabel="Confirm clear history"
              >
                <Text style={[shared.buttonText, { color: "#ffffff" }]}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ReceiptRow({ receipt }: { receipt: PaymentReceipt & { source: "local" | "on-chain" } }) {
  const { colors, typography } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const title = receipt.title.trim() || "Untitled resource";
  const paidOn = new Date(receipt.paidAt).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function handleOpenExplorer() {
    const url = stellarExpertTxUrl({ txHash: receipt.txHash, network: receipt.network });
    openExternalUrl(url).catch(() => Alert.alert("Unable to open explorer"));
  }

  function handlePress() {
    navigation.navigate("ReceiptDetail", { txHash: receipt.txHash });
  }

  return (
    <Pressable onPress={handlePress} style={[rowStyles.row, { borderColor: colors.border }]}>
      <Text style={typography.cardTitle}>{title}</Text>
      <Text style={typography.price}>{formatUsdc(receipt.amount)}</Text>
      <Text style={typography.body}>{receipt.source === "local" ? "Saved on this device" : "On-chain payment"}</Text>
      <Text style={typography.body}>{paidOn}</Text>
      <Pressable
        onPress={(e) => {
          e?.stopPropagation?.();
          handleOpenExplorer();
        }}
        style={rowStyles.link}
        accessibilityRole="link"
        accessibilityLabel={`View transaction ${receipt.txHash} on Stellar Expert`}
        accessibilityHint="Opens the transaction in Stellar Explorer"
      >
        <Text style={[typography.body, { color: colors.primary }]} numberOfLines={1} ellipsizeMode="middle">
          {receipt.txHash}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  link: {
    minHeight: 44,
    justifyContent: "center",
  },
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    content: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl },
    header: { gap: spacing.md, marginBottom: spacing.sm },
    search: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 14,
    },
    empty: { paddingVertical: spacing.xl, gap: spacing.sm },
    overlay: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.lg,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    dialog: { borderRadius: 16, padding: spacing.lg, gap: spacing.sm },
    dialogActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    dialogButton: { flex: 1 },
  });
}
