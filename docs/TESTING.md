# Testing Guide

This guide explains how to write tests for MindVault, covering mocking strategies, test utilities, and best practices.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run a specific test file
npm test -- src/screens/SettingsScreen.test.tsx

# Run tests with coverage
npm test -- --coverage
```

## End-to-end tests (Maestro)

The `e2e/` directory holds [Maestro](https://maestro.mobile.dev/) flows that drive
the real app against a running server:

- `e2e/purchase.yaml` — a successful purchase (catalog → resource → `Unlock for X
  USDC` → `Pay & Access` → sign → paid content) and a rejected payment (the
  paywall stays locked and offers `Retry`).
- `e2e/lease.yaml` — cancelling a lease before signing, then buying a day lease
  (`Rent instead` → `Select Day lease` → `Confirm & Pay` → sign → `Lease
  Purchased`).

### Seeded testnet data

The flows need three resources on a **testnet** deployment. Seed them before
running, then pass their titles, price, and the paid content through environment
variables:

| Variable | Meaning |
| --- | --- |
| `PAID_TITLE` | Text resource whose payment the server accepts |
| `DECLINED_TITLE` | Text resource whose payment the server rejects |
| `LEASE_TITLE` | Text resource listed on the testnet lease registry |
| `PRICE` | Price shown by all three resources, e.g. `2.50` |
| `CONTENT` | Content returned after a successful unlock |
| `TESTNET_SECRET` | Funded testnet Stellar secret key used to sign |

Never point these flows at mainnet or use a production key: they sign real
transactions and the network check in the workflow enforces `testnet`.

### Running locally

Build and install a preview build, then run the flows from the repository root:

```sh
maestro test \
  -e PAID_TITLE="E2E Paid Resource" \
  -e DECLINED_TITLE="E2E Declined Resource" \
  -e LEASE_TITLE="E2E Leasable Resource" \
  -e PRICE="2.50" \
  -e CONTENT="E2E purchased content" \
  -e TESTNET_SECRET="$E2E_TESTNET_SECRET" \
  --test-output-dir e2e/out \
  e2e/purchase.yaml e2e/lease.yaml
```

### In CI

`.github/workflows/e2e.yml` builds the PR with the EAS `preview` profile (Android
APK and iOS simulator app) and runs both flows on an emulator and a simulator.
It only runs on the upstream repository when a PR carries the `e2e` label (or by
manual dispatch), and it uploads `e2e/out/` plus any screenshots whenever a run
fails. Configure the variables above as repository variables and `EXPO_TOKEN`
and `E2E_TESTNET_SECRET` as secrets; the seeded API URL comes from the EAS
`preview` environment (see `docs/PREVIEW_BUILDS.md`).

## Mutation testing

`npm run test:mutation` runs Stryker against the money and signing helpers:
`src/utils/requestSignature.ts`, `src/utils/validateStellarSecret.ts`,
`src/utils/priceRange.ts` and `src/api/payment.ts`. Config lives in
`stryker.conf.json`. Reports go to `reports/mutation/` and are git-ignored.

For a targeted local run, pass Stryker's `--mutate` option through npm:

```sh
npm run test:mutation -- --mutate src/utils/priceRange.ts
```

Baseline (2026-11-24, 725 mutants, about 14 minutes locally):

| File | Mutation score | Killed | Survived | No coverage |
| --- | ---: | ---: | ---: | ---: |
| `src/api/payment.ts` | 67.40% | 242 | 79 | 40 |
| `src/utils/priceRange.ts` | 95.24% | 60 | 3 | 0 |
| `src/utils/requestSignature.ts` | 62.20% | 146 | 50 | 46 |
| `src/utils/validateStellarSecret.ts` | 50.00% | 14 | 11 | 4 |
| **All files** | **67.28%** | 462 | 143 | 90 |

The gate is 65%: `low` is 70%, `high` is 80%, and `break` is 65%, so CI fails
when the overall score drops below the recorded baseline by more than two
points. `.github/workflows/mutation.yml` runs on manual dispatch or when a PR
has the `mutation` label.

## Test Structure

Tests are co-located with their source files:

```
src/
├── api/
│   ├── resources.ts
│   └── resources.test.ts
├── screens/
│   ├── SettingsScreen.tsx
│   └── SettingsScreen.test.tsx
└── utils/
    ├── errorLogger.ts
    └── errorLogger.test.ts
```

## Test Utilities

The `src/test-utils/index.tsx` module provides reusable mocks and helpers:

### `renderWithProviders()`

Wraps components with `ThemeProvider`, so tests can render any UI that uses `useAppTheme()`:

```typescript
import { renderWithProviders } from "../test-utils";

it("renders with theme", () => {
  const { getByText } = renderWithProviders(<SettingsScreen />);
  expect(getByText("Settings")).toBeTruthy();
});
```

### `setupFetchMock()`

Replaces `global.fetch` with a mock that returns a successful JSON response:

```typescript
import { setupFetchMock } from "../test-utils";

beforeEach(() => {
  const fetchMock = setupFetchMock();
});

it("fetches data", async () => {
  const data = await fetchData();
  expect(global.fetch).toHaveBeenCalled();
});
```

### `safeAreaMock()` and `navigationMock()`

`jest.mock()` only works at the top level of a test file (Jest hoists it above
the imports), so a helper that calls `jest.mock` inside a function has no
effect. These helpers are **module factories** instead: pass them to a
top-level `jest.mock`, requiring the module inside the factory.

```typescript
jest.mock("react-native-safe-area-context", () =>
  require("../test-utils").safeAreaMock()
);

