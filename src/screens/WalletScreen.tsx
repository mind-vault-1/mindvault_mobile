import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";

import { useToast } from "../components/ToastProvider";
import {
  buildAddUsdcTrustlineXdr,
  fundWithFriendbot,
  hasUsdcTrustline,
  submitSignedTransaction,
} from "../api/horizon";
import {
  getNetwork,
  getNetworkConfig,
  subscribeNetwork,
  type StellarNetworkId,
} from "../config/network";
import {
  disconnectWallet,
  getConnectedAccount,
  signXdrWithWallet,
  startConnection,
  type PendingConnection,
  type WalletConnectAccount,
} from "../services/walletconnect";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { logError } from "../utils/errorLogger";

type Status = "loading" | "idle" | "connecting" | "error";

/** Connect and disconnect a Stellar wallet (e.g. LOBSTR) through WalletConnect v2. */
export function WalletScreen() {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toast = useToast();

  const [account, setAccount] = useState<WalletConnectAccount | null>(null);
  const [pending, setPending] = useState<PendingConnection | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<StellarNetworkId>(getNetwork());
  const [funding, setFunding] = useState(false);
  const [trustlineMissing, setTrustlineMissing] = useState(false);
  const [trustlineBusy, setTrustlineBusy] = useState(false);
  const mounted = useRef(true);
  const testnetOnly = network === "testnet";

  useEffect(() => {
    mounted.current = true;
    getConnectedAccount()
      .then((restored) => {
        if (!mounted.current) return;
        setAccount(restored);
        setStatus("idle");
      })
      .catch((err) => {
        if (!mounted.current) return;
        setError(err instanceof Error ? err.message : "Unable to load wallet");
        setStatus("error");
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => subscribeNetwork(setNetwork), []);

  const refreshTrustline = useCallback(
    async (address: string) => {
      if (network !== "testnet") {
        setTrustlineMissing(false);
        return;
      }
      try {
        const configured = await hasUsdcTrustline(address, getNetworkConfig());
        if (mounted.current) setTrustlineMissing(!configured);
      } catch (error) {
        logError("Failed to check USDC trustline", error);
        if (mounted.current) setTrustlineMissing(false);
      }
    },
    [network]
  );

  useEffect(() => {
    if (account && testnetOnly) void refreshTrustline(account.address);
    else setTrustlineMissing(false);
  }, [account, testnetOnly, refreshTrustline]);

  const connect = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    try {
      const connection = await startConnection();
      if (!mounted.current) return;
      setPending(connection);
      const connected = await connection.approval();
      if (!mounted.current) return;
      setAccount(connected);
      setStatus("idle");
      toast.success("Wallet connected");
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Unable to connect wallet");
      setStatus("error");
    } finally {
      if (mounted.current) setPending(null);
    }
  }, [toast]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectWallet();
      if (!mounted.current) return;
      setAccount(null);
      toast.info("Wallet disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to disconnect wallet");
    }
  }, [toast]);

  const fund = useCallback(async () => {
    if (!account || !testnetOnly) return;
    setFunding(true);
    try {
      await fundWithFriendbot(account.address, getNetworkConfig());
      await refreshTrustline(account.address);
      toast.success("Testnet account funded");
    } catch (error) {
      logError("Friendbot funding failed", error);
      toast.error("Friendbot could not fund this account. Try again shortly.");
    } finally {
      setFunding(false);
    }
  }, [account, testnetOnly, refreshTrustline, toast]);

  const addUsdcTrustline = useCallback(async () => {
    if (!account || !testnetOnly) return;
    setTrustlineBusy(true);
    try {
      const config = getNetworkConfig();
      const unsignedXdr = await buildAddUsdcTrustlineXdr(account.address, config);
      const signedXdr = await signXdrWithWallet(unsignedXdr);
      await submitSignedTransaction(signedXdr, config);
      await refreshTrustline(account.address);
      toast.success("USDC trustline added");
    } catch (error) {
      logError("USDC trustline setup failed", error);
      toast.error("Your wallet could not add the USDC trustline.");
    } finally {
      setTrustlineBusy(false);
    }
  }, [account, testnetOnly, refreshTrustline, toast]);

  async function openWallet(uri: string) {
    try {
      await Linking.openURL(uri);
    } catch {
      toast.error("No compatible wallet app found. Scan the QR code instead.");
    }
  }

  return (
    <SafeAreaView style={shared.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {status === "loading" ? (
          <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Loading wallet" />
        ) : account ? (
          <View style={styles.card}>
            <Text style={typography.cardTitle} accessibilityRole="header">
              Connected wallet
            </Text>
            {account.walletName ? <Text style={typography.body}>{account.walletName}</Text> : null}
            <Text style={styles.label}>Account</Text>
            <Text style={styles.address} selectable accessibilityLabel={`Connected account ${account.address}`}>
              {account.address}
            </Text>
            <Text style={styles.label}>Network</Text>
            <Text style={typography.body}>{account.chainId}</Text>
            {testnetOnly ? (
              <View style={styles.testnetPanel}>
                <Text style={typography.body}>
                  Testnet tools: fund this account with Friendbot, then add the USDC trustline before paying.
                </Text>
                <Pressable
                  onPress={() => void fund()}
                  disabled={funding}
                  accessibilityRole="button"
                  accessibilityLabel="Fund with Friendbot"
                  accessibilityState={{ disabled: funding, busy: funding }}
                  style={[shared.button, shared.primaryButton, styles.action]}
                >
                  {funding ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[shared.buttonText, shared.primaryButtonText]}>Fund with Friendbot</Text>
                  )}
                </Pressable>
                {trustlineMissing ? (
                  <Pressable
                    onPress={() => void addUsdcTrustline()}
                    disabled={trustlineBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Add USDC trustline"
                    accessibilityState={{ disabled: trustlineBusy, busy: trustlineBusy }}
                    style={[shared.button, styles.action]}
                  >
                    {trustlineBusy ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={shared.buttonText}>Add USDC trustline</Text>
                    )}
                  </Pressable>
                ) : (
                  <Text style={styles.hint}>USDC trustline ready</Text>
                )}
              </View>
            ) : null}
            <Pressable
              onPress={() => void disconnect()}
              style={[shared.button, styles.action]}
              accessibilityRole="button"
              accessibilityLabel="Disconnect wallet"
            >
              <Text style={shared.buttonText}>Disconnect</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={typography.cardTitle} accessibilityRole="header">
              Connect a wallet
            </Text>
            <Text style={typography.body}>
              Sign with a Stellar wallet such as LOBSTR. Your secret key never enters MindVault.
            </Text>
            {pending ? (
              <View style={styles.pending}>
                <View style={styles.qrFrame} accessible accessibilityLabel="WalletConnect pairing QR code">
                  <QRCode value={pending.uri} size={200} backgroundColor="#ffffff" color="#000000" />
                </View>
                <Text style={typography.body}>Waiting for approval in your wallet…</Text>
                <Pressable
                  onPress={() => void openWallet(pending.uri)}
                  style={[shared.button, shared.primaryButton, styles.action]}
                  accessibilityRole="button"
                  accessibilityLabel="Open wallet app"
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>Open wallet app</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void Clipboard.setStringAsync(pending.uri);
                    toast.info("Pairing link copied");
                  }}
                  style={[shared.button, styles.action]}
                  accessibilityRole="button"
                  accessibilityLabel="Copy pairing link"
                >
                  <Text style={shared.buttonText}>Copy pairing link</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => void connect()}
                disabled={status === "connecting"}
                style={[shared.button, shared.primaryButton, styles.action]}
                accessibilityRole="button"
                accessibilityState={{ disabled: status === "connecting" }}
                accessibilityLabel="Connect wallet"
              >
                <Text style={[shared.buttonText, shared.primaryButtonText]}>
                  {status === "connecting" ? "Connecting…" : "Connect wallet"}
                </Text>
              </Pressable>
            )}
          </View>
        )}
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: { padding: spacing.lg, gap: spacing.md },
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: spacing.sm,
    },
    label: { fontSize: 13, fontWeight: "500", color: colors.textMuted },
    address: { fontFamily: "monospace", fontSize: 13, color: colors.text },
    pending: { alignItems: "center", gap: spacing.md },
    qrFrame: { padding: spacing.md, backgroundColor: "#ffffff", borderRadius: 12 },
    testnetPanel: { gap: spacing.sm, padding: spacing.sm, borderRadius: 12, backgroundColor: colors.neutralBg },
    hint: { fontSize: 12, color: colors.textMuted },
    action: { alignSelf: "stretch" },
    error: { fontSize: 14, color: colors.danger, textAlign: "center" },
  });
}
