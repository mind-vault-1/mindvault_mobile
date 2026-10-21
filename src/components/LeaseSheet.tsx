import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAppTheme } from "../theme/ThemeProvider";
import type { ThemeColors } from "../theme";
import { SignTransactionSheet } from "./SignTransactionSheet";
import { spacing } from "../theme";
import { signTransactionXdr, DEFAULT_NETWORK_PASSPHRASE } from "../api/resources";
import { buyLease, quoteLease, type LeaseTier, type LeaseQuote, leaseTierLabel, leaseTierSeconds } from "../api/leases";
import { saveReceipt } from "../services/receipts";
import type { Resource } from "../types";

interface LeaseSheetProps {
  visible: boolean;
  resource: Resource;
  price: string;
  onClose: () => void;
  onLeasePurchased: (result: { tier: LeaseTier; txHash: string }) => void;
}

type Phase = "select" | "quoting" | "confirm" | "signing" | "result" | "error";

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "85%",
      paddingBottom: spacing.xxl,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    closeBtn: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    closeBtnText: {
      fontSize: 16,
      color: colors.textMuted,
    },
    title: { flex: 1, flexShrink: 1 },
    body: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    centered: {
      alignItems: "center",
      paddingVertical: spacing.xxl,
    },
    actionBtn: {
      width: "100%",
      alignItems: "center",
      paddingVertical: 14,
    },
    tierOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    tierOptionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
    },
    tierInfo: {
      flex: 1,
    },
    tierLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    tierDuration: {
      fontSize: 12,
      color: colors.textSubtle,
    },
    selectedIndicator: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    checkmark: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: "#ffffff",
    },
    creatorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    creatorLabel: {
      fontSize: 13,
      color: colors.textMuted,
    },
    creatorAddress: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.text,
      fontFamily: "monospace",
    },
    hint: {
      fontSize: 12,
      color: colors.textSubtle,
      textAlign: "center",
    },
    errorText: {
      color: colors.danger,
      textAlign: "center",
    },
    resultContent: {
      gap: spacing.md,
      alignItems: "center",
    },
    resultTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.success,
    },
    resultDetail: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: "center",
    },
    txHashRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.sm,
      backgroundColor: colors.neutralBg,
      borderRadius: 8,
    },
    txHashLabel: {
      fontSize: 12,
      color: colors.textMuted,
    },
    txHashValue: {
      fontSize: 12,
      fontFamily: "monospace",
      color: colors.text,
    },
  });
}

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function LeaseSheet({
  visible,
  resource,
  price,
  onClose,
  onLeasePurchased,
}: LeaseSheetProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [phase, setPhase] = useState<Phase>("select");
  const [selectedTier, setSelectedTier] = useState<LeaseTier | null>(null);
  const [quote, setQuote] = useState<LeaseQuote | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ tier: LeaseTier; txHash: string } | null>(null);

  const flow = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    flow.current += 1;
    busy.current = false;
    setPhase("select");
    setSelectedTier(null);
    setQuote(null);
    setErrorMsg(null);
    setResult(null);
    return () => { flow.current += 1; };
  }, [visible, resource.id]);

  function isActive(run: number) {
    return visible && flow.current === run;
  }

  function close() {
    flow.current += 1;
    busy.current = false;
    setPhase("select");
    onClose();
  }

  function showError(err: unknown, run: number) {
    if (!isActive(run)) return;
    busy.current = false;
    setErrorMsg(err instanceof Error ? err.message : "Unable to purchase lease. Please try again.");
    setPhase("error");
  }

  async function handleTierSelect(tier: LeaseTier) {
    if (busy.current) return;
    setSelectedTier(tier);
    setPhase("quoting");
    setErrorMsg(null);

    const run = ++flow.current;
    busy.current = true;

    try {
      const q = await quoteLease(resource.id, tier);
      if (!isActive(run)) return;
      setQuote(q);
      setPhase("confirm");
    } catch (err) {
      showError(err, run);
    } finally {
      if (isActive(run)) busy.current = false;
    }
  }

  async function handleConfirm() {
    if (!selectedTier || !quote || busy.current) return;
    const run = ++flow.current;
    busy.current = true;
    setErrorMsg(null);
    setPhase("signing");
  }

  const signingRun = flow.current;

  if (!visible) return null;

  const tiers: LeaseTier[] = [0, 1, 2];

  return (
    <>
      <Modal
        visible={visible && phase !== "signing"}
        animationType="slide"
        transparent
        onRequestClose={close}
        accessibilityViewIsModal
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={[typography.cardTitle, styles.title]} numberOfLines={2}>
                Rent {resource.title}
              </Text>
              <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {phase === "select" && (
              <View style={styles.body}>
                <Text style={typography.body}>
                  Choose a lease duration. Prices are set by the creator and may differ from the
                  one-time purchase price of{" "}
                  <Text style={{ fontWeight: "700", color: colors.primary }}>{price} USDC</Text>.
                </Text>
                <Text style={styles.hint}>Leases are recorded on-chain. USDC is paid to the creator.</Text>

                {tiers.map((tier) => (
                  <Pressable
                    key={tier}
                    onPress={() => handleTierSelect(tier)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${leaseTierLabel(tier)} lease`}
                    style={[
                      styles.tierOption,
                      selectedTier === tier && styles.tierOptionSelected,
                    ]}
                  >
                    <View style={styles.tierInfo}>
                      <Text style={styles.tierLabel}>{leaseTierLabel(tier)}</Text>
                      <Text style={styles.tierDuration}>
                        {leaseTierSeconds(tier) / 3600} hour{leaseTierSeconds(tier) > 3600 ? "s" : ""}
                      </Text>
                    </View>
                    <View style={styles.selectedIndicator}>
                      {selectedTier === tier && <View style={styles.checkmark} />}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            {phase === "quoting" && (
              <View style={[styles.body, styles.centered]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={typography.body} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
                  Fetching lease quote…
                </Text>
              </View>
            )}

            {phase === "confirm" && quote && (
              <View style={styles.body}>
                <Text style={typography.body}>
                  Rent <Text style={{ fontWeight: "700" }}>{leaseTierLabel(quote.tier)}</Text> access for
                </Text>
                <Text style={{ fontSize: 24, fontWeight: "700", color: colors.primary, textAlign: "center" }}>
                  {Number(quote.price) / 10_000_000} USDC
                </Text>
                <View style={styles.creatorRow}>
                  <Text style={styles.creatorLabel}>Creator:</Text>
                  <Text style={styles.creatorAddress}>{shortenAddress(quote.creator)}</Text>
                </View>
                <Text style={styles.hint}>
                  You will sign a USDC transfer to the creator, then record the lease on-chain.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleConfirm}
                  style={[shared.button, shared.primaryButton, styles.actionBtn]}
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>Confirm & Pay</Text>
                </Pressable>
              </View>
            )}

            {phase === "error" && (
              <View style={styles.body}>
                <Text accessibilityRole="alert" style={[typography.body, styles.errorText]}>
                  {errorMsg}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (quote) setPhase("confirm");
                    else setPhase("select");
                  }}
                  style={[shared.button, shared.primaryButton, styles.actionBtn]}
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>Try Again</Text>
                </Pressable>
              </View>
            )}

            {result && phase === "result" && (
              <View style={[styles.body, styles.centered, styles.resultContent]}>
                <Text style={styles.resultTitle}>Lease Purchased</Text>
                <Text style={styles.resultDetail}>
                  Your <Text style={{ fontWeight: "700" }}>{leaseTierLabel(result.tier)}</Text> lease is{" "}
                  <Text style={{ fontWeight: "600", color: colors.warning }}>Pending</Text> settlement.
                </Text>
                <View style={styles.txHashRow}>
                  <Text style={styles.txHashLabel}>Tx:</Text>
                  <Text style={styles.txHashValue} numberOfLines={1} ellipsizeMode="middle">
                    {result.txHash}
                  </Text>
                </View>
                <Text style={styles.hint}>
                  The lease will become Active once a settler confirms the payment. You can view the
                  transaction on Stellar Expert.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={close}
                  style={[shared.button, shared.primaryButton, styles.actionBtn]}
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>Done</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {visible && phase === "signing" && quote ? (
        <SignTransactionSheet
          visible
          unsignedXdr=""
          networkPassphrase={DEFAULT_NETWORK_PASSPHRASE}
          sign={async (secret) => {
            if (!isActive(signingRun)) throw new Error("Lease purchase cancelled.");
            try {
              const purchaseResult = await buyLease(
                resource.id,
                quote.tier,
                secret,
                async (xdr, passphrase) => signTransactionXdr(xdr, secret, passphrase)
              );
              if (!isActive(signingRun)) throw new Error("Lease purchase cancelled.");
              
              // Save receipt for the lease purchase
              await saveReceipt({
                resourceId: resource.id,
                title: `Lease: ${leaseTierLabel(purchaseResult.tier)}`,
                amount: quote.price,
                asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
                network: DEFAULT_NETWORK_PASSPHRASE.includes("Test") ? "testnet" : "mainnet",
                txHash: purchaseResult.txHash,
                payer: "",
                paidAt: new Date().toISOString(),
              });
              
              setResult({ tier: purchaseResult.tier, txHash: purchaseResult.txHash });
              setPhase("result");
              onLeasePurchased({ tier: purchaseResult.tier, txHash: purchaseResult.txHash });
              return "";
            } catch (err) {
              showError(err, signingRun);
              throw err;
            }
          }}
          onCancel={close}
          onSigned={() => {}}
        />
      ) : null}
    </>
  );
}