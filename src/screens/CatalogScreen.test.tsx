import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { CatalogScreen } from "./CatalogScreen";
import { fetchCatalog, fetchRegistryStatus, getApiBaseUrl } from "../api/resources";

jest.mock("../api/resources");
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

const mockedFetchCatalog = fetchCatalog as jest.Mock;
const mockedFetchRegistryStatus = fetchRegistryStatus as jest.Mock;
const mockedGetApiBaseUrl = getApiBaseUrl as jest.Mock;

const navigation = { navigate: jest.fn() } as any;

beforeEach(() => {
  jest.useFakeTimers();
  mockedFetchCatalog.mockResolvedValue([]);
  mockedFetchRegistryStatus.mockResolvedValue({ resourceCount: 0 });
  mockedGetApiBaseUrl.mockReturnValue("http://localhost:4000");
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("CatalogScreen search debounce", () => {
  it("does not refetch on every keystroke, only after typing pauses", async () => {
    const { getByLabelText } = render(<CatalogScreen navigation={navigation} />);

    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));
    mockedFetchCatalog.mockClear();

    const input = getByLabelText("Search resources");

    fireEvent.changeText(input, "s");
    fireEvent.changeText(input, "st");
    fireEvent.changeText(input, "ste");
    fireEvent.changeText(input, "stel");
    fireEvent.changeText(input, "stell");
    fireEvent.changeText(input, "stella");

    // Still within the debounce window — no fetch yet.
    jest.advanceTimersByTime(200);
    expect(mockedFetchCatalog).not.toHaveBeenCalled();

    // Past the debounce window — exactly one fetch, with the final value.
    jest.advanceTimersByTime(200);
    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));
    expect(mockedFetchCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ search: "stella" }),
    );
  });
});