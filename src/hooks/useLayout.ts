import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { useWindowDimensions } from "react-native";

export type CatalogLayout = "grid" | "list";

const LAYOUT_KEY = "@mindvault_catalog_layout";

/** Cards per row in grid mode: one on a phone, more as the window widens. */
export function columnsForWidth(width: number): number {
  if (width >= 900) return 3;
  if (width >= 600) return 2;
  return 1;
}

/** Catalog grid/list mode, remembered across restarts. */
export function useLayout() {
  const { width } = useWindowDimensions();
  const [layout, setLayout] = useState<CatalogLayout>("list");

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LAYOUT_KEY)
      .then((saved) => {
        if (active && (saved === "grid" || saved === "list")) setLayout(saved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const toggleLayout = useCallback(() => {
    const next: CatalogLayout = layout === "grid" ? "list" : "grid";
    setLayout(next);
    void AsyncStorage.setItem(LAYOUT_KEY, next).catch(() => {});
  }, [layout]);

  return {
    layout,
    columns: layout === "grid" ? columnsForWidth(width) : 1,
    toggleLayout,
  };
}
