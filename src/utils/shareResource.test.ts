import { Share } from "react-native";

import { shareResource } from "./shareResource";

describe("shareResource", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shares the title and URL and reports success", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });

    await expect(shareResource("Doc", "https://api.test/resources/1")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "Doc",
      message: "Doc\nhttps://api.test/resources/1",
      url: "https://api.test/resources/1",
    });
  });

  it("reports a cancelled share as dismissed, not an error", async () => {
    jest.spyOn(Share, "share").mockResolvedValue({ action: Share.dismissedAction });

    await expect(shareResource("Doc", "https://api.test/resources/1")).resolves.toBe("dismissed");
  });

  it("reports a failure as an error", async () => {
    jest.spyOn(Share, "share").mockRejectedValue(new Error("No activity found"));

    await expect(shareResource("Doc", "https://api.test/resources/1")).resolves.toBe("error");
  });
});
