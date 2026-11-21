import { useCallback, useMemo, useState } from "react";

export interface SelectableItem {
  id: string;
}

export function useBulkSelection<T extends SelectableItem>(items: readonly T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const visibleIds = useMemo(() => items.map((item) => item.id), [items]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggle = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (visibleIds.every((id) => next.has(id))) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [visibleIds]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    allVisibleSelected,
    toggle,
    toggleAllVisible,
    clear,
    isSelected,
  };
}
