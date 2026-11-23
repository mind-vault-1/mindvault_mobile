import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";

import { checkUsdcForPayment } from "../api/horizon";
import {
  appNetworkId,
  sorobanRpcUrl,
  prepareResourceAccess,
  priceToAtomicUnits,
  signPaymentTransaction,
  submitSignedPayment,
  type PaymentChallenge,
} from "../api/payment";
import { DEFAULT_STELLAR_NETWORK } from "../api/resources";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import type { AccessResult } from "../types";
import { SignTransactionSheet } from "./SignTransactionSheet";
import { ContentViewer } from "./ContentViewer";
import { LeaseSheet } from "./LeaseSheet";
import { getRegistryClient } from "../api/leases";
import { hapticError, hapticSuccess } from "../utils/haptics";
import { getPublicKey } from "../services/wallet";
import { DEFAULT_PER_PAYMENT_LIMIT, loadPreferences } from "../services/preferences";
import { cacheContent, getCachedContent } from "../services/contentCache";

type WalletNavigation = { navigate: (route: "Wallet") => void };

/** Navigation may be absent when the sheet is rendered in isolation (tests). */
function useOptionalNavigation(): WalletNavigation | undefined {
  try {
    return useNavigation<WalletNavigation>();
  } catch {
    return undefined;
  }
}

interface PaywallModalProps {
  visible: boolean;
  accessUrl: string;
  resourceTitle: string;
  price: string;
  resourceId: string;
  onClose: () => void;
}

type Phase = "confirm" | "preparing" | "signing" | "authorizing" | "settling" | "result" | "error";

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
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    closeBtnText: {
      fontSize: 16,
      color: colors.textMuted,
    },
    title: { flex: 1, flexShrink: 1 },
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
    secondaryAction: {
      marginTop: spacing.sm,
    },
    secondaryActionText: {
      fontSize: 14,
      color: colors.primary,
      textDecorationLine: "underline",
    },
    warning: {
      fontSize: 12,
      color: colors.warning,
      backgroundColor: colors.warningBg,
      padding: 10,
      borderRadius: 8,
    },
    warningPanel: {
      gap: 8,
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.warningBg,
    },
    limitInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      backgroundColor: colors.surface,
    },
  });
}

function paymentNetworkLabel(): string {
  try {
    return appNetworkId() === "stellar:pubnet" ? "Stellar mainnet" : "Stellar testnet";
  } catch {
    return `Stellar ${DEFAULT_STELLAR_NETWORK}`;
  }
}

function isMainnet(): boolean {
  try {
    return appNetworkId() === "stellar:pubnet";
  } catch {
    return false;
  }
}

async function hasRegistryConfigured(): Promise<boolean> {
  try {
    const client = await getRegistryClient();
    // If we can create a client, the registry is configured (testnet has a default)
    return !!client;
  } catch {
    return false;
  }
}

