import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fetchAnalytics, type PublisherAnalytics } from "../api/publishers";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

const amountFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const countFormat = new Intl.NumberFormat();

export function PublisherAnalyticsScreen() {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [analytics, setAnalytics] = useState<PublisherAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchAnalytics()
      .then((data) => { if (active) setAnalytics(data); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load publisher analytics");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const resources = useMemo(() => [...(analytics?.resources ?? [])].sort(
    (a, b) => Number(b.totalEarned) - Number(a.totalEarned)
  ), [analytics]);
  const keyExtractor = useCallback((resource: PublisherAnalytics["resources"][number]) => resource.id, []);

  return (
    <SafeAreaView style={shared.screen} edges={["left", "right", "bottom"]}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Loading publisher analytics" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={[typography.body, { color: colors.danger }]} accessibilityRole="alert">{error}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading analytics"
            onPress={() => setAttempt((value) => value + 1)} style={[shared.button, shared.primaryButton]}>
            <Text style={[shared.buttonText, shared.primaryButtonText]}>Retry</Text>
          </Pressable>
        </View>
      ) : analytics ? (
        <FlatList
          data={resources}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.summary}>
              <Text style={typography.heading}>Earnings &amp; sales</Text>
              <View accessible accessibilityLabel={`Earned ${amountFormat.format(Number(analytics.summary.totalEarned))} ${analytics.summary.currency} from ${countFormat.format(analytics.summary.totalSales)} sales`} style={styles.summary}>
                <Text style={typography.title}>{amountFormat.format(Number(analytics.summary.totalEarned))} {analytics.summary.currency}</Text>
                <Text style={typography.body}>{countFormat.format(analytics.summary.totalSales)} sales</Text>
              </View>
              <Text style={typography.body}>
                {countFormat.format(analytics.summary.totalResources)} resources · {countFormat.format(analytics.summary.listedResources)} listed
              </Text>
              <Text style={typography.cardTitle}>Verification</Text>
              <View style={styles.counts}>
                {(["verified", "rejected", "pending"] as const).map((status) => (
                  <Text key={status} style={typography.body}>
                    {countFormat.format(analytics.summary.verification[status])} {status}
                  </Text>
                ))}
              </View>
              <Text style={[typography.heading, styles.breakdown]}>Resources by earnings</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={typography.cardTitle}>No resources yet</Text>
              <Text style={typography.body}>Publish a resource to start tracking sales and earnings here.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.resource} testID={`analytics-resource-${item.id}`}>
              <Text style={typography.cardTitle}>{item.title}</Text>
              <Text style={typography.price}>{amountFormat.format(Number(item.totalEarned))} {analytics.summary.currency} earned</Text>
              <Text style={typography.body}>
                {countFormat.format(item.totalSales)} sales · Price {amountFormat.format(Number(item.price))} {analytics.summary.currency}
              </Text>
              {item.recentPayments.length > 0 ? <Text style={typography.body}>Recent payments</Text> : null}
              {item.recentPayments.map((payment, index) => (
                <View key={`${payment.payerAddress}-${payment.paidAt}-${index}`} style={styles.payment}>
                  <Text style={typography.body} accessibilityLabel={`Payer ${payment.payerAddress}`}>
                    {payment.payerAddress.length > 16 ? `${payment.payerAddress.slice(0, 6)}…${payment.payerAddress.slice(-4)}` : payment.payerAddress}
                  </Text>
                  <Text style={typography.body}>{amountFormat.format(Number(payment.amount))} {analytics.summary.currency}</Text>
                  <Text style={typography.body}>{Number.isNaN(Date.parse(payment.paidAt)) ? payment.paidAt : new Date(payment.paidAt).toLocaleDateString()}</Text>
                </View>
              ))}
            </View>
          )}
        />
      ) : null}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    centered: { flex: 1, padding: spacing.xl, gap: spacing.md, alignItems: "center", justifyContent: "center" },
    content: { flexGrow: 1, padding: spacing.lg },
    summary: { gap: spacing.sm },
    counts: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    breakdown: { marginTop: spacing.xl, marginBottom: spacing.sm },
    resource: { paddingVertical: spacing.lg, borderBottomWidth: 1, borderColor: colors.border, gap: spacing.sm },
    payment: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    empty: { paddingVertical: spacing.xl, gap: spacing.sm },
  });
}
