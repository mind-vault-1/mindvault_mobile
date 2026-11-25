import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fetchCollection, type Collection } from "../api/collections";
import { getApiBaseUrl } from "../api/resources";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ResourceCard } from "../components/ResourceCard";
import type { RootStackParamList } from "../navigation";
import { useAppTheme } from "../theme/ThemeProvider";
import type { Resource } from "../types";

interface CollectionScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, "Collection">;
  route: { params: { collectionId: string } };
}

export function buildCollectionShareUrl(collectionId: string): string {
  const base = getApiBaseUrl().trim().replace(/\/+$/, "");
  return `${base}/collections/${encodeURIComponent(collectionId)}`;
}

export function CollectionScreen({ navigation, route }: CollectionScreenProps) {
  const { colors } = useAppTheme();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setCollection(await fetchCollection(route.params.collectionId, signal));
    } catch (caught) {
      if (!(caught instanceof Error) || caught.message !== "The request was cancelled.") {
        setError(caught instanceof Error ? caught.message : "Failed to load collection.");
      }
    } finally {
      setLoading(false);
    }
  }, [route.params.collectionId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const shareUrl = useMemo(
    () => buildCollectionShareUrl(route.params.collectionId),
    [route.params.collectionId]
  );

  const onShare = useCallback(async () => {
    const title = collection?.title ?? "Collection";
    await Share.share({ title, message: `${title}\n${shareUrl}`, url: shareUrl });
  }, [collection?.title, shareUrl]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
        <ErrorBanner message={error} onRetry={() => void load()} />
      </SafeAreaView>
    );
  }

  if (!collection) {
    return (
      <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
        <EmptyState title="Collection unavailable" body="This collection could not be found." />
      </SafeAreaView>
    );
  }

  const resources = collection.resources ?? [];
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
      <FlatList
        data={resources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{collection.title}</Text>
            {collection.description ? (
              <Text style={[styles.description, { color: colors.textMuted }]}>
                {collection.description}
              </Text>
            ) : null}
            <Pressable
              onPress={() => void onShare()}
              accessibilityRole="button"
              accessibilityLabel="Share collection"
              style={[styles.shareButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.shareText, { color: colors.primary }]}>Share collection</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<EmptyState title="No resources in this collection" body="Resources added to this collection will appear here." />}
        renderItem={({ item }: { item: Resource }) => (
          <Pressable
            onPress={() => navigation.navigate("ResourceDetail", { resourceId: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
          >
            <ResourceCard resource={item} onCopyUrl={() => {}} onPress={() => navigation.navigate("ResourceDetail", { resourceId: item.id })} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12, flexGrow: 1 },
  header: { gap: 8, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: "700" },
  description: { fontSize: 15 },
  shareButton: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  shareText: { fontWeight: "600" },
});