export function PaywallModal({
  visible,
  accessUrl,
  resourceTitle,
  price,
  resourceId,
  onClose,
}: PaywallModalProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [phase, setPhase] = useState<Phase>("confirm");
  const [result, setResult] = useState<AccessResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<PaymentChallenge | null>(null);
  const [showLeaseSheet, setShowLeaseSheet] = useState(false);
  const [registryAvailable, setRegistryAvailable] = useState<boolean | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [showWalletLink, setShowWalletLink] = useState(false);
  const [spendingLimit, setSpendingLimit] = useState(DEFAULT_PER_PAYMENT_LIMIT);
  const [showLimitConfirm, setShowLimitConfirm] = useState(false);
  const [limitConfirmText, setLimitConfirmText] = useState("");
  const [cachedContent, setCachedContent] = useState<string | null>(null);

  const flow = useRef(0);
  const busy = useRef(false);
  const highPaymentConfirmed = useRef(false);
  const checkController = useRef<AbortController | null>(null);
  const navigation = useOptionalNavigation();
  const networkLabel = paymentNetworkLabel();
  const isOverLimit = useMemo(() => {
    try {
      return priceToAtomicUnits(price) > priceToAtomicUnits(spendingLimit);
    } catch {
      return false;
    }
  }, [price, spendingLimit]);

  useEffect(() => {
    flow.current += 1;
    busy.current = false;
    setPhase("confirm");
    setResult(null);
    setErrorMsg(null);
    setChallenge(null);
    setShowLeaseSheet(false);
    setWarningMsg(null);
    setShowWalletLink(false);
    setShowLimitConfirm(false);
    setLimitConfirmText("");
    highPaymentConfirmed.current = false;
    checkController.current?.abort();
    checkController.current = null;
    return () => {
      flow.current += 1;
      checkController.current?.abort();
      checkController.current = null;
    };
  }, [visible, accessUrl, price, resourceId, resourceTitle]);

  useEffect(() => {
    let cancelled = false;
    setCachedContent(null);
    if (visible) {
      void getCachedContent(resourceId)
        .then((content) => {
          if (!cancelled) setCachedContent(content);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [visible, resourceId]);

  useEffect(() => {
    if (visible && !isMainnet()) {
      hasRegistryConfigured().then(setRegistryAvailable);
    } else {
      setRegistryAvailable(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void loadPreferences().then((preferences) => {
      if (!cancelled) setSpendingLimit(preferences.perPaymentLimit);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  function isActive(run: number) {
    return visible && flow.current === run;
  }

  function close() {
    flow.current += 1;
    busy.current = false;
    checkController.current?.abort();
    checkController.current = null;
    setChallenge(null);
    setShowLeaseSheet(false);
    setPhase("confirm");
    onClose();
  }

  function showError(err: unknown, run: number) {
    if (!isActive(run)) return;
    void hapticError();
    busy.current = false;
    setChallenge(null);
    setShowWalletLink(false);
    setErrorMsg(err instanceof Error ? err.message : "Unable to access this resource. Please try again.");
    setPhase("error");
  }

  async function showResult(access: AccessResult, run: number, shouldCache = true) {
    if (!isActive(run)) return;
    void hapticSuccess();
    setResult(access);
    if (access.type === "external") {
      await Linking.openURL(access.url);
      if (isActive(run)) close();
    } else {
      if (shouldCache) {
        setCachedContent(access.content);
        void cacheContent(resourceId, access.content).catch(() => undefined);
      }
      setPhase("result");
    }
  }

  function handleOpenCachedContent() {
    if (cachedContent === null) return;
    const run = ++flow.current;
    void showResult({ type: "text", content: cachedContent }, run, false);
  }

  function handleConfirmHighPayment() {
    if (limitConfirmText.trim().toUpperCase() !== "CONFIRM") return;
    highPaymentConfirmed.current = true;
    setShowLimitConfirm(false);
    void handlePay();
  }

  async function handlePay() {
    if (!visible || busy.current) return;
    if (isOverLimit && !highPaymentConfirmed.current) {
      setShowLimitConfirm(true);
      return;
    }
    setShowLimitConfirm(false);
    setLimitConfirmText("");
    const run = ++flow.current;
    busy.current = true;
    setErrorMsg(null);
    setWarningMsg(null);
    setShowWalletLink(false);
    setResult(null);
    setPhase("preparing");

    const controller = new AbortController();
    checkController.current = controller;
    try {
      // Only reached after the user presses Pay, so cancelling the sheet never
      // triggers a Horizon call. The signal stops an in-flight check on close.
      const publicKey = await getPublicKey().catch(() => null);
      const check = await checkUsdcForPayment(price, {
        publicKey,
        signal: controller.signal,
      });
      if (!isActive(run)) return;
      if (check.status === "missing-trustline" || check.status === "insufficient-balance") {
        setErrorMsg(check.message);
        setShowWalletLink(true);
        setPhase("error");
        return;
      }
      if (check.status === "unavailable") setWarningMsg(check.warning);

      const access = await prepareResourceAccess(accessUrl, price);
      if (!isActive(run)) return;
      if (access.type === "payment") {
        setChallenge(access.challenge);
        setPhase("signing");
      } else {
        await showResult(access.result, run);
      }
    } catch (err) {
      showError(err, run);
    } finally {
      if (checkController.current === controller) checkController.current = null;
      if (isActive(run)) busy.current = false;
    }
  }

  async function handleSigned(transaction: string, run: number, payment: PaymentChallenge) {
    if (!isActive(run) || busy.current) return;
    busy.current = true;
    setChallenge(null);
    setPhase("settling");
    try {
      const access = await submitSignedPayment(accessUrl, payment, transaction);
      await showResult(access, run);
    } catch (err) {
      showError(err, run);
    } finally {
      if (isActive(run)) busy.current = false;
    }
  }

  function handleOpenLeaseSheet() {
    setShowLeaseSheet(true);
  }

  function handleLeasePurchased() {
    setShowLeaseSheet(false);
    close();
  }

  const signingRun = flow.current;

  const showRentOption = registryAvailable === true && !isMainnet();

  return (
    <>
      <Modal
        visible={visible && phase !== "signing" && !showLeaseSheet}
        animationType="slide"
        transparent
        onRequestClose={close}
        accessibilityViewIsModal
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={[typography.cardTitle, styles.title]} numberOfLines={2}>
                {resourceTitle}
              </Text>
              <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close payment" style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {phase === "confirm" && (
              <View style={styles.body}>
                {cachedContent !== null ? (
                  <Text style={typography.body}>
                    This resource is unlocked on this device and can be opened without another payment.
                  </Text>
                ) : (
                  <>
                    <Text style={typography.body}>
                      This resource requires a payment of{" "}
                      <Text style={{ fontWeight: "700", color: colors.primary }}>
                        {price} USDC
                      </Text>{" "}
                      on {networkLabel} to access.
                    </Text>
                    <Text style={styles.hint}>
                      You'll sign the payment with your Stellar key; the server pays the network fee.
                    </Text>
                    <Text style={styles.hint} accessibilityLabel={`Spending limit ${spendingLimit} USDC per payment`}>
                      Spending limit: {spendingLimit} USDC per payment.
                    </Text>
                  </>
                )}
                {cachedContent === null && isOverLimit ? (
                  <Text accessibilityRole="alert" style={styles.warning}>
                    This payment is above your spending limit and needs extra confirmation.
                  </Text>
                ) : null}
                {warningMsg ? (
                  <Text accessibilityRole="alert" style={styles.warning}>{warningMsg}</Text>
                ) : null}
                {cachedContent === null && showLimitConfirm ? (
                  <View style={styles.warningPanel}>
                    <Text accessibilityRole="alert" style={styles.warning}>
                      Type CONFIRM to allow this payment above your {spendingLimit} USDC limit.
                    </Text>
                    <TextInput
                      value={limitConfirmText}
                      onChangeText={setLimitConfirmText}
                      placeholder="CONFIRM"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      accessibilityLabel="Confirm high payment"
                      style={styles.limitInput}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Confirm high payment button"
                      disabled={limitConfirmText.trim().toUpperCase() !== "CONFIRM"}
                      onPress={handleConfirmHighPayment}
                      style={[shared.button, shared.primaryButton, styles.actionBtn]}
                    >
                      <Text style={[shared.buttonText, shared.primaryButtonText]}>
                        Confirm payment
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={cachedContent !== null ? handleOpenCachedContent : () => void handlePay()}
                  style={[shared.button, shared.primaryButton, styles.actionBtn]}
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>
                    {cachedContent !== null ? "Open" : "Pay & Access"}
                  </Text>
                </Pressable>

                {cachedContent === null && showRentOption && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleOpenLeaseSheet}
                    style={styles.secondaryAction}
                  >
                    <Text style={styles.secondaryActionText}>Rent instead</Text>
                  </Pressable>
                )}
              </View>
            )}

            {(["preparing", "authorizing", "settling"] as Phase[]).includes(phase) && (
              <View style={[styles.body, styles.centered]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={typography.body} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
                  {phase === "preparing" ? "Getting payment challenge…" : phase === "authorizing" ? "Signing payment…" : "Settling payment…"}
                </Text>
                {warningMsg ? (
                  <Text accessibilityRole="alert" style={styles.warning}>{warningMsg}</Text>
                ) : null}
              </View>
            )}

            {phase === "result" && result?.type === "text" && (
              <ContentViewer content={result.content} />
            )}

            {phase === "error" && (
              <View style={styles.body}>
                <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>{errorMsg}</Text>
                {showWalletLink ? (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Open Wallet"
                    onPress={() => navigation?.navigate("Wallet")}
                    style={styles.secondaryAction}
                  >
                    <Text style={styles.secondaryActionText}>Open Wallet</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (result?.type === "external") {
                      const run = flow.current;
                      setPhase("settling");
                      void showResult(result, run).catch((err: unknown) => showError(err, run));
                    } else {
                      void handlePay();
                    }
                  }}
                  style={[shared.button, shared.primaryButton, styles.actionBtn]}
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>Retry</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {visible && phase === "signing" && challenge ? (
        <SignTransactionSheet
          visible
          unsignedXdr=""
          action="pay for this resource"
          sign={async (secret) => {
            if (!isActive(signingRun)) throw new Error("Payment cancelled.");
            setPhase("authorizing");
            try {
              const transaction = await signPaymentTransaction(
                challenge, secret, sorobanRpcUrl(Constants.expoConfig?.extra?.sorobanRpcUrl)
              );
              if (!isActive(signingRun)) throw new Error("Payment cancelled.");
              return transaction;
            } catch (err) {
              showError(err, signingRun);
              throw err;
            }
          }}
          onCancel={close}
          onSigned={(transaction) => handleSigned(transaction, signingRun, challenge)}
        />
      ) : null}

      {showLeaseSheet && (
        <LeaseSheet
          visible={true}
          resource={{
            id: resourceId,
            title: resourceTitle,
            price,
            resourceType: "file",
            walletAddress: "",
            verificationStatus: "verified",
            onchainStatus: "none",
            listed: true,
            accessUrl,
          } as any}
          price={price}
          onClose={() => setShowLeaseSheet(false)}
          onLeasePurchased={handleLeasePurchased}
        />
      )}
    </>
  );
}
