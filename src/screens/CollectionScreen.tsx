import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fetchCollection, type Collection } from "../api/collections";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ResourceCard } from "../components/ResourceCard";
import type { RootStackParamList } from "../navigation";
import type { Resource } from "../types";

interface CollectionScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, "Collection">;
  route: { params: { collectionId: string } };
}

export function CollectionScreen({ navigation, route }: CollectionScreenProps) {
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

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.page}>
        <ErrorBanner message={error} onRetry={() => void load()} />
      </SafeAreaView>
    );
  }

  if (!collection) {
    return (
      <SafeAreaView style={styles.page}>
        <EmptyState title="Collection unavailable" />
      </SafeAreaView>
    );
  }

  const resources = collection.resources ?? [];
  return (
    <SafeAreaView style={styles.page}>
      <FlatList
        data={resources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.title}>{collection.title}</Text>
            {collection.description ? (
              <Text style={styles.description}>{collection.description}</Text>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<EmptyState title="No resources in this collection" />}
        renderItem={({ item }: { item: Resource }) => (
          <Pressable
            onPress={() => navigation.navigate("ResourceDetail", { resourceId: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
          >
            <ResourceCard resource={item} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12 },
  header: { gap: 6, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: "700" },
  description: { fontSize: 15, opacity: 0.7 },
});
