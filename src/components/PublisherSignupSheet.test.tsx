import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { PublisherSignupSheet } from "./PublisherSignupSheet";
import { registerPublisher } from "../api/publishers";
import { storeApiKey } from "../services/secureStorage";

jest.mock("../api/publishers", () => ({
  ...jest.requireActual("../api/publishers"),
  registerPublisher: jest.fn(),
}));

jest.mock("../services/secureStorage", () => ({
  ...jest.requireActual("../services/secureStorage"),
  storeApiKey: jest.fn(),
}));

jest.mock("../theme/ThemeProvider", () => {
  const colors = {
    primary: "#6366f1",
    primaryMuted: "#e0e7ff",
    surface: "#ffffff",
    border: "#e2e8f0",
    text: "#0f172a",
    textMuted: "#64748b",
    textSubtle: "#94a3b8",
    danger: "#ef4444",
    dangerBg: "#fee2e2",
    success: "#22c55e",
    successBg: "#dcfce7",
    warning: "#f59e0b",
    warningBg: "#fef3c7",
    neutralBg: "#f1f5f9",
    background: "#ffffff",
  };
  return {
    useAppTheme: () => ({
      colors,
      colorScheme: "light",
      shared: {
        screen: {},
        card: {},
        badge: {},
        badgeText: {},
        button: {},
        buttonText: {},
        primaryButton: {},
        primaryButtonText: {},
      },
      typography: {
        title: {},
        subtitle: {},
        heading: {},
        body: {},
        caption: {},
        price: {},
        cardTitle: {},
      },
    }),
  };
});

jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  return {
    ...RN,
    Alert: {
      alert: jest.fn((title, message, buttons) => {
        if (buttons?.[0]?.onPress) buttons[0].onPress();
      }),
    },
  };
});

const mockedRegisterPublisher = registerPublisher as jest.MockedFunction<typeof registerPublisher>;
const mockedStoreApiKey = storeApiKey as jest.MockedFunction<typeof storeApiKey>;

describe("PublisherSignupSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders form fields when visible", () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    const { getByText, getByPlaceholderText } = render(
      <PublisherSignupSheet visible={true} onClose={onClose} onSuccess={onSuccess} />
    );

    expect(getByText("Create Publisher Account")).toBeTruthy();
    expect(getByPlaceholderText("Your name or organization")).toBeTruthy();
    expect(getByPlaceholderText("you@example.com")).toBeTruthy();
    expect(getByPlaceholderText("G... (56 characters)")).toBeTruthy();
    expect(getByText("Create Account")).toBeTruthy();
  });

  it("shows validation errors when fields are empty on submit", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    const { getByText } = render(
      <PublisherSignupSheet visible={true} onClose={onClose} onSuccess={onSuccess} />
    );

    fireEvent.press(getByText("Create Account"));

    await waitFor(() => {
      expect(getByText("Name is required")).toBeTruthy();
      expect(getByText("Email is required")).toBeTruthy();
      expect(getByText("Wallet address is required")).toBeTruthy();
    });
  });

  it("shows validation error for invalid email", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    const { getByPlaceholderText, getByText } = render(
      <PublisherSignupSheet visible={true} onClose={onClose} onSuccess={onSuccess} />
    );

    fireEvent.changeText(getByPlaceholderText("you@example.com"), "not-an-email");
    fireEvent.press(getByText("Create Account"));

    await waitFor(() => {
      expect(getByText("Enter a valid email address")).toBeTruthy();
    });
  });

  it("shows validation error for invalid Stellar address", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    const { getByPlaceholderText, getByText } = render(
      <PublisherSignupSheet visible={true} onClose={onClose} onSuccess={onSuccess} />
    );

    fireEvent.changeText(getByPlaceholderText("G... (56 characters)"), "not-valid");
    fireEvent.press(getByText("Create Account"));

    await waitFor(() => {
      expect(getByText("Enter a valid Stellar public key")).toBeTruthy();
    });
  });

  it("calls registerPublisher with correct data and stores API key on success", async () => {
    const response = {
      id: "pub-123",
      name: "Test Publisher",
      email: "test@example.com",
      walletAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      apiKey: "sk_live_abcdef123456",
      createdAt: "2026-10-20T12:00:00Z",
    };
    mockedRegisterPublisher.mockResolvedValue(response);
    mockedStoreApiKey.mockResolvedValue(undefined);

    const onClose = jest.fn();
    const onSuccess = jest.fn();

    const { getByPlaceholderText, getByText } = render(
      <PublisherSignupSheet visible={true} onClose={onClose} onSuccess={onSuccess} />
    );

    fireEvent.changeText(getByPlaceholderText("Your name or organization"), "Test Publisher");
    fireEvent.changeText(getByPlaceholderText("you@example.com"), "test@example.com");
    fireEvent.changeText(
      getByPlaceholderText("G... (56 characters)"),
      "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7"
    );

    fireEvent.press(getByText("Create Account"));

    await waitFor(() => {
      expect(mockedRegisterPublisher).toHaveBeenCalledWith({
        name: "Test Publisher",
        email: "test@example.com",
        walletAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      });
    });

    await waitFor(() => {
      expect(mockedStoreApiKey).toHaveBeenCalledWith("sk_live_abcdef123456");
    });

    await waitFor(() => {
      expect(getByText("Account Created!")).toBeTruthy();
      expect(getByText("sk_live_abcdef123456")).toBeTruthy();
    });
  });

  it("shows error alert when registration fails with 409", async () => {
    mockedRegisterPublisher.mockRejectedValue(new Error("Email already registered"));

    const onClose = jest.fn();
    const onSuccess = jest.fn();

    const { getByPlaceholderText, getByText } = render(
      <PublisherSignupSheet visible={true} onClose={onClose} onSuccess={onSuccess} />
    );

    fireEvent.changeText(getByPlaceholderText("Your name or organization"), "Test");
    fireEvent.changeText(getByPlaceholderText("you@example.com"), "existing@example.com");
    fireEvent.changeText(
      getByPlaceholderText("G... (56 characters)"),
      "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7"
    );

    fireEvent.press(getByText("Create Account"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Registration Failed",
        "Email already registered",
        expect.any(Array)
      );
    });
  });

  it("calls onSuccess with API key and onClose when user confirms", async () => {
    const response = {
      id: "pub-123",
      name: "Test",
      email: "test@example.com",
      walletAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      apiKey: "sk_live_abcdef123456",
      createdAt: "2026-10-20T12:00:00Z",
    };
    mockedRegisterPublisher.mockResolvedValue(response);
    mockedStoreApiKey.mockResolvedValue(undefined);

    const onClose = jest.fn();
    const onSuccess = jest.fn();

    const { getByPlaceholderText, getByText } = render(
      <PublisherSignupSheet visible={true} onClose={onClose} onSuccess={onSuccess} />
    );

    fireEvent.changeText(getByPlaceholderText("Your name or organization"), "Test");
    fireEvent.changeText(getByPlaceholderText("you@example.com"), "test@example.com");
    fireEvent.changeText(
      getByPlaceholderText("G... (56 characters)"),
      "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7"
    );

    fireEvent.press(getByText("Create Account"));

    await waitFor(() => {
      expect(getByText("Account Created!")).toBeTruthy();
    });

    fireEvent.press(getByText("I've Saved It"));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("sk_live_abcdef123456");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("calls onClose when cancel is pressed", () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    const { getByText } = render(
      <PublisherSignupSheet visible={true} onClose={onClose} onSuccess={onSuccess} />
    );

    fireEvent.press(getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});

import { Alert } from "react-native";