import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { fetchLeaderboard, type LeaderboardEntry } from "../api/publishers";
import { EmptyState } from "../components/EmptyState";
import type { RootStackParamList } from "../navigation";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Leaderboard">;

/** Screen-reader text for a row, e.g. "Rank 1 of 10, Ada, earned 12.5000 USDC from 4 sales, 3 resources". */
export function describeEntry(entry: LeaderboardEntry, rank: number, total: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return (
    `Rank ${rank} of ${total}, ${entry.name}, earned ${entry.totalEarned} USDC ` +
    `from ${plural(entry.totalSales, "sale")}, ${plural(entry.totalResources, "resource")}`
  );
}

/** Ranked list of publishers by earnings. Tapping a row opens their public profile. */
export function LeaderboardScreen({ navigation }: Props) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh", signal?: AbortSignal) => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchLeaderboard(signal);
      if (signal?.aborted) return;
      setEntries(result);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load("initial", controller.signal);
    return () => controller.abort();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={[shared.screen, styles.centered]} edges={["bottom"]}>
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Loading leaderboard" />
      </SafeAreaView>
    );
  }

  if (error && entries.length === 0) {
    return (
      <SafeAreaView style={[shared.screen, styles.centered]} edges={["bottom"]}>
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
        <Pressable
          onPress={() => void load("initial")}
          style={[shared.button, shared.primaryButton]}
          accessibilityRole="button"
          accessibilityLabel="Retry loading leaderboard"
        >
          <Text style={[shared.buttonText, shared.primaryButtonText]}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={shared.screen} edges={["bottom"]}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load("refresh")}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          error ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState title="No publishers yet" body="Publishers appear here once they register." />
        }
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => navigation.navigate("PublisherPublic", { address: item.walletAddress })}
            style={styles.row}
            accessible
            accessibilityRole="button"
            accessibilityLabel={describeEntry(item, index + 1, entries.length)}
            accessibilityHint="Opens the publisher's public profile"
          >
            <Text style={[styles.rank, typography.heading]} importantForAccessibility="no">
              {index + 1}
            </Text>
            <View style={styles.body}>
              <Text style={typography.cardTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={typography.body}>
                {item.totalResources} {item.totalResources === 1 ? "resource" : "resources"} ·{" "}
                {item.totalSales} {item.totalSales === 1 ? "sale" : "sales"}
              </Text>
            </View>
            <Text style={styles.earned}>{item.totalEarned} USDC</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    centered: { justifyContent: "center", alignItems: "center", padding: spacing.lg, gap: spacing.md },
    content: { padding: spacing.lg, gap: spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 56,
      padding: spacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    rank: { minWidth: 28, textAlign: "center" },
    body: { flex: 1, gap: spacing.xs },
    earned: { fontSize: 15, fontWeight: "600", color: colors.text },
    errorText: { fontSize: 14, color: colors.danger, textAlign: "center" },
  });
}
