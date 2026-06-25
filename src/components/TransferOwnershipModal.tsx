import { useMemo } from "react";
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
import { useTransferOwnership } from "../hooks/useTransferOwnership";
import type { Resource } from "../types";
import { openExternalUrl, stellarExpertTxUrl } from "../utils/stellarExpert";

interface TransferOwnershipModalProps {
  resource: Resource;
  visible: boolean;
  onClose: () => void;
  onSuccess: (txHash: string | null) => void;
}

const STEP_LABELS: Record<string, string> = {
  idle: "",
  preparing: "Preparing transaction…",
  signing: "Waiting for signature…",
  submitting: "Submitting to network…",
  done: "Ownership transferred!",
  error: "",
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: spacing.lg,
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },
    subtitle: {
      color: colors.textMuted,
    },
    label: {
      fontSize: 13,
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
      fontSize: 13,
      color: colors.text,
      fontFamily: "monospace",
    },
    inputError: {
      borderColor: colors.danger,
    },
    validationHint: {
      fontSize: 12,
      color: colors.danger,
      marginTop: -8,
    },
    errorText: {
      fontSize: 13,
      color: colors.danger,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      padding: 8,
    },
    processingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    actions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },
    cancelButton: {
      flex: 1,
      backgroundColor: colors.neutralBg,
    },
    cancelText: {
      color: colors.text,
      fontWeight: "600",
      textAlign: "center",
    },
    confirmButton: {
      flex: 1,
      backgroundColor: colors.primary,
    },
    disabledButton: {
      opacity: 0.4,
    },
    successContainer: {
      gap: 12,
      alignItems: "center",
    },
    successText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.success,
    },
    txHash: {
      fontSize: 11,
      fontFamily: "monospace",
      color: colors.primary,
      width: "100%",
      textAlign: "center",
    },
  });
}

export function TransferOwnershipModal({
  resource,
  visible,
  onClose,
  onSuccess,
}: TransferOwnershipModalProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    step,
    error,
    txHash,
    destinationAddress,
    setDestinationAddress,
    isValidAddress,
    start,
    reset,
  } = useTransferOwnership();

  const isProcessing = ["preparing", "signing", "submitting"].includes(step);
  const isDone = step === "done";

  function handleOpenExplorer() {
    if (!txHash) return;
    const url = stellarExpertTxUrl({ txHash });
    openExternalUrl(url).catch(() => {});
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSuccess() {
    onSuccess(txHash);
    reset();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={typography.title}>Transfer Ownership</Text>
          <Text style={[typography.body, styles.subtitle]}>
            Resource: {resource.title}
          </Text>

          {!isDone ? (
            <>
              <Text style={styles.label}>Destination Stellar Address</Text>
              <TextInput
                value={destinationAddress}
                onChangeText={setDestinationAddress}
                placeholder="G…"
                placeholderTextColor={colors.textSubtle}
                style={[
                  styles.input,
                  destinationAddress.length > 0 && !isValidAddress
                    ? styles.inputError
                    : null,
                ]}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!isProcessing}
              />

              {destinationAddress.length > 0 && !isValidAddress ? (
                <Text style={styles.validationHint}>
                  Address must start with G and be 56 characters long.
                </Text>
              ) : null}

              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}

              {isProcessing ? (
                <View style={styles.processingRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={typography.body}>{STEP_LABELS[step]}</Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  onPress={handleClose}
                  style={[shared.button, styles.cancelButton]}
                  disabled={isProcessing}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void start(resource.id)}
                  style={[
                    shared.button,
                    styles.confirmButton,
                    (!isValidAddress || isProcessing) && styles.disabledButton,
                  ]}
                  disabled={!isValidAddress || isProcessing}
                >
                  <Text style={shared.buttonText}>Transfer</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.successContainer}>
              <Text style={styles.successText}>✓ {STEP_LABELS.done}</Text>
              {txHash ? (
                <Pressable onPress={handleOpenExplorer}>
                  <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">
                    Tx: {txHash}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleSuccess}
                style={[shared.button, styles.confirmButton]}
              >
                <Text style={shared.buttonText}>Done</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
