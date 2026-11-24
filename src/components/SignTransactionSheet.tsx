import { useEffect, useMemo, useRef, useState } from "react";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import * as ScreenCapture from "expo-screen-capture";
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { DEFAULT_NETWORK_PASSPHRASE, signTransactionXdr } from "../api/resources";
import { authenticate, isAvailable } from "../services/biometrics";
import { getPublicKey, signWithBiometrics } from "../services/wallet";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { buildSep7TransactionUri, parseSep7Callback } from "../utils/sep7";
import { validateStellarSecret } from "../utils/validateStellarSecret";
import { t } from "../i18n";

const SCREEN_CAPTURE_KEY = "mindvault-sign-transaction-sheet";

interface SignTransactionSheetProps {
  visible: boolean;
  unsignedXdr: string;
  networkPassphrase?: string;
  onSigned: (signedXdr: string) => void | Promise<void>;
  onCancel: () => void;
  /**
   * Custom signer for payloads that aren't a plain envelope signature (e.g. an
   * x402 payment that signs a Soroban auth entry). It gets the secret for this
   * one call only. Defaults to signing `unsignedXdr`.
   */
  sign?: (secret: string) => Promise<string>;
  /** Names the action in the biometric prompt, e.g. "lease this resource". */
  action?: string;
  /** The control that opened the sheet. Focus returns here on close when provided. */
  returnFocusRef?: { current: unknown };
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    sheet: {
      gap: 12,
      padding: 20,
      paddingBottom: 32,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      backgroundColor: colors.surface,
    },
    label: { color: colors.text, fontSize: 13, fontWeight: "600" },
    network: { color: colors.textMuted, fontSize: 12 },
    notice: { color: colors.textMuted, fontSize: 12 },
    warning: { color: colors.warning, backgroundColor: colors.warningBg, padding: 10, borderRadius: 8 },
    walletPanel: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.neutralBg },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
    },
    invalid: { borderColor: colors.danger },
    error: { color: colors.danger, fontSize: 12 },
    actions: { flexDirection: "row", gap: 8 },
    button: { flex: 1 },
    secondary: { backgroundColor: colors.neutralBg },
    secondaryText: { color: colors.text, textAlign: "center", fontWeight: "600" },
    disabled: { opacity: 0.5 },
  });
}

