import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import {
  areHapticsEnabled,
  hapticError,
  hapticImpact,
  hapticSuccess,
  setHapticsEnabled,
} from "./haptics";

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("is enabled by default and fires the requested feedback", async () => {
  expect(await areHapticsEnabled()).toBe(true);

  await hapticSuccess();
  await hapticError();
  await hapticImpact();

  expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
});

it("respects the Settings toggle", async () => {
  await setHapticsEnabled(false);
  expect(await areHapticsEnabled()).toBe(false);

  await hapticSuccess();
  await hapticError();
  await hapticImpact();

  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
});

it("is a no-op on web", async () => {
  jest.replaceProperty(Platform, "OS", "web");

  await hapticSuccess();
  await hapticImpact();

  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
});
