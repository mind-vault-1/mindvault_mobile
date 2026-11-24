import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ResourceFetchError } from "../api/resources";
import { EmptyState } from "../components/EmptyState";
import { ResourceCard } from "../components/ResourceCard";
import { SkeletonCard } from "../components/SkeletonCard";
import { useToast } from "../components/ToastProvider";
import { queryKeys, resourceDetailQueryOptions } from "../hooks/queries";
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

  const queryClient = useQueryClient();
  // Saved ids, read from storage on every focus; null until the first read.
  const [ids, setIds] = useState<string[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Ids already being forgotten, so a 404 removes each favourite only once.
  const forgotten = useRef(new Set<string>());

  const loadIds = useCallback(async () => {
    await loadFavorites();
    setIds(getFavoriteIds());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadIds();
      // Coming back to the screen refreshes only what is out of date; cached
      // metadata is shown straight away.
      void queryClient.refetchQueries({ queryKey: queryKeys.details(), stale: true, type: "active" });
    }, [loadIds, queryClient])
  );

  const results = useQueries({
    queries: (ids ?? []).map((id) => resourceDetailQueryOptions(id)),
  });

  // Only a definitive answer (404) means the resource is gone. A timeout,
  // network drop or 5xx is worth retrying, so keep the entry.
  const deletedIds = useMemo(
    () =>
      (ids ?? []).filter((_, index) => {
        const error = results[index]?.error;
        return error instanceof ResourceFetchError && !error.isTransient;
      }),
    [ids, results]
  );

  // Forget deleted resources so they stop showing up on the next visit.
  useEffect(() => {
    const fresh = deletedIds.filter((id) => !forgotten.current.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => forgotten.current.add(id));
    void Promise.all(fresh.map((id) => toggleFavorite(id))).finally(() => {
      setIds((current) => current?.filter((id) => !fresh.includes(id)) ?? null);
      fresh.forEach((id) => queryClient.removeQueries({ queryKey: queryKeys.detail(id) }));
    });
  }, [deletedIds, queryClient]);

  const entries = useMemo<FavoriteEntry[]>(
    () =>
      (ids ?? [])
        .map((id, index) => ({ id, resource: results[index]?.data ?? null }))
        .filter((entry) => !deletedIds.includes(entry.id)),
    [ids, results, deletedIds]
  );

  // Skeletons for the first load only. A query paused while offline has no
  // data yet; it shows the "couldn't refresh" card instead of spinning forever.
  const loading =
    ids === null || results.some((result) => result.isPending && result.fetchStatus === "fetching");

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadIds();
      await queryClient.refetchQueries({ queryKey: queryKeys.details(), type: "active" });
    } finally {
      setRefreshing(false);
    }
  }, [loadIds, queryClient]);

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
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
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
