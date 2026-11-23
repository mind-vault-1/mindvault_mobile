import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";

import { fetchWalletBalances, type WalletBalances } from "../api/horizon";
import { generateWallet, getPublicKey } from "../services/wallet";
import { useAppTheme } from "../theme/ThemeProvider";
import { spacing, type ThemeColors } from "../theme";
import { hapticImpact } from "../utils/haptics";
import type { RootStackParamList } from "../navigation";

type LoadState =
  | { status: "loading" }
  | { status: "no-wallet" }
  | { status: "loaded"; address: string; balances: WalletBalances | null; balanceError: string | null }
  | { status: "error"; message: string };

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.lg,
    },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xl,
      gap: spacing.md,
    },
    header: {
      gap: spacing.xs,
      paddingBottom: spacing.sm,
    },
    title: {
      fontSize: 32,
      fontWeight: "700",
      color: colors.text,
    },
    subtitle: {
      fontSize: 15,
      color: colors.textMuted,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.md,
    },
    cardLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSubtle,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    addressText: {
      fontFamily: "monospace",
      fontSize: 13,
      color: colors.text,
      lineHeight: 20,
    },
    qrContainer: {
      alignItems: "center",
      paddingVertical: spacing.md,
    },
    balanceRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: spacing.sm,
    },
    balanceDivider: {
      height: 1,
      backgroundColor: colors.border,
    },
    balanceLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
    },
    balanceValue: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.primary,
    },
    balanceNull: {
      fontSize: 13,
      color: colors.textSubtle,
      fontStyle: "italic",
    },
    buttonRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    button: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    secondaryButton: {
      backgroundColor: colors.neutralBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    primaryButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#ffffff",
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    errorText: {
      fontSize: 14,
      color: colors.danger,
      textAlign: "center",
    },
    warningCard: {
      backgroundColor: colors.warningBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.warning,
      padding: spacing.md,
      gap: spacing.xs,
    },
    warningText: {
      fontSize: 13,
      color: colors.warning,
    },
    noWalletCard: {
      backgroundColor: colors.neutralBg,
      borderRadius: 16,
      padding: spacing.xl,
      alignItems: "center",
      gap: spacing.lg,
    },
    noWalletIcon: {
      fontSize: 48,
    },
    noWalletTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    noWalletBody: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 22,
    },
    disabledButton: {
      opacity: 0.5,
    },
  });
}

