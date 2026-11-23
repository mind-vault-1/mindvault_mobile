import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { useEditPrice, validatePrice } from "../hooks/useEditPrice";
import { SignTransactionSheet } from "./SignTransactionSheet";

interface EditPriceSheetProps {
  visible: boolean;
  resourceId: string;
  resourceTitle: string;
  oldPrice: string;
  onClose: () => void;
  onUpdated: (newPrice: string) => void;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    sheet: {
      gap: spacing.md,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      backgroundColor: colors.surface,
    },
    prices: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    priceColumn: { flex: 1, gap: 4 },
    label: { color: colors.textMuted, fontSize: 13 },
    value: { color: colors.text, fontSize: 16, fontWeight: "600" },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 16,
    },
    inputError: { borderColor: colors.danger },
    error: { color: colors.danger, fontSize: 13 },
    actions: { flexDirection: "row", gap: spacing.sm },
    action: { flex: 1 },
    disabled: { opacity: 0.6 },
  });
}

export function EditPriceSheet({
  visible,
  resourceId,
  resourceTitle,
  oldPrice,
  onClose,
  onUpdated,
}: EditPriceSheetProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [newPrice, setNewPrice] = useState(oldPrice);
  const [touched, setTouched] = useState(false);
  const {
    status,
    error,
    pendingTransaction,
    preparePriceEdit,
    submitSigned,
    cancelSigning,
    resetError,
  } = useEditPrice();

  useEffect(() => {
    if (visible) {
      setNewPrice(oldPrice);
      setTouched(false);
      resetError();
    }
  }, [oldPrice, visible]);

  const validationError = touched ? validatePrice(newPrice) : null;
  const busy = status !== "idle";
  const saveDisabled = busy || validatePrice(newPrice) !== null || newPrice.trim() === oldPrice.trim();

  async function save() {
    setTouched(true);
    if (validatePrice(newPrice)) return;
    await preparePriceEdit(resourceId, newPrice);
  }

  async function signed(signedXdr: string) {
    if (await submitSigned(signedXdr)) {
      onUpdated(newPrice.trim());
      onClose();
    }
  }

  return (
    <>
      <Modal
        visible={visible && pendingTransaction === null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!busy) onClose();
        }}
        accessibilityViewIsModal
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={typography.title} accessibilityRole="header">
              Edit price for {resourceTitle}
            </Text>
            <View style={styles.prices} accessible accessibilityLabel={`Old price ${oldPrice} USDC. New price ${newPrice || "not entered"} USDC.`}>
              <View style={styles.priceColumn}>
                <Text style={styles.label}>Old price</Text>
                <Text style={styles.value}>{oldPrice} USDC</Text>
              </View>
              <View style={styles.priceColumn}>
                <Text style={styles.label}>New price</Text>
                <Text style={styles.value}>{newPrice || "—"} USDC</Text>
              </View>
            </View>
            <TextInput
              value={newPrice}
              onChangeText={(value) => {
                setNewPrice(value);
                setTouched(true);
                resetError();
              }}
              onBlur={() => setTouched(true)}
              keyboardType="decimal-pad"
              autoCorrect={false}
              placeholder="New price"
              placeholderTextColor={colors.textSubtle}
              editable={!busy}
              accessibilityLabel="New price in USDC"
              accessibilityHint="Enter a positive amount with no more than 7 decimal places"
              style={[styles.input, validationError ? styles.inputError : null]}
            />
            {validationError || error ? (
              <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                {validationError ?? error}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                onPress={onClose}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Cancel price edit"
                accessibilityState={{ disabled: busy }}
                style={[shared.button, styles.action]}
              >
                <Text style={shared.buttonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void save()}
                disabled={saveDisabled}
                accessibilityRole="button"
                accessibilityLabel="Save new price"
                accessibilityState={{ disabled: saveDisabled, busy }}
                style={[shared.button, shared.primaryButton, styles.action, saveDisabled ? styles.disabled : null]}
              >
                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>Save Price</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <SignTransactionSheet
        visible={visible && pendingTransaction !== null}
        unsignedXdr={pendingTransaction?.unsignedXdr ?? ""}
        networkPassphrase={pendingTransaction?.networkPassphrase}
        action="update this resource's price"
        onCancel={cancelSigning}
        onSigned={signed}
      />
    </>
  );
}
