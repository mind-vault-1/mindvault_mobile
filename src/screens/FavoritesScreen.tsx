import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fetchResource, ResourceFetchError } from "../api/resources";
import { EmptyState } from "../components/EmptyState";
import { ResourceCard } from "../components/ResourceCard";
import { SkeletonCard } from "../components/SkeletonCard";
import { useToast } from "../components/ToastProvider";
import type { RootStackParamList } from "../navigation";
import { getFavoriteIds, loadFavorites, toggleFavorite } from "../services/favorites";
import type { Resource } from "../types";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

interface FavoritesScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, "Favorites">;
}

/** A saved id together with the metadata fetched for it. */
interface FavoriteEntry {
  id: string;
  resource: Resource | null;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    listContent: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    skeletons: {
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    unavailable: {
      borderStyle: "dashed",
    },
    unavailableText: {
      color: colors.textMuted,
    },
  });
}

export function FavoritesScreen({ navigation }: FavoritesScreenProps) {
  const { colors, shared, typography, colorScheme } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toast = useToast();

  const [entries, setEntries] = useState<FavoriteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    await loadFavorites();

    const results = await Promise.all(
      getFavoriteIds().map(async (id): Promise<FavoriteEntry & { notFound: boolean }> => {
        try {
          return { id, resource: await fetchResource(id), notFound: false };
        } catch (error) {
          // Only a definitive answer (404) means the resource is gone. A
          // timeout, network drop or 5xx is worth retrying, so keep the entry.
          const notFound = error instanceof ResourceFetchError && !error.isTransient;
          return { id, resource: null, notFound };
        }
      })
    );

    // Forget deleted resources so they stop showing up on the next visit.
    const deleted = results.filter((entry) => entry.notFound);
    await Promise.all(deleted.map((entry) => toggleFavorite(entry.id)));

    setEntries(
      results.filter((entry) => !entry.notFound).map(({ id, resource }) => ({ id, resource }))
    );
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FavoriteEntry>) => {
      const { resource } = item;
      if (!resource) {
        return (
          <View style={[shared.card, styles.unavailable]}>
            <Text style={[typography.body, styles.unavailableText]}>
              Couldn't refresh this favourite. Pull down to try again.
            </Text>
          </View>
        );
      }
      return (
        <Pressable
          onPress={() => navigation.navigate("ResourceDetail", { resourceId: resource.id })}
          accessibilityRole="button"
          accessibilityLabel={`Open ${resource.title}`}
        >
          <ResourceCard resource={resource} onCopyUrl={toast.info} />
        </Pressable>
      );
    },
    [navigation, shared, styles, toast, typography]
  );

  function renderEmpty() {
    if (loading) return null;

    return (
      <EmptyState
        title="No saved favourites"
        body="Save a resource and it will show up here, with its latest details."
        actionLabel="Browse catalog"
        onAction={() => navigation.navigate("Catalog")}
      />
    );
  }

  return (
    <SafeAreaView style={shared.screen} edges={["left", "right", "bottom"]}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <FlatList
        data={loading ? null : entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
        }
        renderItem={renderItem}
        ListHeaderComponent={
          loading ? (
            <View style={styles.skeletons}>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={renderEmpty}
      />
    </SafeAreaView>
  );
}
