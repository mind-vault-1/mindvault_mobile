import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";
import { getLocales } from "expo-localization";
import fs from "fs";
import path from "path";

import {
  applyLanguagePreference,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  getFormatLocale,
  getLanguage,
  getLanguagePreference,
  isCurrentLocaleRtl,
  isRtlLocale,
  LANGUAGE_STORAGE_KEY,
  loadLanguagePreference,
  refreshSystemLanguage,
  resolveLocale,
  setLanguagePreference,
  setLocale,
  t,
  translations,
  useLanguagePreference,
  useLocale,
} from "./index";

jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [{ languageCode: "en", languageTag: "en-US" }]),
}));

const mockedGetLocales = getLocales as jest.Mock;

function deviceLocales(...tags: string[]) {
  mockedGetLocales.mockReturnValue(
    tags.map((tag) => ({ languageTag: tag, languageCode: tag.split("-")[0] }))
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  deviceLocales("en-US");
  applyLanguagePreference("system");
});

describe("i18n", () => {
  beforeEach(() => setLocale("en"));

  it("returns the English catalog strings", () => {
    expect(t("app.title")).toBe("MindVault");
    expect(t("catalog.searchPlaceholder")).toBe("Search resources…");
  });

  it("returns detail, scanner, settings, publisher and modal strings", () => {
    expect(t("detail.resourceSubtitle")).toBe("Resource");
    expect(t("scanner.permissionRequired")).toBe("Camera access is required");
    expect(t("settings.title")).toBe("Settings");
    expect(t("publisher.title")).toBe("Publisher Resources");
    expect(t("modals.sign.title")).toBe("Sign transaction");
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

  it("recognises right-to-left locale prefixes", () => {
    expect(isRtlLocale("ar-SA")).toBe(true);
    expect(isRtlLocale("he")).toBe(true);
    expect(isRtlLocale("en-US")).toBe(false);
    deviceLocales("ar-SA");
    applyLanguagePreference("system");
    expect(isCurrentLocaleRtl()).toBe(true);
  });
});

describe("French translation", () => {
  const namespaces = fs
    .readdirSync(path.join(__dirname, "en"))
    .filter((file) => file.endsWith(".json"));
  // Compared as sets: French may repeat one, e.g. "{suffix}" for agreement.
  const placeholders = (value: string) => [...new Set(value.match(/\{[^}]+\}/g) ?? [])].sort();

  it("exists for every English namespace", () => {
    expect(namespaces.length).toBeGreaterThan(0);
    for (const file of namespaces) {
      expect(fs.existsSync(path.join(__dirname, "fr", file))).toBe(true);
    }
  });

  it.each(
    fs.readdirSync(path.join(__dirname, "en")).filter((file) => file.endsWith(".json"))
  )("%s has the same keys and placeholders as English", (file) => {
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, "en", file), "utf8"));
    const fr = JSON.parse(fs.readFileSync(path.join(__dirname, "fr", file), "utf8"));
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      expect(typeof fr[key]).toBe("string");
      expect(fr[key].trim()).not.toBe("");
      expect({ key, placeholders: placeholders(fr[key]) }).toEqual({
        key,
        placeholders: placeholders(en[key]),
      });
    }
  });

  it("has the same merged key set as English", () => {
    expect(Object.keys(translations.fr).sort()).toEqual(Object.keys(translations.en).sort());
  });

  it("translates every namespace once French is selected", () => {
    setLocale("fr");
    expect(t("catalog.searchPlaceholder")).toBe("Rechercher des ressources…");
    expect(t("detail.open")).toBe("Ouvrir");
    expect(t("scanner.permissionRequired")).toBe("L'accès à l'appareil photo est requis");
    expect(t("settings.title")).toBe("Paramètres");
    expect(t("publisher.title")).toBe("Ressources de l'éditeur");
    expect(t("modals.paywall.payAndAccess")).toBe("Payer et accéder");
    expect(t("modals.paywall.typeToConfirm", { phrase: "CONFIRM", limit: "5" })).toBe(
      "Saisissez CONFIRM pour autoriser ce paiement au-delà de votre limite de 5 USDC."
    );
  });
});

describe("language preference", () => {
  it("follows a supported device language, else English", () => {
    deviceLocales("de-DE", "fr-CA");
    expect(resolveLocale("system")).toEqual({ language: "fr", formatLocale: "fr-CA" });
    deviceLocales("de-DE");
    expect(resolveLocale("system")).toEqual({ language: "en", formatLocale: "en" });
    mockedGetLocales.mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(resolveLocale("system")).toEqual({ language: "en", formatLocale: "en" });
  });

  it("keeps the device region only when it matches the chosen language", () => {
    deviceLocales("fr-CA");
    expect(resolveLocale("fr")).toEqual({ language: "fr", formatLocale: "fr-CA" });
    expect(resolveLocale("en")).toEqual({ language: "en", formatLocale: "en" });
  });

  it("persists the choice and restores it on the next launch", async () => {
    await setLanguagePreference("fr");
    expect(await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("fr");
    expect(getLanguage()).toBe("fr");

    applyLanguagePreference("system");
    expect(getLanguage()).toBe("en");

    await expect(loadLanguagePreference()).resolves.toBe("fr");
    expect(getLanguagePreference()).toBe("fr");
    expect(t("settings.title")).toBe("Paramètres");
  });

  it("falls back to System for missing, unknown or unreadable values", async () => {
    await expect(loadLanguagePreference()).resolves.toBe("system");
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, "klingon");
    await expect(loadLanguagePreference()).resolves.toBe("system");
    const getItem = jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("io"));
    await expect(loadLanguagePreference()).resolves.toBe("system");
    getItem.mockRestore();
  });

  it("re-resolves System after the device language changes", () => {
    applyLanguagePreference("system");
    deviceLocales("fr-FR");
    refreshSystemLanguage();
    expect(getLanguage()).toBe("fr");

    applyLanguagePreference("en");
    deviceLocales("fr-FR");
    refreshSystemLanguage();
    expect(getLanguage()).toBe("en");
  });

  it("re-renders subscribers when the language changes", () => {
    const { result } = renderHook(() => ({ locale: useLocale(), preference: useLanguagePreference() }));
    expect(result.current).toEqual({ locale: "en-US", preference: "system" });

    act(() => applyLanguagePreference("fr"));
    expect(result.current).toEqual({ locale: "fr", preference: "fr" });
  });
});

describe("locale-aware formatting", () => {
  const date = new Date(Date.UTC(2026, 0, 15, 12, 0));

  it("formats numbers per locale", () => {
    setLocale("en-US");
    expect(formatNumber(1234.5)).toBe("1,234.5");
    setLocale("fr-FR");
    // French groups with a narrow no-break space and uses a decimal comma.
    expect(formatNumber(1234.5).replace(/\s/g, " ")).toBe("1 234,5");
    expect(getFormatLocale()).toBe("fr-FR");
  });

  it("formats dates per locale", () => {
    setLocale("en-US");
    expect(formatDate(date, { dateStyle: "long", timeZone: "UTC" })).toBe("January 15, 2026");
    setLocale("fr-FR");
    expect(formatDate(date, { dateStyle: "long", timeZone: "UTC" })).toBe("15 janvier 2026");
    expect(formatDateTime(date.toISOString(), { dateStyle: "short", timeZone: "UTC" })).toBe("15/01/2026");
  });

  it("formats relative times per locale", () => {
    setLocale("en");
    expect(formatRelativeTime(-1, "day")).toBe("yesterday");
    setLocale("fr");
    expect(formatRelativeTime(-1, "day")).toBe("hier");
  });
});
