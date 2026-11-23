import { Linking } from "react-native";
import * as Notifications from "expo-notifications";

export const RESOURCE_LINK_PREFIX = "mindvault://resources/";

export type FinalPublishStatus = "on-chain" | "rejected";

let handlerConfigured = false;

function configureHandler() {
  if (handlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  handlerConfigured = true;
}

function allowsAlerts(permission: Notifications.NotificationPermissionsStatus): boolean {
  return (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function requestPublishNotificationsPermission(): Promise<boolean> {
  configureHandler();
  const current = await Notifications.getPermissionsAsync();
  if (allowsAlerts(current)) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return allowsAlerts(next);
}

export function resourceDeepLink(resourceId: string): string {
  return `${RESOURCE_LINK_PREFIX}${encodeURIComponent(resourceId)}`;
}

export async function notifyPublishResult(
  resourceId: string,
  status: FinalPublishStatus
): Promise<boolean> {
  if (!(await requestPublishNotificationsPermission())) return false;

  const content =
    status === "on-chain"
      ? {
          title: "Resource published",
          body: "Your resource is live on-chain. Tap to view it.",
        }
      : {
          title: "Publishing needs attention",
          body: "Verification was rejected. Tap to review the resource.",
        };

  await Notifications.scheduleNotificationAsync({
    content: { ...content, data: { resourceId, url: resourceDeepLink(resourceId) } },
    trigger: null,
  });
  return true;
}

export function registerPublishNotificationLinks(): () => void {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (typeof data.resourceId !== "string" || !data.resourceId) return;
    void Linking.openURL(resourceDeepLink(data.resourceId));
  }).remove;
}
