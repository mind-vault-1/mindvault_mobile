import { setLocale, t } from "./index";

describe("i18n", () => {
  beforeEach(() => setLocale("en"));

  it("returns the English catalog strings", () => {
    expect(t("app.title")).toBe("MindVault");
    expect(t("catalog.searchPlaceholder")).toBe("Search resources…");
  });

  it("interpolates variables", () => {
    expect(t("catalog.searchSaved", { name: "Handbook" })).toBe(
      'Search "Handbook" saved successfully'
    );
  });
});
