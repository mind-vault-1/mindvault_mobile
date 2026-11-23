import { setLocale, t } from "./index";

describe("i18n", () => {
  beforeEach(() => setLocale("en"));

  it("returns the English catalog strings", () => {
    expect(t("app.title")).toBe("MindVault");
    expect(t("catalog.searchPlaceholder")).toBe("Search resources…");
  });

  it("returns detail, scanner, settings and publisher strings", () => {
    expect(t("detail.resourceSubtitle")).toBe("Resource");
    expect(t("scanner.permissionRequired")).toBe("Camera access is required");
    expect(t("settings.title")).toBe("Settings");
    expect(t("publisher.title")).toBe("Publisher Resources");
  });

  it("interpolates variables and pluralisation", () => {
    expect(t("catalog.searchSaved", { name: "Handbook" })).toBe(
      'Search "Handbook" saved successfully'
    );
    expect(t("detail.publishedBy", { publisherName: "MindVault" })).toBe(
      "Published by MindVault"
    );
    expect(t("settings.minutesLabel", { minutes: 1, suffix: "" })).toBe(
      "1 minute"
    );
    expect(t("settings.minutesLabel", { minutes: 5, suffix: "s" })).toBe(
      "5 minutes"
    );
    expect(t("publisher.bulkDelisted", { count: 3, suffix: "s" })).toBe(
      "Delisted 3 resources"
    );
  });
});
