import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  prepareResourceAccess,
  signPaymentTransaction,
  submitSignedPayment,
  type PaymentChallenge,
} from "../api/payment";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import type { AccessResult } from "../types";
import { SignTransactionSheet } from "./SignTransactionSheet";

interface PaywallModalProps {
  visible: boolean;
  accessUrl: string;
  resourceTitle: string;
  price: string;
  onClose: () => void;
}

type Phase = "confirm" | "loading" | "signing" | "result" | "error";

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
      maxHeight: "80%",
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
      padding: spacing.xs,
    },
    closeBtnText: {
      fontSize: 16,
      color: colors.textMuted,
    },
    body: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    centered: {
      alignItems: "center",
      paddingVertical: spacing.xxl,
    },
    actionBtn: {
      alignItems: "center",
      paddingVertical: 12,
    },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
    },
    scrollArea: {
      flexGrow: 0,
    },
    scrollContent: {
      padding: spacing.lg,
    },
    contentText: {
      fontSize: 14,
      color: colors.text,
      lineHeight: 22,
    },
  });
}

export function PaywallModal({
  visible,
  accessUrl,
  resourceTitle,
  price,
  onClose,
}: PaywallModalProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [phase, setPhase] = useState<Phase>("confirm");
  const [result, setResult] = useState<AccessResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<PaymentChallenge | null>(null);

  useEffect(() => {
    if (visible) {
      setPhase("confirm");
      setResult(null);
      setErrorMsg(null);
      setChallenge(null);
    }
  }, [visible]);

  async function handlePay() {
    setPhase("loading");
    try {
      const access = await prepareResourceAccess(accessUrl, price);
      if (access.type === "payment") {
        setChallenge(access.challenge);
        setPhase("signing");
        return;
      }

      if (access.result.type === "external") {
        await Linking.openURL(access.result.url);
        onClose();
        return;
      }
      setResult(access.result);
      setPhase("result");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error.");
      setPhase("error");
    }
  }

  async function handleSigned(transaction: string) {
    if (!challenge) {
      setErrorMsg("Payment request expired. Please try again.");
      setPhase("error");
      return;
    }

    setPhase("loading");
    try {
      const res = await submitSignedPayment(accessUrl, challenge, transaction);
      setChallenge(null);
      if (res.type === "external") {
        await Linking.openURL(res.url);
        onClose();
        return;
      }
      setResult(res);
      setPhase("result");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error.");
      setPhase("error");
    }
  }

  return (
    <>
      <Modal
        visible={visible && phase !== "signing"}
        animationType="slide"
        transparent
        onRequestClose={onClose}
        accessibilityViewIsModal
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={typography.cardTitle} numberOfLines={1}>
                {resourceTitle}
              </Text>
              <Pressable onPress={onClose} accessibilityLabel="Close" style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {phase === "confirm" && (
              <View style={styles.body}>
                <Text style={typography.body}>
                  This resource requires a payment of{" "}
                  <Text style={{ fontWeight: "700", color: colors.primary }}>
                    {price} USDC
                  </Text>{" "}
                  on Stellar to access.
                </Text>
                <Text style={styles.hint}>
                  You'll sign the payment with your Stellar key; the server pays the network fee.
                </Text>
                <Pressable
                  onPress={handlePay}
                  style={[shared.button, shared.primaryButton, styles.actionBtn]}
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>
                    Pay &amp; Access
                  </Text>
                </Pressable>
              </View>
            )}

            {phase === "loading" && (
              <View style={[styles.body, styles.centered]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={typography.body}>Preparing payment…</Text>
              </View>
            )}

            {phase === "result" && result?.type === "text" && (
              <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.contentText}>{result.content}</Text>
              </ScrollView>
            )}

            {phase === "error" && (
              <View style={styles.body}>
                <Text style={[typography.body, { color: colors.danger }]}>{errorMsg}</Text>
                <Pressable
                  onPress={handlePay}
                  style={[shared.button, shared.primaryButton, styles.actionBtn]}
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>Retry</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
      <SignTransactionSheet
        visible={visible && phase === "signing" && challenge !== null}
        unsignedXdr=""
        sign={(secret) =>
          challenge
            ? signPaymentTransaction(challenge, secret)
            : Promise.reject(new Error("Payment request expired. Please try again."))
        }
        onCancel={() => {
          setChallenge(null);
          setPhase("confirm");
        }}
        onSigned={handleSigned}
      />
    </>
  );
}
