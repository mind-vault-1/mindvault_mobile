import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { fetchPublicPublisher, type PublicPublisher } from "../api/publishers";
import { ResourceCard } from "../components/ResourceCard";
import { useToast } from "../components/ToastProvider";
import type { RootStackParamList } from "../navigation";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { openExternalUrl, stellarExpertAccountUrl } from "../utils/stellarExpert";
import { getFormatLocale } from "../i18n";

type Props = NativeStackScreenProps<RootStackParamList, "PublisherPublic">;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(getFormatLocale());
}

/** Public profile of the publisher that owns a wallet, with their listed resources. */
export function PublisherPublicScreen({ route, navigation }: Props) {
  const { address } = route.params;
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toast = useToast();

  const [profile, setProfile] = useState<PublicPublisher | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchPublicPublisher(address, signal);
        setProfile(result);
        if (result) navigation.setOptions({ title: result.publisher.name });
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load publisher");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [address, navigation]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function openExplorer() {
    openExternalUrl(stellarExpertAccountUrl({ accountId: address })).catch(() =>
      toast.error("Unable to open explorer")
    );
  }

  const wallet = (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Wallet</Text>
      <Text style={[styles.fieldValue, styles.mono]} selectable>
        {address}
      </Text>
      <Pressable
        onPress={openExplorer}
        accessibilityRole="link"
        accessibilityLabel="View wallet on Stellar Expert"
        accessibilityHint="Opens the wallet's account in Stellar Explorer"
        style={styles.link}
      >
        <Text style={[typography.body, { color: colors.primary }]}>View on Stellar Expert</Text>
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[shared.screen, styles.centered]} edges={["bottom"]}>
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Loading publisher" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[shared.screen, styles.centered]} edges={["bottom"]}>
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
        <Pressable
          onPress={() => void load()}
          style={[shared.button, shared.primaryButton]}
          accessibilityRole="button"
          accessibilityLabel="Retry loading publisher"
        >
          <Text style={[shared.buttonText, shared.primaryButtonText]}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={shared.screen} edges={["bottom"]}>
        <View style={styles.content}>
          <Text style={typography.heading}>No publisher profile</Text>
          <Text style={typography.body}>No publisher has registered this wallet with MindVault.</Text>
          <View style={styles.card}>{wallet}</View>
        </View>
      </SafeAreaView>
    );
  }

  const { publisher, resources } = profile;
  return (
    <SafeAreaView style={shared.screen} edges={["bottom"]}>
      <FlatList
        data={resources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.card}>
              <View style={styles.field}>
                <Text style={typography.heading}>{publisher.name}</Text>
                <Text style={typography.body}>Publisher since {formatDate(publisher.createdAt)}</Text>
              </View>
              <View style={styles.fieldDivider}>{wallet}</View>
            </View>
            <Text style={typography.cardTitle} accessibilityRole="header">
              Resources ({resources.length})
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={typography.body}>This publisher has no listed resources yet.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate("ResourceDetail", { resourceId: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            accessibilityHint="Opens the resource detail"
          >
            <ResourceCard resource={item} onCopyUrl={toast.info} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    centered: { justifyContent: "center", alignItems: "center", padding: spacing.lg, gap: spacing.md },
    content: { padding: spacing.lg, gap: spacing.md },
    header: { gap: spacing.md },
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    field: { padding: spacing.md, gap: spacing.xs },
    fieldDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    fieldLabel: { fontSize: 13, fontWeight: "500", color: colors.textMuted },
    fieldValue: { fontSize: 15, fontWeight: "500", color: colors.text },
    mono: { fontFamily: "monospace", fontSize: 13 },
    link: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
    errorText: { fontSize: 14, color: colors.danger, textAlign: "center" },
  });
}
