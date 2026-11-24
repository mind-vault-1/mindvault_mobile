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
import { t, type TranslationKey } from "../i18n";
import { TRANSFER_CONFIRM_PHRASE } from "../hooks/useTransferOwnership";

interface TransferOwnershipModalProps {
  resource: Resource;
  visible: boolean;
  onClose: () => void;
  onSuccess: (txHash: string | null) => void;
}

// Looked up at render time so the labels follow the current language.
const STEP_LABEL_KEYS: Partial<Record<string, TranslationKey>> = {
  confirm: "modals.transfer.step.confirm",
  preparing: "modals.transfer.step.preparing",
  signing: "modals.transfer.step.signing",
  submitting: "modals.transfer.step.submitting",
  done: "modals.transfer.step.done",
};

function stepLabel(step: string): string {
  const key = STEP_LABEL_KEYS[step];
  return key ? t(key) : "";
}

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
      AccessibilityInfo.announceForAccessibility(t("modals.transfer.scanned"));
      closeScanner();
      return;
    }
    AccessibilityInfo.announceForAccessibility(t("modals.transfer.scanInvalidAnnouncement"));
    setScanError(t("modals.transfer.scanInvalid"));
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
            <Text style={typography.title} accessibilityRole="header">{t("modals.transfer.title")}</Text>
            <Text style={[typography.body, styles.subtitle]}>
              {t("modals.transfer.resource", { title: resource.title })}
            </Text>

            {!isDone ? (
              <>
                {isConfirm ? (
                  <View style={styles.detailCard}>
                    <Text style={styles.label} accessibilityRole="header">{t("modals.transfer.confirmHeading")}</Text>
                    <Text accessibilityRole="alert" style={styles.warningText}>
                      {t("modals.transfer.irreversible")}
                    </Text>
                    <Text style={styles.label} selectable accessibilityLabel={t("modals.transfer.destinationLabel", { address: destinationAddress })}>
                      {t("modals.transfer.destination", { address: destinationAddress })}
                    </Text>
                    <Text style={styles.label} accessibilityLabel={t("modals.transfer.resourceDetailLabel", { title: resource.title, id: resource.id })}>
                      {t("modals.transfer.resourceDetail", { title: resource.title, id: resource.id })}
                    </Text>
                    <Text style={styles.label} accessibilityLabel={t("modals.transfer.networkLabel", { label: networkLabel, passphrase: networkPassphrase })}>
                      {t("modals.transfer.network", { label: networkLabel, passphrase: networkPassphrase })}
                    </Text>
                    <TextInput
                      value={confirmationText}
                      onChangeText={setConfirmationText}
                      placeholder={TRANSFER_CONFIRM_PHRASE}
                      placeholderTextColor={colors.textSubtle}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      editable={!isProcessing}
                      accessibilityLabel={t("modals.transfer.typeToConfirmLabel", { phrase: TRANSFER_CONFIRM_PHRASE })}
                      style={styles.input}
                    />
                  </View>
                ) : (
                  <>
                    <Text style={styles.label}>{t("modals.transfer.destinationHeading")}</Text>
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
                      accessibilityLabel={t("modals.transfer.destinationInputLabel")}
                      accessibilityHint={t("modals.transfer.destinationInputHint")}
                    />
                    <Pressable
                      onPress={openScanner}
                      accessibilityRole="button"
                      accessibilityLabel={t("modals.transfer.scanLabel")}
                      accessibilityHint={t("modals.transfer.scanHint")}
                      disabled={isProcessing}
                      style={[styles.scanButton, isProcessing && styles.disabledButton]}
                    >
                      <Text style={styles.scanButtonText}>{t("modals.transfer.scan")}</Text>
                    </Pressable>
                    {destinationAddress.length > 0 && !isValidAddress ? (
                      <Text style={styles.validationHint} accessibilityRole="alert">
                        {t("modals.transfer.invalidAddress")}
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
                      {stepLabel(step)}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.actions}>
                  <Pressable
                    onPress={isConfirm ? cancelConfirm : handleClose}
                    style={[shared.button, styles.cancelButton]}
                    disabled={isProcessing}
                    accessibilityRole="button"
                    accessibilityLabel={isConfirm ? t("modals.transfer.backLabel") : t("modals.transfer.cancelLabel")}
                    accessibilityState={{ disabled: isProcessing }}
                  >
                    <Text style={styles.cancelText}>{isConfirm ? t("modals.transfer.back") : t("modals.cancel")}</Text>
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
                    accessibilityLabel={isConfirm ? t("modals.transfer.submitLabel") : t("modals.transfer.continueLabel")}
                    accessibilityState={{
                      disabled: !isValidAddress || isProcessing || (isConfirm && !isConfirmed),
                      busy: isProcessing,
                    }}
                  >
                    <Text style={shared.buttonText}>{isConfirm ? t("modals.transfer.submit") : t("modals.transfer.continue")}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>✓ {stepLabel("done")}</Text>
                {txHash ? (
                  <Pressable onPress={handleOpenExplorer} accessibilityRole="link" accessibilityLabel={t("modals.transfer.viewTxLabel")}>
                    <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">
                      {t("modals.transfer.txHash", { txHash })}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={handleSuccess}
                  style={[shared.button, styles.confirmButton]}
                  accessibilityRole="button"
                  accessibilityLabel={t("modals.transfer.done")}
                >
                  <Text style={shared.buttonText}>{t("modals.transfer.done")}</Text>
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
                <Text style={typography.body} accessibilityLiveRegion="polite">{t("modals.transfer.requestingPermission")}</Text>
              </View>
            ) : !permission.granted ? (
              <View style={styles.centered}>
                <Text style={typography.title} accessibilityRole="header">{t("modals.transfer.permissionRequired")}</Text>
                <Text style={typography.body}>{t("modals.transfer.permissionBody")}</Text>
                <Pressable
                  style={[shared.button, shared.primaryButton]}
                  onPress={requestPermission}
                  accessibilityRole="button"
                  accessibilityLabel={t("modals.transfer.grantPermission")}
                  accessibilityHint={t("modals.transfer.grantPermissionHint")}
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>{t("modals.transfer.grantPermission")}</Text>
                </Pressable>
                <Pressable
                  onPress={closeScanner}
                  accessibilityRole="button"
                  accessibilityLabel={t("modals.transfer.cancelScanLabel")}
                >
                  <Text style={styles.cancelText}>{t("modals.cancel")}</Text>
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
                  {t("modals.transfer.scannerHint")}
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
                  accessibilityLabel={t("modals.transfer.cancelScanLabel")}
                >
                  <Text style={styles.cancelText}>{t("modals.cancel")}</Text>
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
        action={t("modals.transfer.signAction")}
        onCancel={cancelSigning}
        onSigned={submitSigned}
      />
    </>
  );
}
