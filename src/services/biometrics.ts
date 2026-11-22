import * as LocalAuthentication from "expo-local-authentication";

/**
 * Device-owner biometric re-authentication for sensitive actions.
 *
 * `authenticate()` never throws: callers get one of four outcomes and decide
 * how to proceed. Devices without biometric hardware or without enrolled
 * biometrics report `unavailable` so the caller can fall back to its own
 * credential flow.
 */

export type BiometricOutcome = "success" | "cancelled" | "failed" | "unavailable";

/** Whether a biometric prompt can be shown at all on this device. */
export async function isAvailable(): Promise<boolean> {
  try {
    return (
      (await LocalAuthentication.hasHardwareAsync()) &&
      (await LocalAuthentication.isEnrolledAsync())
    );
  } catch {
    return false;
  }
}

/**
 * Prompts for biometrics with an action-specific `promptMessage`
 * (e.g. "Authenticate to lease this resource").
 */
export async function authenticate(promptMessage: string): Promise<BiometricOutcome> {
  if (!(await isAvailable())) return "unavailable";

  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage });
    return result.success ? "success" : "cancelled";
  } catch {
    return "failed";
  }
}
