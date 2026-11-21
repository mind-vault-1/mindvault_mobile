import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";

import { useToast } from "../components/ToastProvider";
import {
  disconnectWallet,
  getConnectedAccount,
  startConnection,
  type PendingConnection,
  type WalletConnectAccount,
} from "../services/walletconnect";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

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
  const mounted = useRef(true);

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
    action: { alignSelf: "stretch" },
    error: { fontSize: 14, color: colors.danger, textAlign: "center" },
  });
}
