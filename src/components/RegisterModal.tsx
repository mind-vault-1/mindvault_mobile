import { useState } from "react";
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

import { prepareRegister, submitRegister } from "../api/resources";
import type { Resource } from "../types";
import { colors, shared, typography } from "../theme";

interface RegisterModalProps {
  visible: boolean;
  resource: Resource | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

type RegistrationStep = "idle" | "preparing" | "signing" | "submitting" | "success" | "error";

export function RegisterModal({
  visible,
  resource,
  onClose,
  onSuccess,
  onError,
}: RegisterModalProps) {
  const [step, setStep] = useState<RegistrationStep>("idle");
  const [xdr, setXdr] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  async function handleRegister() {
    if (!resource) return;

    try {
      // Step 1: Prepare registration
      setStep("preparing");
      setErrorMessage("");
      const { xdr: unsignedXdr, networkPassphrase } = await prepareRegister(resource.id);
      setXdr(unsignedXdr);

      // Step 2: Sign XDR
      setStep("signing");
      const signedXdr = await signXdr(unsignedXdr, networkPassphrase);

      // Step 3: Submit registration
      setStep("submitting");
      const { txHash: hash } = await submitRegister(resource.id, signedXdr);
      setTxHash(hash);

      setStep("success");
      onSuccess("Resource registered on-chain successfully!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setErrorMessage(message);
      setStep("error");
      onError(message);
    }
  }

  async function signXdr(unsignedXdr: string, networkPassphrase: string): Promise<string> {
    // TODO: Implement actual signing logic based on chosen approach:
    // Option 1: Use stellar-sdk with local keypair
    // Option 2: Use WalletConnect for external wallet signing
    // Option 3: Use device secure storage for key management
    
    // For now, this is a placeholder that simulates signing
    // In production, replace with actual signing implementation
    
    // Example with stellar-sdk (requires installation):
    // import * as StellarSdk from 'stellar-sdk';
    // const transaction = new StellarSdk.Transaction(unsignedXdr, networkPassphrase);
    // const keypair = StellarSdk.Keypair.fromSecret(userSecret);
    // transaction.sign(keypair);
    // return transaction.toXDR();
    
    throw new Error("XDR signing not yet implemented. Please implement signXdr function.");
  }

  function handleOpenExplorer() {
    if (!txHash) return;
    // Stellar testnet explorer - update for mainnet if needed
    const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
    Linking.openURL(explorerUrl).catch(() => {
      onError("Failed to open explorer");
    });
  }

  function handleClose() {
    setStep("idle");
    setXdr("");
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
                <Text style={[typography.caption, styles.txHash]} numberOfLines={1}>
                  {txHash}
                </Text>
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
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView style={styles.content}>
            <Text style={typography.heading}>Register Resource On-Chain</Text>
            {renderContent()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
