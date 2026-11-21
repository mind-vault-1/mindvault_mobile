import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

const PUBLISH_CHANNEL = "publish-status";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Configure local publish notifications. Android uses a dedicated channel;
 * iOS only needs the runtime permission request made when a publish finishes.
 */
export async function setupNotifications(): Promise<() => void> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(PUBLISH_CHANNEL, {
      name: "Publish status",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const openNotificationLink = (response: Notifications.NotificationResponse) => {
    const url = response.notification.request.content.data?.url;
    if (typeof url === "string") void Linking.openURL(url);
  };

  const subscription = Notifications.addNotificationResponseReceivedListener(openNotificationLink);
  const lastResponse = await Notifications.getLastNotificationResponseAsync();
  if (lastResponse) openNotificationLink(lastResponse);

  return () => subscription.remove();
}

export async function notifyPublishComplete(
  resourceId: string,
  status: "on-chain" | "rejected"
): Promise<boolean> {
  if (!(await requestPermission())) return false;

  const successful = status === "on-chain";
  await Notifications.scheduleNotificationAsync({
    content: {
      title: successful ? "Publish complete" : "Publish rejected",
      body: successful
        ? "Your resource is now available in MindVault."
        : "MindVault could not verify your published resource.",
      data: { url: `mindvault://resources/${encodeURIComponent(resourceId)}` },
    },
    trigger: null,
  });
  return true;
}