export function SignTransactionSheet({
  visible,
  unsignedXdr,
  networkPassphrase = DEFAULT_NETWORK_PASSPHRASE,
  onSigned,
  onCancel,
  sign: customSign,
  action: actionProp,
  returnFocusRef,
}: SignTransactionSheetProps) {
  const action = actionProp ?? t("modals.sign.defaultAction");
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [secret, setSecret] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [biometricsUnavailable, setBiometricsUnavailable] = useState(false);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);
  const [localPublicKey, setLocalPublicKey] = useState<string | null>(null);
  const headingRef = useRef<Text>(null);
  const wasVisible = useRef(false);
  const validation = useMemo(() => validateStellarSecret(secret), [secret]);

  // Move focus into the sheet when it opens, and back to the opener when it closes.
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

  // Say when signing starts, since the spinner on the Sign button is easy to miss.
  useEffect(() => {
    if (busy) AccessibilityInfo.announceForAccessibility(t("modals.sign.announce.signing"));
  }, [busy]);
  const isNonProduction = /test|future network/i.test(networkPassphrase);
  const canUseSep7 = !customSign && Boolean(unsignedXdr.trim());
  const transactionInfo = useMemo(() => {
    if (!unsignedXdr.trim()) return { source: null, fee: null } as const;
    try {
      const transaction = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase);
      const fee = (Number(transaction.fee) / 10000000).toFixed(7);
      const source = "source" in transaction ? transaction.source : transaction.feeSource;
      return { source, fee } as const;
    } catch {
      return { source: null, fee: null } as const;
    }
  }, [unsignedXdr, networkPassphrase]);
  const canUseLocalWallet =
    !customSign && Boolean(unsignedXdr.trim()) && Boolean(localPublicKey) && !biometricsUnavailable;

  useEffect(() => {
    if (!visible) {
      setSecret("");
      setTouched(false);
      setBusy(false);
      setSignError(null);
      setBiometricsUnavailable(false);
      setWalletStatus(null);
      return;
    }
    let cancelled = false;
    void isAvailable().then((available) => {
      if (!cancelled) setBiometricsUnavailable(!available);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setLocalPublicKey(null);
      return;
    }
    let cancelled = false;
    void getPublicKey()
      .then((publicKey) => {
        if (!cancelled) setLocalPublicKey(publicKey);
      })
      .catch(() => {
        if (!cancelled) setLocalPublicKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    void ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY).catch(() => undefined);
    return () => {
      void ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY).catch(() => undefined);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !canUseSep7) return;
    let cancelled = false;

    const handleCallback = (url: string) => {
      const result = parseSep7Callback(url);
      if (!result || cancelled) return;
      if (result.status === "signed" && result.signedXdr) {
        setWalletStatus(t("modals.sign.walletSigned"));
        void onSigned(result.signedXdr);
      } else if (result.status === "rejected") {
        setWalletStatus(t("modals.sign.walletDeclined"));
      } else {
        setWalletStatus(t("modals.sign.walletIncomplete"));
      }
    };

    const subscription = Linking.addEventListener("url", ({ url }) => handleCallback(url));
    void Linking.getInitialURL()
      .then((url) => {
        if (url) handleCallback(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [visible, canUseSep7, onSigned]);

  function cancel() {
    setSecret("");
    setTouched(false);
    onCancel();
  }

  async function openSep7Wallet() {
    if (!canUseSep7) return;
    setWalletStatus(t("modals.sign.walletOpening"));
    try {
      await Linking.openURL(buildSep7TransactionUri(unsignedXdr, { message: `MindVault ${action}` }));
    } catch {
      setWalletStatus(t("modals.sign.walletUnavailable"));
    }
  }

  async function sign() {
    setTouched(true);
    if (!validation.isValid || (!customSign && !unsignedXdr)) return;

    setBusy(true);
    setSignError(null);
    // Re-authenticate the device owner before signing. Devices without
    // biometrics fall back to the secret-entry flow below.
    const outcome = await authenticate(t("modals.sign.authPrompt", { action }));
    if (outcome === "cancelled" || outcome === "failed") {
      setSignError(
        outcome === "cancelled"
          ? t("modals.sign.biometricsCancelled")
          : t("modals.sign.biometricsFailed")
      );
      setBusy(false);
      return;
    }
    let signedXdr: string;
    try {
      signedXdr = customSign
        ? await customSign(secret)
        : signTransactionXdr(unsignedXdr, secret, networkPassphrase);
    } catch (err) {
      // e.g. a malformed transaction, a passphrase that doesn't match it, or a
      // failed payment simulation (whose message is safe and actionable).
      setSignError(
        customSign && err instanceof Error && err.message
          ? err.message
          : t("modals.sign.failed")
      );
      setSecret("");
      setBusy(false);
      return;
    }
    try {
      setSecret("");
      await onSigned(signedXdr);
    } finally {
      setSecret("");
      setBusy(false);
    }
  }

  async function signWithLocalWallet() {
    if (!canUseLocalWallet) return;
    setBusy(true);
    setSignError(null);
    try {
      const signedXdr = await signWithBiometrics(unsignedXdr, networkPassphrase);
      await onSigned(signedXdr);
    } catch (err) {
      setSignError(
        err instanceof Error ? err.message : t("modals.sign.localWalletFailed")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={cancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text ref={headingRef} accessibilityRole="header" style={typography.heading}>
            {t("modals.sign.title")}
          </Text>
          <Text style={styles.network}>{t("modals.sign.networkPassphrase", { passphrase: networkPassphrase })}</Text>
          {isNonProduction ? (
            <Text style={styles.warning}>{t("modals.sign.testNetworkWarning")}</Text>
          ) : null}
          {canUseLocalWallet ? (
            <View style={styles.walletPanel} accessibilityLabel={t("modals.sign.localWalletLabel")}>
              <Text style={styles.label}>{t("modals.sign.withDeviceWallet")}</Text>
              <Text style={styles.notice}>
                {t("modals.sign.sourceAccount", { account: transactionInfo.source ?? localPublicKey ?? "" })}
              </Text>
              <Text style={styles.notice}>
                {t("modals.sign.fee", {
                  fee: transactionInfo.fee
                    ? t("modals.sign.feeXlm", { fee: transactionInfo.fee })
                    : t("modals.sign.feeUnavailable"),
                })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("modals.sign.withDeviceWallet")}
                onPress={() => void signWithLocalWallet()}
                disabled={busy}
                style={[shared.button, styles.button, styles.secondary]}
              >
                <Text style={styles.secondaryText}>{t("modals.sign.withDeviceWallet")}</Text>
              </Pressable>
            </View>
          ) : null}
          {canUseSep7 ? (
            <View style={styles.walletPanel}>
              <Text style={styles.notice}>
                {t("modals.sign.sep7Intro")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("modals.sign.openWalletAppLabel")}
                onPress={() => void openSep7Wallet()}
                disabled={busy}
                style={[shared.button, styles.button, styles.secondary]}
              >
                <Text style={styles.secondaryText}>{t("modals.sign.withWalletApp")}</Text>
              </Pressable>
              {walletStatus ? (
                <Text accessibilityLiveRegion="polite" style={styles.notice}>{walletStatus}</Text>
              ) : null}
            </View>
          ) : null}
          {biometricsUnavailable ? (
            <Text style={styles.notice}>
              {t("modals.sign.biometricsUnavailable")}
            </Text>
          ) : null}
          <Text style={styles.label}>{t("modals.sign.secretKey")}</Text>
          <TextInput
            value={secret}
            onChangeText={setSecret}
            onBlur={() => setTouched(true)}
            secureTextEntry
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            placeholder="S…"
            placeholderTextColor={colors.textSubtle}
            accessibilityLabel={t("modals.sign.secretKey")}
            style={[styles.input, touched && !validation.isValid ? styles.invalid : null]}
          />
          {touched && !validation.isValid ? (
            <Text accessibilityRole="alert" style={styles.error}>{validation.errorMessage}</Text>
          ) : null}
          {signError ? (
            <Text accessibilityRole="alert" style={styles.error}>{signError}</Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={cancel}
              disabled={busy}
              style={[shared.button, styles.button, styles.secondary]}
            >
              <Text style={styles.secondaryText}>{t("modals.cancel")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void sign()}
              disabled={busy || !validation.isValid}
              style={[shared.button, styles.button, (busy || !validation.isValid) && styles.disabled]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={shared.buttonText}>{t("modals.sign.submit")}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
