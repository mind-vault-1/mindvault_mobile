import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAppTheme } from "../theme/ThemeProvider";
import type { ThemeColors } from "../theme";
import { spacing } from "../theme";
import { fetchCatalog, type FetchCatalogParams } from "../api/resources";
import { ResourceCard } from "./ResourceCard";
import { SkeletonCard } from "./SkeletonCard";
import type { Resource, CatalogSort } from "../types";

interface HomeSectionsProps {
  /** Optional resourceId to exclude from sections (e.g., the one being viewed) */
  excludeResourceId?: string;
  /** Called when "See all" is pressed for a section */
  onSeeAll?: (sort?: CatalogSort, filter?: { verificationStatus?: "verified" }) => void;
}

const SECTION_CONFIG = [
  {
    id: "newest",
    title: "Newest",
    sort: "newest" as CatalogSort,
    params: { sort: "newest" as CatalogSort, limit: 10 },
  },
  {
    id: "cheapest",
    title: "Cheapest",
    sort: "price_asc" as CatalogSort,
    params: { sort: "price_asc" as CatalogSort, limit: 10 },
  },
  {
    id: "verified",
    title: "Verified",
    sort: undefined,
    params: { verificationStatus: "verified" as const, limit: 10 },
  },
] as const;

type SectionId = (typeof SECTION_CONFIG)[number]["id"];

interface SectionData {
  id: SectionId;
  title: string;
  items: Resource[];
  loading: boolean;
  error: string | null;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: spacing.lg,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
    },
    seeAllButton: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    seeAllText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.primary,
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    skeletonContainer: {
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    errorContainer: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
    },
    errorText: {
      fontSize: 13,
      color: colors.danger,
      textAlign: "center",
    },
  });
}

function flattenResources(payload: unknown): Resource[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && "items" in payload) {
    return Array.isArray((payload as any).items) ? (payload as any).items : [];
  }
  return [];
}

export function HomeSections({ excludeResourceId, onSeeAll }: HomeSectionsProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [sections, setSections] = useState<SectionData[]>(
    SECTION_CONFIG.map((config) => ({
      id: config.id,
      title: config.title,
      items: [],
      loading: true,
      error: null,
    }))
  );

  const loadSection = useCallback(
    async (config: (typeof SECTION_CONFIG)[number]) => {
      const sectionIndex = SECTION_CONFIG.findIndex((c) => c.id === config.id);
      if (sectionIndex === -1) return;

      setSections((prev) => {
        const next = [...prev];
        next[sectionIndex] = { ...next[sectionIndex], loading: true, error: null };
        return next;
      });

      try {
        const params: FetchCatalogParams = { ...config.params };
        const response = await fetchCatalog(params);
        let items = flattenResources(response);

        if (excludeResourceId) {
          items = items.filter((r) => r.id !== excludeResourceId);
        }

        setSections((prev) => {
          const next = [...prev];
          next[sectionIndex] = { ...next[sectionIndex], items, loading: false };
          return next;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load";
        setSections((prev) => {
          const next = [...prev];
          next[sectionIndex] = { ...next[sectionIndex], loading: false, error: message };
          return next;
        });
      }
    },
    [excludeResourceId]
  );

  useEffect(() => {
    SECTION_CONFIG.forEach((config) => {
      void loadSection(config);
    });
  }, [loadSection]);

  const visibleSections = useMemo(
    () => sections.filter((s) => !s.loading && s.items.length > 0 && !s.error),
    [sections]
  );

  if (visibleSections.length === 0 && sections.every((s) => !s.loading)) {
    return null;
  }

  return (
    <View style={styles.container}>
      {SECTION_CONFIG.map((config) => {
        const section = sections.find((s) => s.id === config.id);
        if (!section) return null;

        if (section.loading) {
          return (
            <View key={config.id} style={styles.skeletonContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{config.title}</Text>
              </View>
              <FlatList
                data={Array.from({ length: 3 })}
                keyExtractor={(_, i) => `skeleton-${config.id}-${i}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                renderItem={() => <SkeletonCard />}
              />
            </View>
          );
        }

        if (section.error || section.items.length === 0) {
          return null;
        }

        return (
          <View key={config.id}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{config.title}</Text>
              <Pressable
                onPress={() => onSeeAll?.(config.sort, "verificationStatus" in config.params && config.params.verificationStatus ? { verificationStatus: config.params.verificationStatus } : undefined)}
                style={styles.seeAllButton}
                accessibilityRole="button"
                accessibilityLabel={`See all ${config.title.toLowerCase()} resources`}
              >
                <Text style={styles.seeAllText}>See all</Text>
              </Pressable>
            </View>
            <FlatList
              data={section.items}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.title}`}
                  accessibilityHint="Opens the resource detail"
                >
                  <ResourceCard resource={item} onCopyUrl={() => {}} />
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
            />
          </View>
        );
      })}
    </View>
  );
}