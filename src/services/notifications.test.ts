import * as Notifications from "expo-notifications";
import { Linking } from "react-native";

import { notifyPublishComplete, setupNotifications } from "./notifications";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("notification-id"),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationHandler: jest.fn(),
}));

jest.mock("react-native", () => ({
  Linking: { openURL: jest.fn().mockResolvedValue(undefined) },
  Platform: { OS: "ios" },
}));

const mockedNotifications = Notifications as jest.Mocked<typeof Notifications>;

beforeEach(() => jest.clearAllMocks());

it("schedules a publish notification with a resource deep link", async () => {
  await expect(notifyPublishComplete("resource-1", "on-chain")).resolves.toBe(true);

  expect(mockedNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.objectContaining({
        title: "Publish complete",
        data: { url: "mindvault://resources/resource-1" },
      }),
      trigger: null,
    })
  );
});

it("opens the deep link when a notification is tapped", async () => {
  const response = {
    notification: { request: { content: { data: { url: "mindvault://resources/resource-1" } } } },
  } as unknown as Notifications.NotificationResponse;
  mockedNotifications.getLastNotificationResponseAsync.mockResolvedValue(response);

  const dispose = await setupNotifications();

  expect(Linking.openURL).toHaveBeenCalledWith("mindvault://resources/resource-1");
  expect(typeof dispose).toBe("function");
});
