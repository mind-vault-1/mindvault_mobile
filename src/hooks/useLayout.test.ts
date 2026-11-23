import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Dimensions } from "react-native";

import { columnsForWidth, useLayout } from "./useLayout";

const LAYOUT_KEY = "@mindvault_catalog_layout";

describe("columnsForWidth", () => {
  it("keeps a phone on a single column", () => {
    expect(columnsForWidth(360)).toBe(1);
    expect(columnsForWidth(599)).toBe(1);
  });

  it("uses two columns from tablet width up", () => {
    expect(columnsForWidth(600)).toBe(2);
    expect(columnsForWidth(899)).toBe(2);
  });

  it("uses three columns on a large tablet", () => {
    expect(columnsForWidth(900)).toBe(3);
    expect(columnsForWidth(1366)).toBe(3);
  });
});

describe("useLayout", () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem(LAYOUT_KEY);
  });

  it("starts as a single-column list", () => {
    const { result } = renderHook(() => useLayout());

    expect(result.current.layout).toBe("list");
    expect(result.current.columns).toBe(1);
  });

  it("restores a saved grid layout and sizes it to the window", async () => {
    await AsyncStorage.setItem(LAYOUT_KEY, "grid");
    const { result } = renderHook(() => useLayout());

    await waitFor(() => expect(result.current.layout).toBe("grid"));
    expect(result.current.columns).toBe(
      columnsForWidth(Dimensions.get("window").width),
    );
  });

  it("ignores a saved value it does not recognise", async () => {
    await AsyncStorage.setItem(LAYOUT_KEY, "carousel");
    const { result } = renderHook(() => useLayout());
    await act(async () => {});

    expect(result.current.layout).toBe("list");
  });

  it("toggles between the two layouts and remembers the choice", () => {
    const { result } = renderHook(() => useLayout());

    act(() => result.current.toggleLayout());
    expect(result.current.layout).toBe("grid");
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(LAYOUT_KEY, "grid");

    act(() => result.current.toggleLayout());
    expect(result.current.layout).toBe("list");
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(LAYOUT_KEY, "list");
  });
});
