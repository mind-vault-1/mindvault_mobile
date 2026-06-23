import React, { useEffect, useState } from "react";
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

import { accessResource } from "../api/payment";
import { colors, shared, spacing, typography } from "../theme";
import type { AccessResult } from "../types";

interface PaywallModalProps {
  visible: boolean;
  accessUrl: string;
  resourceTitle: string;
  price: string;
  onClose: () => void;
}

type Phase = "confirm" | "loading" | "result" | "error";

export function PaywallModal({
  visible,
  accessUrl,
  resourceTitle,
  price,
  onClose,
}: PaywallModalProps) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [result, setResult] = useState<AccessResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset state each time the modal opens
  useEffect(() => {
    if (visible) {
      setPhase("confirm");
      setResult(null);
      setErrorMsg(null);
    }
  }, [visible]);

  async function handlePay() {
    setPhase("loading");
    try {
      const res = await accessResource(accessUrl);
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
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={typography.cardTitle} numberOfLines={1}>
              {resourceTitle}
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Confirm phase */}
          {phase === "confirm" && (
            <View style={styles.body}>
              <Text style={typography.body}>
                This resource requires a payment of{" "}
                <Text style={{ fontWeight: "700", color: colors.primary }}>
                  {price} USDC
                </Text>{" "}
                on Stellar to access.
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

          {/* Loading phase */}
          {phase === "loading" && (
            <View style={[styles.body, styles.centered]}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={typography.body}>Signing payment…</Text>
            </View>
          )}

          {/* Result phase — text content */}
          {phase === "result" && result?.type === "text" && (
            <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.contentText}>{result.content}</Text>
            </ScrollView>
          )}

          {/* Error phase */}
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
  );
}

const styles = StyleSheet.create({
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
