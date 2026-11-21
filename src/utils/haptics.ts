import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const HAPTICS_ENABLED_KEY = "@mindvault_haptics_enabled";

export async function areHapticsEnabled(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const raw = await AsyncStorage.getItem(HAPTICS_ENABLED_KEY);
  return raw !== "false";
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(HAPTICS_ENABLED_KEY, enabled ? "true" : "false");
}

async function isEnabled(): Promise<boolean> {
  return areHapticsEnabled();
}

export async function hapticSuccess(): Promise<void> {
  if (await isEnabled()) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export async function hapticError(): Promise<void> {
  if (await isEnabled()) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

export async function hapticImpact(): Promise<void> {
  if (await isEnabled()) await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