// Variables used inside a mock factory must be named mock…
const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () =>
  require("../test-utils").navigationMock({ navigate: mockNavigate })
);
```

### AsyncStorage

You don't need to mock it. `jest.setup.js` installs the official
`@react-native-async-storage/async-storage` Jest mock for every test, backed by
an in-memory store. Call `await AsyncStorage.clear()` in `beforeEach` to start
clean.

## Mocking Patterns

### Mocking Modules

Use `jest.mock()` to replace entire modules:

```typescript
jest.mock("../api/resources", () => ({
  fetchResources: jest.fn().mockResolvedValue([
    { id: "1", name: "Test Resource" },
  ]),
}));
```

### Mocking Functions

Use `jest.fn()` to create mock functions:

```typescript
const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
```

### Mocking Module Exports

For default exports, use `jest.mock()` with a function:

```typescript
jest.mock("../services/storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));
```

### Spying on Functions

Spy on a real function to track calls while keeping its behavior:

```typescript
const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

try {
  // Test code
  expect(consoleErrorSpy).toHaveBeenCalled();
} finally {
  consoleErrorSpy.mockRestore();
}
```

## Common Test Scenarios

### Testing API Calls

```typescript
import { getPublisherProfile } from "../api/publishers";
import { setupFetchMock } from "../test-utils";

jest.mock("../api/publishers");

const mockGetPublisherProfile = getPublisherProfile as jest.MockedFunction<
  typeof getPublisherProfile
>;

beforeEach(() => {
  setupFetchMock();
  mockGetPublisherProfile.mockResolvedValue({
    id: "pub-123",
    name: "Test Publisher",
    email: "test@example.com",
    createdAt: "2024-01-01T00:00:00Z",
  });
});

it("displays the publisher profile", async () => {
  const { getByText } = renderWithProviders(<PublisherProfileScreen />);
  await waitFor(() => {
    expect(getByText("Test Publisher")).toBeTruthy();
  });
});
```

### Testing User Interactions

```typescript
import { fireEvent, waitFor } from "@testing-library/react-native";

it("handles button press", async () => {
  const onPress = jest.fn();
  const { getByText } = renderWithProviders(
    <Button onPress={onPress} title="Click me" />
  );

  const button = getByText("Click me");
  fireEvent.press(button);

  await waitFor(() => {
    expect(onPress).toHaveBeenCalled();
  });
});
```

### Testing AsyncStorage

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";

beforeEach(async () => {
  await AsyncStorage.clear();
});

it("persists and retrieves data", async () => {
  await AsyncStorage.setItem("apiKey", "secret-123");

  const stored = await AsyncStorage.getItem("apiKey");
  expect(stored).toBe("secret-123");
});
```

### Testing Theme-Dependent Components

```typescript
it("renders with correct colors", () => {
  const { getByText } = renderWithProviders(<ThemeToggle />, {
    initialTheme: "dark",
  });

  expect(getByText("Toggle Theme")).toBeTruthy();
  // Theme colors are applied automatically
});
```

## Best Practices

1. **Clear test names**: Use `it("should X when Y happens")`
2. **Arrange-Act-Assert**: Structure tests in three phases
3. **Mock external dependencies**: Don't call real APIs or file systems
4. **Reset mocks between tests**: Use `jest.clearAllMocks()` in `beforeEach()`
5. **Test behavior, not implementation**: Assert what users see, not internal state
6. **Avoid snapshot tests**: They hide changes and are fragile
7. **Use `waitFor()` for async operations**: Don't rely on arbitrary delays
8. **Test error cases**: Mock failures and verify error handling

## Example Test File

```typescript
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SettingsScreen } from "./SettingsScreen";
import { renderWithProviders, setupFetchMock } from "../test-utils";

beforeEach(() => {
  setupFetchMock();
});

describe("SettingsScreen", () => {
  it("displays the settings title", () => {
    const { getByText } = renderWithProviders(<SettingsScreen />);
    expect(getByText("Settings")).toBeTruthy();
  });

  it("saves the API URL when the button is pressed", async () => {
    const { getByDisplayValue, getByText } = renderWithProviders(
      <SettingsScreen />
    );

    const input = getByDisplayValue("http://localhost:4021");
    fireEvent.changeText(input, "http://192.168.1.100:4021");

    const saveButton = getByText("Save");
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(getByText("Saved")).toBeTruthy();
    });
  });
});
```

## Troubleshooting

### "Cannot find module" errors

Ensure the module is mocked before the component imports it:

```typescript
// ✅ Correct: Mock before rendering
jest.mock("../api/publishers");
const { getPublisherProfile } = require("../api/publishers");

it("works", () => {
  // Test
});

// ❌ Wrong: Mock after render
render(<Component />);
jest.mock("../api/publishers");
```

### Mocks not working in tests

Clear the require cache if mocks aren't applying:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});
```

### Tests timing out

Use `waitFor()` with a timeout for slow operations:

```typescript
await waitFor(
  () => {
    expect(getByText("Loaded")).toBeTruthy();
  },
  { timeout: 5000 }
);
```

## Further Reading

- [React Native Testing Library docs](https://callstack.github.io/react-native-testing-library/)
- [Jest documentation](https://jestjs.io/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
