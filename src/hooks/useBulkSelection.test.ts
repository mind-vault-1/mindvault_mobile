import { act, renderHook } from "@testing-library/react-native";

import { useBulkSelection } from "./useBulkSelection";

const items = [{ id: "one" }, { id: "two" }, { id: "three" }];

describe("useBulkSelection", () => {
  it("toggles individual items and reports selection state", () => {
    const { result } = renderHook(() => useBulkSelection(items));

    act(() => result.current.toggle("two"));

    expect(result.current.selectedCount).toBe(1);
    expect(result.current.isSelected("two")).toBe(true);
    expect(result.current.isSelected("one")).toBe(false);
  });

  it("selects visible items without dropping hidden selections", () => {
    const { result, rerender } = renderHook(
      ({ visible }) => useBulkSelection(visible),
      { initialProps: { visible: items } },
    );
    act(() => result.current.toggle("three"));
    rerender({ visible: items.slice(0, 2) });

    act(() => result.current.toggleAllVisible());

    expect(result.current.selectedIds).toEqual(new Set(["one", "two", "three"]));
    expect(result.current.allVisibleSelected).toBe(true);
  });

  it("clears selected visible items while retaining selections outside the current list", () => {
    const { result, rerender } = renderHook(
      ({ visible }) => useBulkSelection(visible),
      { initialProps: { visible: items } },
    );
    act(() => result.current.toggle("three"));
    rerender({ visible: items.slice(0, 2) });
    act(() => result.current.toggleAllVisible());
    act(() => result.current.toggleAllVisible());

    expect(result.current.selectedIds).toEqual(new Set(["three"]));
  });

  it("clears the entire selection", () => {
    const { result } = renderHook(() => useBulkSelection(items));
    act(() => result.current.toggleAllVisible());
    act(() => result.current.clear());
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.allVisibleSelected).toBe(false);
  });
});
