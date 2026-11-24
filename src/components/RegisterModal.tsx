import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { prepareRegister, submitRegister } from "../api/resources";
import type { Resource } from "../types";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { openExternalUrl, stellarExpertTxUrl } from "../utils/stellarExpert";
import { t, type TranslationKey } from "../i18n";
import { SignTransactionSheet } from "./SignTransactionSheet";

interface RegisterModalProps {
  visible: boolean;
  resource: Resource | null;
  onClose: () => void;
  onSuccess: (message: string, txHash: string) => void;
  onError: (message: string) => void;
  /** The control that opened the modal. Focus returns here on close when provided. */
  returnFocusRef?: { current: unknown };
}

type RegistrationStep = "idle" | "preparing" | "signing" | "submitting" | "success" | "error";

/** Spoken when the flow moves to a new step. Idle is silent. */
const STEP_ANNOUNCEMENTS: Partial<Record<RegistrationStep, TranslationKey>> = {
  preparing: "modals.register.announce.preparing",
  signing: "modals.register.announce.signing",
  submitting: "modals.register.announce.submitting",
  success: "modals.register.announce.success",
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modal: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      width: "100%",
      maxWidth: 500,
      maxHeight: "80%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 5,
    },
    content: {
      padding: 20,
    },
    actions: {
      flexDirection: "row",
      gap: 12,
      marginTop: 20,
    },
    buttonSecondary: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.border,
    },
    buttonTextSecondary: {
      color: colors.text,
    },
    loadingContainer: {
      alignItems: "center",
      gap: 12,
      paddingVertical: 20,
    },
    xdrPreview: {
      fontFamily: "monospace",
      fontSize: 11,
      color: colors.textMuted,
    },
    successContainer: {
      gap: 16,
      paddingVertical: 12,
    },
    successText: {
      color: colors.success,
      fontSize: 18,
      fontWeight: "600",
    },
    txHashContainer: {
      gap: 4,
    },
    txHash: {
      fontFamily: "monospace",
      fontSize: 11,
      color: colors.textMuted,
      backgroundColor: colors.neutralBg,
      padding: 8,
      borderRadius: 4,
    },
    errorContainer: {
      gap: 12,
      paddingVertical: 12,
    },
    errorText: {
      color: colors.danger,
      fontSize: 18,
      fontWeight: "600",
    },
  });
}

