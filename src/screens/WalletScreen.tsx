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
      </ScrollView>
    </SafeAreaView>
  );
}
