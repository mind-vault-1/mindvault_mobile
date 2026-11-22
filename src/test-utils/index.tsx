import React from "react";
import { render, RenderOptions } from "@testing-library/react-native";
import { ThemeProvider } from "../theme/ThemeProvider";

const mockSafeAreaInset = { top: 0, bottom: 0, left: 0, right: 0 };
const mockSafeAreaFrame = { x: 0, y: 0, width: 390, height: 844 };

export function setupFetchMock(): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [],
    text: async () => "[]",
    headers: {
      get: jest.fn((key) => {
        if (key === "content-type") return "application/json";
        return null;
      }),
    },
  });

  global.fetch = fetchMock as unknown as typeof global.fetch;
  return fetchMock;
}

/**
 * Module factory for `react-native-safe-area-context`. `jest.mock` must run at
 * the top level of the test file, so pass this as its factory:
 *
 *   jest.mock("react-native-safe-area-context", () =>
 *     require("../test-utils").safeAreaMock()
 *   );
 */
export function safeAreaMock() {
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaInsetsContext: {
      Consumer: ({ children }: { children: (value: typeof mockSafeAreaInset) => React.ReactNode }) =>
        children(mockSafeAreaInset),
    },
    useSafeAreaInsets: () => mockSafeAreaInset,
    useSafeAreaFrame: () => mockSafeAreaFrame,
  };
}

export type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper">;

export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderWithProvidersOptions
): ReturnType<typeof render> {
  const renderOptions = options ?? {};

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider>{children}</ThemeProvider>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export function setupFakeTimers(): void {
  jest.useFakeTimers();
}

export function teardownFakeTimers(): void {
  jest.useRealTimers();
}

/**
 * Module factory for `@react-navigation/native` with a stubbed `useNavigation`.
 * Use it at the top level of the test file:
 *
 *   const mockNavigate = jest.fn();
 *   jest.mock("@react-navigation/native", () =>
 *     require("../test-utils").navigationMock({ navigate: mockNavigate })
 *   );
 */
export function navigationMock(navigation: Record<string, unknown> = {}) {
  return {
    ...jest.requireActual("@react-navigation/native"),
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), ...navigation }),
  };
}
