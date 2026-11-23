import { setLocale, t } from "./index";

describe("i18n", () => {
  beforeEach(() => setLocale("en"));

  it("returns the English catalog strings", () => {
    expect(t("app.title")).toBe("MindVault");
    expect(t("catalog.searchPlaceholder")).toBe("Search resources…");
  });

  it("returns detail and scanner strings", () => {
    expect(t("detail.resourceSubtitle")).toBe("Resource");
    expect(t("scanner.permissionRequired")).toBe("Camera access is required");
  });

  it("interpolates variables", () => {
    expect(t("catalog.searchSaved", { name: "Handbook" })).toBe(
      'Search "Handbook" saved successfully'
    );
    expect(t("detail.publishedBy", { publisherName: "MindVault" })).toBe(
      "Published by MindVault"
    );
  });
});
