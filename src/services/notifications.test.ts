import { Linking } from "react-native";
import * as Notifications from "expo-notifications";

import {
  notifyPublishResult,
  registerPublishNotificationLinks,
  requestPublishNotificationsPermission,
  resourceDeepLink,
} from "./notifications";

jest.mock("expo-notifications", () => ({
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));

const getPermissions = Notifications.getPermissionsAsync as jest.MockedFunction<
  typeof Notifications.getPermissionsAsync
>;
const requestPermissions = Notifications.requestPermissionsAsync as jest.MockedFunction<
  typeof Notifications.requestPermissionsAsync
>;
const schedule = Notifications.scheduleNotificationAsync as jest.MockedFunction<
  typeof Notifications.scheduleNotificationAsync
>;
const addListener = Notifications.addNotificationResponseReceivedListener as jest.MockedFunction<
  typeof Notifications.addNotificationResponseReceivedListener
>;

function permission(
  overrides: Partial<Notifications.NotificationPermissionsStatus> = {}
): Notifications.NotificationPermissionsStatus {
  return {
    granted: true,
    canAskAgain: true,
    status: 1,
    expires: null,
    ...overrides,
  } as unknown as Notifications.NotificationPermissionsStatus;
}

beforeEach(() => {
  jest.clearAllMocks();
  getPermissions.mockResolvedValue(permission());
  requestPermissions.mockResolvedValue(permission());
  schedule.mockResolvedValue("notification-id");
});

describe("notification permissions", () => {
  it("does not prompt when alerts are already allowed", async () => {
    await expect(requestPublishNotificationsPermission()).resolves.toBe(true);
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(Notifications.setNotificationHandler).toHaveBeenCalled();
  });

  it("allows provisional iOS notifications", async () => {
    getPermissions.mockResolvedValue(
      permission({ granted: false, ios: { status: 3 } as never })
    );
    await expect(requestPublishNotificationsPermission()).resolves.toBe(true);
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("prompts only when permission can still be asked", async () => {
    getPermissions.mockResolvedValue(permission({ granted: false }));
    await expect(requestPublishNotificationsPermission()).resolves.toBe(true);
    expect(requestPermissions).toHaveBeenCalledWith({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
  });

  it("gives up when permission was denied permanently", async () => {
    getPermissions.mockResolvedValue(permission({ granted: false, canAskAgain: false }));
    await expect(requestPublishNotificationsPermission()).resolves.toBe(false);
    expect(requestPermissions).not.toHaveBeenCalled();
  });
});

describe("notifyPublishResult", () => {
  it("schedules an immediate on-chain notification with the deep link", async () => {
    await expect(notifyPublishResult("res-1", "on-chain")).resolves.toBe(true);
    expect(schedule).toHaveBeenCalledWith({
      content: {
        title: "Resource published",
        body: "Your resource is live on-chain. Tap to view it.",
        data: { resourceId: "res-1", url: "mindvault://resources/res-1" },
      },
      trigger: null,
    });
  });

  it("schedules a rejection notification", async () => {
    await notifyPublishResult("res 2", "rejected");
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Publishing needs attention",
          data: { resourceId: "res 2", url: "mindvault://resources/res%202" },
        }),
      })
    );
  });

  it("does not schedule when notifications are unavailable", async () => {
    getPermissions.mockResolvedValue(permission({ granted: false, canAskAgain: false }));
    await expect(notifyPublishResult("res-1", "on-chain")).resolves.toBe(false);
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe("registerPublishNotificationLinks", () => {
  it("opens the resource route when a publish notification is tapped", () => {
    const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const remove = jest.fn();
    addListener.mockReturnValue({ remove });

    const unsubscribe = registerPublishNotificationLinks();
    const listener = addListener.mock.calls[0][0];
    listener({
      notification: { request: { content: { data: { resourceId: "res-1" } } } },
      actionIdentifier: "default",
    } as never);

    expect(openUrl).toHaveBeenCalledWith(resourceDeepLink("res-1"));
    unsubscribe();
    expect(remove).toHaveBeenCalled();
    openUrl.mockRestore();
  });

  it("ignores notifications that are not about a resource", () => {
    const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    addListener.mockReturnValue({ remove: jest.fn() });
    registerPublishNotificationLinks();

    addListener.mock.calls[0][0]({
      notification: { request: { content: { data: {} } } },
      actionIdentifier: "default",
    } as never);

    expect(openUrl).not.toHaveBeenCalled();
    openUrl.mockRestore();
  });
});
