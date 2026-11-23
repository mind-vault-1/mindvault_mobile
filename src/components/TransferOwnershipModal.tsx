import { useMemo, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { useTransferOwnership } from "../hooks/useTransferOwnership";
import { SignTransactionSheet } from "./SignTransactionSheet";
import type { Resource } from "../types";
import { openExternalUrl, stellarExpertTxUrl } from "../utils/stellarExpert";
import { hapticImpact } from "../utils/haptics";

interface TransferOwnershipModalProps {
  resource: Resource;
  visible: boolean;
  onClose: () => void;
  onSuccess: (txHash: string | null) => void;
}

const STEP_LABELS: Record<string, string> = {
  idle: "",
  confirm: "Review transfer details",
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
    detailCard: {
      gap: 8,
      padding: spacing.md,
      borderRadius: 12,
      backgroundColor: colors.neutralBg,
    },
    detailValue: {
      fontSize: 13,
      color: colors.text,
      fontFamily: "monospace",
    },
    warningText: {
      fontSize: 12,
      color: colors.warning,
      backgroundColor: colors.warningBg,
      borderRadius: 8,
      padding: 8,
    },
    scanButton: {
      backgroundColor: colors.primaryMuted,
      minHeight: 44,
      minWidth: 44,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 10,
    },
    scanButtonText: {
      color: colors.primary,
      fontWeight: "600",
    },
    scannerSheet: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      margin: spacing.lg,
      padding: spacing.md,
      gap: spacing.sm,
      overflow: "hidden",
    },
    scannerFrame: {
      height: 260,
      borderRadius: 12,
      overflow: "hidden",
    },
    scannerHint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
    },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
      padding: spacing.lg,
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
    confirmationText,
    setConfirmationText,
    isConfirmed,
    networkLabel,
    networkPassphrase,
    scanDestination,
    beginConfirm,
    cancelConfirm,
    pendingTransaction,
    start,
    submitSigned,
    cancelSigning,
    reset,
  } = useTransferOwnership();

  const [scanVisible, setScanVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const isConfirm = step === "confirm";
  const isProcessing = ["preparing", "submitting"].includes(step);
  const isDone = step === "done";

  function handleOpenExplorer() {
    if (!txHash) return;
    const url = stellarExpertTxUrl({ txHash });
    openExternalUrl(url).catch(() => {});
  }

  function closeScanner() {
    setScanVisible(false);
    setScanError(null);
    setScanned(false);
  }

  function handleClose() {
    closeScanner();
    reset();
    onClose();
  }

  function handleSuccess() {
    onSuccess(txHash);
    closeScanner();
    reset();
    onClose();
  }

  function openScanner() {
    setScanError(null);
    setScanned(false);
    setScanVisible(true);
  }

  function handleBarcodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    if (scanDestination(data)) {
      void hapticImpact();
      AccessibilityInfo.announceForAccessibility("Destination address scanned and validated.");
      closeScanner();
      return;
    }
    AccessibilityInfo.announceForAccessibility("Scanned code is not a valid Stellar public address. Try again.");
    setScanError("Scanned code is not a valid Stellar public address.");
    setScanned(false);
  }

  return (
    <>
      <Modal
        visible={visible && !pendingTransaction}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <Text style={typography.title} accessibilityRole="header">Transfer Ownership</Text>
            <Text style={[typography.body, styles.subtitle]}>
              Resource: {resource.title}
            </Text>

            {!isDone ? (
              <>
                {isConfirm ? (
                  <View style={styles.detailCard}>
                    <Text style={styles.label} accessibilityRole="header">Confirm ownership transfer</Text>
                    <Text accessibilityRole="alert" style={styles.warningText}>
                      This transfer is irreversible on-chain. Check every detail before continuing.
                    </Text>
                    <Text style={styles.label} selectable accessibilityLabel={`Destination address ${destinationAddress}`}>
                      Destination: {destinationAddress}
                    </Text>
                    <Text style={styles.label} accessibilityLabel={`Resource ${resource.title}, id ${resource.id}`}>
                      Resource: {resource.title} ({resource.id})
                    </Text>
                    <Text style={styles.label} accessibilityLabel={`Network ${networkLabel}, passphrase ${networkPassphrase}`}>
                      Network: {networkLabel} — {networkPassphrase}
                    </Text>
                    <TextInput
                      value={confirmationText}
                      onChangeText={setConfirmationText}
                      placeholder="TRANSFER"
                      placeholderTextColor={colors.textSubtle}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      editable={!isProcessing}
                      accessibilityLabel="Type TRANSFER to confirm ownership transfer"
                      style={styles.input}
                    />
                  </View>
                ) : (
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
                      accessibilityLabel="Destination Stellar address"
                      accessibilityHint="56-character Stellar public key beginning with G"
                    />
                    <Pressable
                      onPress={openScanner}
                      accessibilityRole="button"
                      accessibilityLabel="Scan destination QR"
                      accessibilityHint="Opens the camera to scan a Stellar public address QR code"
                      disabled={isProcessing}
                      style={[styles.scanButton, isProcessing && styles.disabledButton]}
                    >
                      <Text style={styles.scanButtonText}>Scan</Text>
                    </Pressable>
                    {destinationAddress.length > 0 && !isValidAddress ? (
                      <Text style={styles.validationHint} accessibilityRole="alert">
                        Enter a valid Stellar public key (starts with G).
                      </Text>
                    ) : null}
                  </>
                )}

                {error ? (
                  <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                    {error}
                  </Text>
                ) : null}

                {isProcessing ? (
                  <View style={styles.processingRow}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={typography.body} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
                      {STEP_LABELS[step]}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.actions}>
                  <Pressable
                    onPress={isConfirm ? cancelConfirm : handleClose}
                    style={[shared.button, styles.cancelButton]}
                    disabled={isProcessing}
                    accessibilityRole="button"
                    accessibilityLabel={isConfirm ? "Back to destination entry" : "Cancel transfer"}
                    accessibilityState={{ disabled: isProcessing }}
                  >
                    <Text style={styles.cancelText}>{isConfirm ? "Back" : "Cancel"}</Text>
                  </Pressable>
                  <Pressable
                    onPress={isConfirm ? () => void start(resource.id) : beginConfirm}
                    style={[
                      shared.button,
                      styles.confirmButton,
                      (!isValidAddress || isProcessing || (isConfirm && !isConfirmed)) && styles.disabledButton,
                    ]}
                    disabled={!isValidAddress || isProcessing || (isConfirm && !isConfirmed)}
                    accessibilityRole="button"
                    accessibilityLabel={isConfirm ? "Confirm ownership transfer" : "Continue to transfer confirmation"}
                    accessibilityState={{
                      disabled: !isValidAddress || isProcessing || (isConfirm && !isConfirmed),
                      busy: isProcessing,
                    }}
                  >
                    <Text style={shared.buttonText}>{isConfirm ? "Transfer ownership" : "Continue"}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>✓ {STEP_LABELS.done}</Text>
                {txHash ? (
                  <Pressable onPress={handleOpenExplorer} accessibilityRole="link" accessibilityLabel="View transaction in explorer">
                    <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">
                      Tx: {txHash}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={handleSuccess}
                  style={[shared.button, styles.confirmButton]}
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                >
                  <Text style={shared.buttonText}>Done</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={visible && scanVisible}
        transparent
        animationType="slide"
        onRequestClose={closeScanner}
      >
        <View style={styles.overlay}>
          <View style={styles.scannerSheet} accessibilityViewIsModal>
            {!permission ? (
              <View style={styles.centered}>
                <Text style={typography.body} accessibilityLiveRegion="polite">Requesting camera permission…</Text>
              </View>
            ) : !permission.granted ? (
              <View style={styles.centered}>
                <Text style={typography.title} accessibilityRole="header">Camera access is required</Text>
                <Text style={typography.body}>MindVault needs camera permission to scan QR codes.</Text>
                <Pressable
                  style={[shared.button, shared.primaryButton]}
                  onPress={requestPermission}
                  accessibilityRole="button"
                  accessibilityLabel="Grant Permission"
                  accessibilityHint="Requests camera access to allow scanning address QR codes"
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>Grant Permission</Text>
                </Pressable>
                <Pressable
                  onPress={closeScanner}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel scan"
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.scannerFrame}>
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    facing="back"
                    onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  />
                </View>
                <Text style={styles.scannerHint} accessibilityLiveRegion="polite">
                  Point at a QR code containing a Stellar public address
                </Text>
                {scanError ? (
                  <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
                    {scanError}
                  </Text>
                ) : null}
                <Pressable
                  onPress={closeScanner}
                  style={[shared.button, styles.cancelButton]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel scan"
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <SignTransactionSheet
        visible={visible && pendingTransaction !== null}
        unsignedXdr={pendingTransaction?.unsignedXdr ?? ""}
        networkPassphrase={pendingTransaction?.networkPassphrase}
        action="transfer ownership of this resource"
        onCancel={cancelSigning}
        onSigned={submitSigned}
      />
    </>
  );
}
