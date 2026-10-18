import { Share } from "react-native";

export type ShareOutcome = "shared" | "dismissed" | "error";

/**
 * Shares a resource title + URL through the native share sheet.
 *
 * Uses React Native's `Share` (which accepts remote URLs on both platforms),
 * unlike `expo-sharing`, which only handles local files.
 *
 * A cancelled/dismissed share is reported as `"dismissed"`, not an error —
 * only a genuine failure returns `"error"`.
 */
export async function shareResource(title: string, url: string): Promise<ShareOutcome> {
  try {
    const result = await Share.share({
      title,
      message: `${title}\n${url}`,
      url,
    });

    if (result.action === Share.dismissedAction) {
      return "dismissed";
    }
    return "shared";
  } catch {
    return "error";
  }
}
