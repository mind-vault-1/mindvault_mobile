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
const STEP_ANNOUNCEMENTS: Partial<Record<RegistrationStep, string>> = {
  preparing: "Preparing transaction.",
  signing: "Waiting for your signature.",
  submitting: "Submitting to the blockchain.",
  success: "Registration successful.",
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
      AccessibilityInfo.announceForAccessibility(`Registration failed. ${errorMessage}`);
      return;
    }
    const message = STEP_ANNOUNCEMENTS[step];
    if (message) AccessibilityInfo.announceForAccessibility(message);
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
      const message = err instanceof Error ? err.message : "Registration failed";
      setErrorMessage(message);
      setStep("error");
      onError(message);
    }
  }

  async function handleSigned(signedXdr: string) {
    if (!resource || signedXdr === xdr) {
      setErrorMessage("The transaction must be signed before submission.");
      setStep("error");
      return;
    }
    try {
      setStep("submitting");
      const { txHash: hash } = await submitRegister(resource.id, signedXdr);
      setTxHash(hash);

      setStep("success");
      onSuccess("Resource registered on-chain successfully!", hash);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setErrorMessage(message);
      setStep("error");
      onError(message);
    }
  }

  function handleOpenExplorer() {
    if (!txHash) return;
    const explorerUrl = stellarExpertTxUrl({ txHash });
    openExternalUrl(explorerUrl).catch(() => onError("Failed to open explorer"));
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
              Register "{resource?.title}" on the Stellar blockchain to enable on-chain
              verification and tracking.
            </Text>
            <View style={styles.actions}>
              <Pressable onPress={handleClose} style={[shared.button, styles.buttonSecondary]}>
                <Text style={[shared.buttonText, styles.buttonTextSecondary]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleRegister} style={shared.button}>
                <Text style={shared.buttonText}>Register</Text>
              </Pressable>
            </View>
          </>
        );

      case "preparing":
      case "submitting":
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={typography.body}>
              {step === "preparing" ? "Preparing transaction..." : "Submitting to blockchain..."}
            </Text>
          </View>
        );

      case "signing":
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={typography.body}>Waiting for signature...</Text>
            <Text style={[typography.caption, styles.xdrPreview]}>XDR: {xdr.slice(0, 40)}...</Text>
          </View>
        );

      case "success":
        return (
          <>
            <View style={styles.successContainer}>
              <Text style={[typography.body, styles.successText]}>✓ Registration successful!</Text>
              <View style={styles.txHashContainer}>
                <Text style={typography.caption}>Transaction Hash:</Text>
                <Pressable onPress={handleOpenExplorer}>
                  <Text style={[typography.caption, styles.txHash]} numberOfLines={1}>
                    {txHash}
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={handleClose} style={[shared.button, styles.buttonSecondary]}>
                <Text style={[shared.buttonText, styles.buttonTextSecondary]}>Close</Text>
              </Pressable>
              <Pressable onPress={handleOpenExplorer} style={shared.button}>
                <Text style={shared.buttonText}>View in Explorer</Text>
              </Pressable>
            </View>
          </>
        );

      case "error":
        return (
          <>
            <View style={styles.errorContainer}>
              <Text style={[typography.body, styles.errorText]}>✗ Registration failed</Text>
              <Text style={typography.caption}>{errorMessage}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={handleClose} style={[shared.button, styles.buttonSecondary]}>
                <Text style={[shared.buttonText, styles.buttonTextSecondary]}>Close</Text>
              </Pressable>
              <Pressable onPress={handleRegister} style={shared.button}>
                <Text style={shared.buttonText}>Retry</Text>
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
                Register Resource On-Chain
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
        action="register this publisher"
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