export function WalletScreen() {
  const { colors, shared } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const address = await getPublicKey();
      if (!address) {
        setState({ status: "no-wallet" });
        return;
      }

      let balances: WalletBalances | null = null;
      let balanceError: string | null = null;
      try {
        balances = await fetchWalletBalances(address);
      } catch (err) {
        balanceError = err instanceof Error ? err.message : "Unable to load balances.";
      }

      setState({ status: "loaded", address, balances, balanceError });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Unable to load wallet.",
      });
    }
  }, []);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadWallet();
    } finally {
      setRefreshing(false);
    }
  }, [loadWallet]);

  const handleCopyAddress = useCallback(async (address: string) => {
    try {
      await Clipboard.setStringAsync(address);
      void hapticImpact();
      Alert.alert("Copied", "Wallet address copied to clipboard.");
    } catch {
      Alert.alert("Error", "Unable to copy address.");
    }
  }, []);

  const handleCreateWallet = useCallback(async () => {
    try {
      await generateWallet();
      await loadWallet();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Unable to create wallet.");
    }
  }, [loadWallet]);

  if (state.status === "loading") {
    return (
      <SafeAreaView style={shared.screen} edges={["left", "right", "bottom"]}>
        <View style={styles.centered}>
          <ActivityIndicator
            color={colors.primary}
            size="large"
            accessibilityLabel="Loading wallet"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === "error") {
    return (
      <SafeAreaView style={shared.screen} edges={["left", "right", "bottom"]}>
        <View style={styles.centered}>
          <Text style={styles.errorText} accessibilityRole="alert">
            {state.message}
          </Text>
          <Pressable
            onPress={() => void loadWallet()}
            style={[styles.button, styles.primaryButton, { width: "auto", paddingHorizontal: spacing.xl }]}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === "no-wallet") {
    return (
      <SafeAreaView style={shared.screen} edges={["left", "right", "bottom"]}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Wallet</Text>
            <Text style={styles.subtitle}>Manage your Stellar wallet</Text>
          </View>
          <View style={styles.noWalletCard}>
            <Text style={styles.noWalletIcon}>💳</Text>
            <Text style={styles.noWalletTitle}>No wallet configured</Text>
            <Text style={styles.noWalletBody}>
              Create a new wallet or import an existing one to view your address
              and balances.
            </Text>
            <View style={[styles.buttonRow, { width: "100%" }]}>
              <Pressable
                onPress={() => void handleCreateWallet()}
                style={[styles.button, styles.primaryButton]}
                accessibilityRole="button"
                accessibilityLabel="Create wallet"
              >
                <Text style={styles.primaryButtonText}>Create Wallet</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate("ImportWallet")}
                style={[styles.button, styles.secondaryButton]}
                accessibilityRole="button"
                accessibilityLabel="Import wallet"
              >
                <Text style={styles.secondaryButtonText}>Import Wallet</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // state.status === "loaded"
  const { address, balances, balanceError } = state;
  const isUnfunded = balances !== null && balances.xlm === "0" && balances.usdc === null;

  return (
    <SafeAreaView style={shared.screen} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Wallet</Text>
          <Text style={styles.subtitle}>Your Stellar wallet</Text>
        </View>

        {/* Address + QR card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Wallet Address</Text>
          <View style={styles.qrContainer}>
            <QRCode
              value={address}
              size={200}
              backgroundColor={colors.surface}
              color={colors.text}
            />
          </View>
          <Text
            style={styles.addressText}
            selectable
            accessibilityLabel={`Wallet address: ${address}`}
          >
            {address}
          </Text>
          <Pressable
            onPress={() => void handleCopyAddress(address)}
            style={[styles.button, styles.secondaryButton]}
            accessibilityRole="button"
            accessibilityLabel="Copy address"
            accessibilityHint="Copies your Stellar wallet address to the clipboard"
          >
            <Text style={styles.secondaryButtonText}>Copy Address</Text>
          </Pressable>
        </View>

        {/* Balances card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Balances</Text>

          {balanceError ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              {balanceError}
            </Text>
          ) : null}

          {isUnfunded ? (
            <View style={styles.warningCard}>
              <Text style={[styles.warningText, { fontWeight: "600" }]}>
                Account not funded
              </Text>
              <Text style={styles.warningText}>
                This account has not been activated on the Stellar network yet.
                Fund it with XLM to get started.
              </Text>
            </View>
          ) : null}

          {balances !== null ? (
            <>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>XLM</Text>
                <Text
                  style={styles.balanceValue}
                  accessibilityLabel={`XLM balance: ${balances.xlm}`}
                >
                  {balances.xlm}
                </Text>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>USDC</Text>
                {balances.usdc !== null ? (
                  <Text
                    style={styles.balanceValue}
                    accessibilityLabel={`USDC balance: ${balances.usdc}`}
                  >
                    {balances.usdc}
                  </Text>
                ) : (
                  <Text
                    style={styles.balanceNull}
                    accessibilityLabel="USDC: no trustline"
                  >
                    No trustline
                  </Text>
                )}
              </View>
            </>
          ) : null}

          <Pressable
            onPress={() => void handleRefresh()}
            disabled={refreshing}
            style={[
              styles.button,
              styles.secondaryButton,
              refreshing ? styles.disabledButton : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Refresh balances"
            accessibilityState={{ disabled: refreshing, busy: refreshing }}
          >
            {refreshing ? (
              <ActivityIndicator
                color={colors.primary}
                accessibilityLabel="Refreshing balances"
              />
            ) : (
              <Text style={styles.secondaryButtonText}>Refresh Balances</Text>
            )}
          </Pressable>
        </View>

        {/* Wallet management */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Wallet Management</Text>
          <View style={styles.buttonRow}>
            <Pressable
              onPress={() => void handleCreateWallet()}
              style={[styles.button, styles.secondaryButton]}
              accessibilityRole="button"
              accessibilityLabel="Create wallet"
            >
              <Text style={styles.secondaryButtonText}>Create Wallet</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("ImportWallet")}
              style={[styles.button, styles.secondaryButton]}
              accessibilityRole="button"
              accessibilityLabel="Import wallet"
            >
              <Text style={styles.secondaryButtonText}>Import Wallet</Text>
            </Pressable>
          </View>
        </View>
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";

import { useToast } from "../components/ToastProvider";
import {
  buildAddUsdcTrustlineXdr,
  fetchWalletBalances,
  fundWithFriendbot,
  hasUsdcTrustline,
  submitSignedTransaction,
  type WalletBalances,
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
import {
  generateWallet,
  getPublicKey,
  importWallet,
  wipe as wipeWalletSecrets,
} from "../services/wallet";
import { clearApiKey } from "../services/secureStorage";
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
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState("");
  const [wiping, setWiping] = useState(false);
  const [localAddress, setLocalAddress] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const mounted = useRef(true);
  const testnetOnly = network === "testnet";
  const receiveAddress = account?.address ?? localAddress;

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

  useEffect(() => {
    getPublicKey()
      .then((key) => {
        if (mounted.current) setLocalAddress(key);
      })
      .catch(() => {
        if (mounted.current) setLocalAddress(null);
      });
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

  const refreshBalances = useCallback(async () => {
    if (!receiveAddress) return;
    setBalancesLoading(true);
    setBalanceError(null);
    try {
      const data = await fetchWalletBalances(receiveAddress);
      if (mounted.current) setBalances(data);
    } catch (err) {
      if (mounted.current) {
        setBalanceError(err instanceof Error ? err.message : "Unable to load balances.");
      }
    } finally {
      if (mounted.current) setBalancesLoading(false);
    }
  }, [receiveAddress]);

  useEffect(() => {
    if (status === "loading" || !receiveAddress) {
      setBalances(null);
      setBalanceError(null);
      return;
    }
    void refreshBalances();
  }, [receiveAddress, status, refreshBalances]);

  const copyAddress = useCallback(async () => {
    if (!receiveAddress) return;
    await Clipboard.setStringAsync(receiveAddress);
    toast.info("Wallet address copied");
  }, [receiveAddress, toast]);

  const createLocalWallet = useCallback(async () => {
    try {
      const address = await generateWallet();
      if (!mounted.current) return;
      setLocalAddress(address);
      toast.success("Wallet created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to create wallet.");
    }
  }, [toast]);

  const importLocalWallet = useCallback(async () => {
    try {
      const address = await importWallet(secret.trim());
      if (!mounted.current) return;
      setLocalAddress(address);
      setSecret("");
      setImportOpen(false);
      toast.success("Wallet imported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to import wallet.");
    }
  }, [secret, toast]);

  const wipeEverything = useCallback(async () => {
    setWiping(true);
    try {
      // Best-effort: every store is cleared even if one deletion fails.
      await Promise.all([
        wipeWalletSecrets().catch(() => undefined),
        clearApiKey().catch(() => undefined),
        disconnectWallet().catch(() => undefined),
      ]);
      if (!mounted.current) return;
      setAccount(null);
      setPending(null);
      setLocalAddress(null);
      setBalances(null);
      setImportOpen(false);
      setSecret("");
      setWipeOpen(false);
      setWipeText("");
      toast.success("Wallet wiped and signed out");
    } finally {
      if (mounted.current) setWiping(false);
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
        {status !== "loading" ? (
          <View style={styles.card}>
            <Text style={typography.cardTitle} accessibilityRole="header">
              Receive
            </Text>
            {receiveAddress ? (
              <>
                <Text style={styles.label}>Your address</Text>
                <Text
                  style={styles.address}
                  selectable
                  accessibilityLabel={`Wallet address ${receiveAddress}`}
                >
                  {receiveAddress}
                </Text>
                <View style={styles.qrFrame} accessible accessibilityLabel="Wallet address QR code">
                  <QRCode value={receiveAddress} size={200} backgroundColor="#ffffff" color="#000000" />
                </View>
                <Pressable
                  onPress={() => void copyAddress()}
                  style={[shared.button, styles.action]}
                  accessibilityRole="button"
                  accessibilityLabel="Copy wallet address"
                >
                  <Text style={shared.buttonText}>Copy address</Text>
                </Pressable>
                <Pressable
                  onPress={() => void refreshBalances()}
                  disabled={balancesLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh balances"
                  accessibilityState={{ disabled: balancesLoading, busy: balancesLoading }}
                  style={[shared.button, styles.action]}
                >
                  {balancesLoading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={shared.buttonText}>Refresh balances</Text>
                  )}
                </Pressable>
                {balances ? (
                  <View style={styles.balances}>
                    <Text style={typography.body}>XLM: {balances.xlm}</Text>
                    <Text style={typography.body}>USDC: {balances.usdc ?? "0"}</Text>
                    {balances.xlm === "0" ? (
                      <Text style={styles.hint}>This account is not funded yet.</Text>
                    ) : null}
                    {balances.usdc === null ? (
                      <Text style={styles.hint}>No USDC trustline on this account.</Text>
                    ) : null}
                  </View>
                ) : null}
                {balanceError ? (
                  <Text style={styles.error} accessibilityRole="alert">
                    {balanceError}
                  </Text>
                ) : null}
              </>
            ) : importOpen ? (
              <View style={styles.wipeForm}>
                <Text style={typography.body}>Paste your Stellar secret key to import a wallet.</Text>
                <TextInput
                  value={secret}
                  onChangeText={setSecret}
                  placeholder="Stellar secret key"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!balancesLoading}
                  accessibilityLabel="Wallet secret key"
                  style={styles.input}
                />
                <Pressable
                  onPress={() => void importLocalWallet()}
                  disabled={!secret.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Import wallet"
                  accessibilityState={{ disabled: !secret.trim() }}
                  style={[shared.button, shared.primaryButton, styles.action]}
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>Import wallet</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setImportOpen(false);
                    setSecret("");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel import"
                  style={styles.action}
                >
                  <Text style={[shared.buttonText, { color: colors.textMuted }]}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.wipeForm}>
                <Text style={typography.body}>
                  Create a local wallet or import one with a secret key to receive funds.
                </Text>
                <Pressable
                  onPress={() => void createLocalWallet()}
                  accessibilityRole="button"
                  accessibilityLabel="Create wallet"
                  style={[shared.button, shared.primaryButton, styles.action]}
                >
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>Create wallet</Text>
                </Pressable>
                <Pressable
                  onPress={() => setImportOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Import wallet"
                  style={[shared.button, styles.action]}
                >
                  <Text style={shared.buttonText}>Import wallet</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}
        {status !== "loading" ? (
          <View style={styles.card}>
            <Text style={typography.cardTitle} accessibilityRole="header">
              Wipe wallet
            </Text>
            <Text style={typography.body}>
              Permanently removes the secret key, API key and WalletConnect sessions stored on this device.
            </Text>
            {wipeOpen ? (
              <View style={styles.wipeForm}>
                <TextInput
                  value={wipeText}
                  onChangeText={setWipeText}
                  placeholder='Type "WIPE" to confirm'
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!wiping}
                  accessibilityLabel="Type WIPE to confirm wipe"
                  style={styles.input}
                />
                <Pressable
                  onPress={() => void wipeEverything()}
                  disabled={wipeText !== "WIPE" || wiping}
                  accessibilityRole="button"
                  accessibilityLabel="Erase wallet and sign out"
                  accessibilityState={{ disabled: wipeText !== "WIPE" || wiping, busy: wiping }}
                  style={[shared.button, styles.dangerButton, styles.action]}
                >
                  {wiping ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[shared.buttonText, shared.primaryButtonText]}>Erase everything</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setWipeOpen(false);
                    setWipeText("");
                  }}
                  disabled={wiping}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel wipe"
                  style={styles.action}
                >
                  <Text style={[shared.buttonText, { color: colors.textMuted }]}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setWipeOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Wipe wallet and sign out"
                style={styles.action}
              >
                <Text style={[typography.body, { color: colors.danger, fontWeight: "600" }]}>
                  Wipe wallet &amp; sign out
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
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
    balances: { gap: spacing.xs, paddingVertical: spacing.sm },
    action: { alignSelf: "stretch" },
    wipeForm: { gap: spacing.sm },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: spacing.sm,
      color: colors.text,
      fontFamily: "monospace",
    },
    dangerButton: { backgroundColor: colors.danger },
    error: { fontSize: 14, color: colors.danger, textAlign: "center" },
  });
}
