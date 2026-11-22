import * as LocalAuthentication from "expo-local-authentication";

import { authenticate, isAvailable } from "./biometrics";

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

const mockedHasHardware = LocalAuthentication.hasHardwareAsync as jest.Mock;
const mockedIsEnrolled = LocalAuthentication.isEnrolledAsync as jest.Mock;
const mockedAuthenticateAsync = LocalAuthentication.authenticateAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedHasHardware.mockResolvedValue(true);
  mockedIsEnrolled.mockResolvedValue(true);
});

describe("authenticate", () => {
  it("passes the action-specific prompt through and returns success", async () => {
    mockedAuthenticateAsync.mockResolvedValue({ success: true });

    await expect(authenticate("Authenticate to lease this resource")).resolves.toBe("success");
    expect(mockedAuthenticateAsync).toHaveBeenCalledWith({
      promptMessage: "Authenticate to lease this resource",
    });
  });

  it("returns cancelled when the user dismisses the prompt", async () => {
    mockedAuthenticateAsync.mockResolvedValue({ success: false });

    await expect(authenticate("Authenticate to sign this transaction")).resolves.toBe("cancelled");
  });

  it("returns failed when the native prompt throws", async () => {
    mockedAuthenticateAsync.mockRejectedValue(new Error("lockout"));

    await expect(authenticate("Authenticate to sign this transaction")).resolves.toBe("failed");
  });

  it("returns unavailable without biometric hardware and never prompts", async () => {
    mockedHasHardware.mockResolvedValue(false);

    await expect(authenticate("Authenticate to sign this transaction")).resolves.toBe("unavailable");
    expect(mockedAuthenticateAsync).not.toHaveBeenCalled();
  });

  it("returns unavailable when no biometrics are enrolled", async () => {
    mockedIsEnrolled.mockResolvedValue(false);

    await expect(authenticate("Authenticate to sign this transaction")).resolves.toBe("unavailable");
    expect(mockedAuthenticateAsync).not.toHaveBeenCalled();
  });

  it("returns unavailable when the native module rejects the capability probe", async () => {
    mockedHasHardware.mockRejectedValue(new Error("module missing"));

    await expect(authenticate("Authenticate to sign this transaction")).resolves.toBe("unavailable");
    expect(mockedAuthenticateAsync).not.toHaveBeenCalled();
  });
});

describe("isAvailable", () => {
  it("reports availability from hardware and enrollment", async () => {
    await expect(isAvailable()).resolves.toBe(true);
    mockedIsEnrolled.mockResolvedValue(false);
    await expect(isAvailable()).resolves.toBe(false);
  });

  it("never throws when the native module is unavailable", async () => {
    mockedHasHardware.mockRejectedValue(new Error("module missing"));
    await expect(isAvailable()).resolves.toBe(false);
  });
});