export function RegisterModal({
  visible,
  resource,
  onClose,
  onSuccess,
  onError,
  returnFocusRef,
}: RegisterModalProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [step, setStep] = useState<RegistrationStep>("idle");
  const [xdr, setXdr] = useState<string>("");
  const [networkPassphrase, setNetworkPassphrase] = useState<string | undefined>();
  const [txHash, setTxHash] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const headingRef = useRef<Text>(null);
  const wasVisible = useRef(false);

  // Move focus into the modal when it opens, and back to the opener when it closes.
  useEffect(() => {
    if (visible && !wasVisible.current) {
      const tag = headingRef.current ? findNodeHandle(headingRef.current) : null;
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }
    if (!visible && wasVisible.current && returnFocusRef?.current) {
      const tag = findNodeHandle(returnFocusRef.current as Parameters<typeof findNodeHandle>[0]);
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }
    wasVisible.current = visible;
  }, [visible, returnFocusRef]);

  // Announce each step change so screen reader users hear progress, not just a spinner.
  useEffect(() => {
    if (step === "error") {
      AccessibilityInfo.announceForAccessibility(
        t("modals.register.announce.failed", { message: errorMessage })
      );
      return;
    }
    const key = STEP_ANNOUNCEMENTS[step];
    if (key) AccessibilityInfo.announceForAccessibility(t(key));
  }, [step, errorMessage]);

  async function handleRegister() {
    if (!resource) return;

    try {
      // Step 1: Prepare registration
      setStep("preparing");
      setErrorMessage("");
      const { unsignedXdr, networkPassphrase } = await prepareRegister(resource.id);
      setXdr(unsignedXdr);
      setNetworkPassphrase(networkPassphrase);
      setStep("signing");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("modals.register.failedFallback");
      setErrorMessage(message);
      setStep("error");
      onError(message);
    }
  }

  async function handleSigned(signedXdr: string) {
    if (!resource || signedXdr === xdr) {
      setErrorMessage(t("modals.register.mustBeSigned"));
      setStep("error");
      return;
    }
    try {
      setStep("submitting");
      const { txHash: hash } = await submitRegister(resource.id, signedXdr);
      setTxHash(hash);

      setStep("success");
      onSuccess(t("modals.register.successMessage"), hash);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("modals.register.failedFallback");
      setErrorMessage(message);
      setStep("error");
      onError(message);
    }
  }

  function handleOpenExplorer() {
    if (!txHash) return;
    const explorerUrl = stellarExpertTxUrl({ txHash });
    openExternalUrl(explorerUrl).catch(() => onError(t("modals.register.explorerFailed")));
  }

  function handleClose() {
    setStep("idle");
    setXdr("");
    setNetworkPassphrase(undefined);
    setTxHash("");
    setErrorMessage("");
    onClose();
  }

  function renderContent() {
    switch (step) {
      case "idle":
        return (
          <>
            <Text style={typography.body}>
              {t("modals.register.intro", { title: resource?.title ?? "" })}
            </Text>
            <View style={styles.actions}>
              <Pressable onPress={handleClose} accessibilityRole="button" style={[shared.button, styles.buttonSecondary]}>
                <Text style={[shared.buttonText, styles.buttonTextSecondary]}>{t("modals.cancel")}</Text>
              </Pressable>
              <Pressable onPress={handleRegister} accessibilityRole="button" style={shared.button}>
                <Text style={shared.buttonText}>{t("modals.register.submit")}</Text>
              </Pressable>
            </View>
          </>
        );

      case "preparing":
      case "submitting":
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={typography.body} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
              {step === "preparing" ? t("modals.register.preparing") : t("modals.register.submitting")}
            </Text>
          </View>
        );

      case "signing":
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={typography.body}>{t("modals.register.waitingForSignature")}</Text>
            <Text style={[typography.caption, styles.xdrPreview]}>{t("modals.register.xdrPreview", { preview: xdr.slice(0, 40) })}</Text>
          </View>
        );

      case "success":
        return (
          <>
            <View style={styles.successContainer}>
              <Text style={[typography.body, styles.successText]}>{t("modals.register.success")}</Text>
              <View style={styles.txHashContainer}>
                <Text style={typography.caption}>{t("modals.register.txHash")}</Text>
                <Pressable
                  onPress={handleOpenExplorer}
                  accessibilityRole="link"
                  accessibilityLabel={t("modals.register.viewTxLabel", { txHash })}
                >
                  <Text style={[typography.caption, styles.txHash]} numberOfLines={1}>
                    {txHash}
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={handleClose} accessibilityRole="button" style={[shared.button, styles.buttonSecondary]}>
                <Text style={[shared.buttonText, styles.buttonTextSecondary]}>{t("modals.close")}</Text>
              </Pressable>
              <Pressable onPress={handleOpenExplorer} accessibilityRole="button" style={shared.button}>
                <Text style={shared.buttonText}>{t("modals.viewInExplorer")}</Text>
              </Pressable>
            </View>
          </>
        );

      case "error":
        return (
          <>
            <View style={styles.errorContainer}>
              <Text style={[typography.body, styles.errorText]}>{t("modals.register.failed")}</Text>
              <Text style={typography.caption} accessibilityRole="alert">
                {errorMessage}
              </Text>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={handleClose} accessibilityRole="button" style={[shared.button, styles.buttonSecondary]}>
                <Text style={[shared.buttonText, styles.buttonTextSecondary]}>{t("modals.close")}</Text>
              </Pressable>
              <Pressable onPress={handleRegister} accessibilityRole="button" style={shared.button}>
                <Text style={shared.buttonText}>{t("modals.retry")}</Text>
              </Pressable>
            </View>
          </>
        );

      default:
        return null;
    }
  }

  if (!resource) return null;

  return (
    <>
      <Modal
        visible={visible && step !== "signing"}
        animationType="slide"
        transparent
        onRequestClose={handleClose}
      >
        <View style={styles.overlay}>
          <View style={styles.modal} accessibilityViewIsModal>
            <ScrollView style={styles.content}>
              <Text ref={headingRef} accessibilityRole="header" style={typography.heading}>
                {t("modals.register.title")}
              </Text>
              {renderContent()}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <SignTransactionSheet
        visible={visible && step === "signing"}
        unsignedXdr={xdr}
        networkPassphrase={networkPassphrase}
        action={t("modals.register.signAction")}
        onCancel={() => {
          setXdr("");
          setNetworkPassphrase(undefined);
          setStep("idle");
        }}
        onSigned={handleSigned}
      />
    </>
  );
}
