import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { I18n } from "i18n-js";
import { useSyncExternalStore } from "react";

import catalog from "./en/catalog.json";
import detail from "./en/detail.json";
import modals from "./en/modals.json";
import publisher from "./en/publisher.json";
import scanner from "./en/scanner.json";
import settings from "./en/settings.json";
import frCatalog from "./fr/catalog.json";
import frDetail from "./fr/detail.json";
import frModals from "./fr/modals.json";
import frPublisher from "./fr/publisher.json";
import frScanner from "./fr/scanner.json";
import frSettings from "./fr/settings.json";

export type TranslationKey =
  | keyof typeof catalog
  | keyof typeof detail
  | keyof typeof modals
  | keyof typeof publisher
  | keyof typeof scanner
  | keyof typeof settings;

type Variables = Record<string, string | number>;

/** English is the source of truth; every other language must have the same keys. */
export const translations = {
  en: { ...catalog, ...detail, ...modals, ...publisher, ...scanner, ...settings },
  fr: { ...frCatalog, ...frDetail, ...frModals, ...frPublisher, ...frScanner, ...frSettings },
};

export const SUPPORTED_LANGUAGES = ["en", "fr"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
/** "system" follows the device language when it is supported, else English. */
export type LanguagePreference = "system" | Language;

export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_STORAGE_KEY = "@mindvault_language";
/** Each language's name in that language, as shown in the picker. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", fr: "Français" };

/** BCP-47 language prefixes whose scripts flow from right to left. */
const RTL_LANGUAGE_PREFIXES = new Set(["ar", "fa", "he", "ur"]);

export function isRtlLocale(locale: string): boolean {
  return RTL_LANGUAGE_PREFIXES.has(locale.split(/[-_]/)[0]?.toLowerCase() ?? "");
}

export function isCurrentLocaleRtl(): boolean {
  return isRtlLocale(current.formatLocale);
}

const i18n = new I18n(translations);
i18n.enableFallback = true;
i18n.defaultSeparator = "|";
i18n.placeholder = /\{(.*?)\}/g;
i18n.defaultLocale = DEFAULT_LANGUAGE;

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "system" || isSupportedLanguage(value);
}

interface ResolvedLocale {
  language: Language;
  /** BCP 47 tag used for dates and numbers, e.g. "fr-CA". */
  formatLocale: string;
}

/** The first device locale the app has a translation for, else English. */
function systemLocale(): ResolvedLocale {
  let locales: ReturnType<typeof getLocales> = [];
  try {
    locales = getLocales() ?? [];
  } catch {
    locales = [];
  }
  for (const locale of locales) {
    const code = locale.languageCode?.toLowerCase();
    if (isSupportedLanguage(code)) {
      return { language: code, formatLocale: locale.languageTag || code };
    }
  }
  return { language: DEFAULT_LANGUAGE, formatLocale: DEFAULT_LANGUAGE };
}

export function resolveLocale(preference: LanguagePreference): ResolvedLocale {
  if (preference === "system") return systemLocale();
  // Keep the device region when it matches the chosen language (fr-CA stays fr-CA).
  const device = systemLocale();
  return {
    language: preference,
    formatLocale: device.language === preference ? device.formatLocale : preference,
  };
}

let preference: LanguagePreference = "system";
let current: ResolvedLocale = systemLocale();
i18n.locale = current.language;
const listeners = new Set<() => void>();

function apply(next: ResolvedLocale) {
  const changed =
    next.language !== current.language || next.formatLocale !== current.formatLocale;
  current = next;
  i18n.locale = next.language;
  if (changed) listeners.forEach((listener) => listener());
}

/** Typed translation helper for namespaced app strings. */
export function t(key: TranslationKey, variables?: Variables): string {
  if (!variables) return i18n.t(key) as string;
  return i18n.t(key, variables) as string;
}

/** Switches the language for this session only (tests, previews). */
export function setLocale(locale: string): void {
  const language = locale.split(/[-_]/)[0]?.toLowerCase();
  apply(
    isSupportedLanguage(language)
      ? { language, formatLocale: locale }
      : { language: DEFAULT_LANGUAGE, formatLocale: DEFAULT_LANGUAGE }
  );
}

export function getLanguage(): Language {
  return current.language;
}

/** The BCP 47 tag dates and numbers are formatted with. */
export function getFormatLocale(): string {
  return current.formatLocale;
}

export function getLanguagePreference(): LanguagePreference {
  return preference;
}

/** Applies a language choice without saving it. */
export function applyLanguagePreference(next: LanguagePreference): void {
  preference = next;
  apply(resolveLocale(next));
}

/** Applies and persists the user's language choice. */
export async function setLanguagePreference(next: LanguagePreference): Promise<void> {
  applyLanguagePreference(next);
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next);
}

/** Restores the saved language choice; unreadable or unknown values mean "system". */
export async function loadLanguagePreference(): Promise<LanguagePreference> {
  let saved: string | null = null;
  try {
    saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    saved = null;
  }
  applyLanguagePreference(isLanguagePreference(saved) ? saved : "system");
  return preference;
}

/** Re-resolves "system" after the device language changes (e.g. on foreground). */
export function refreshSystemLanguage(): void {
  if (preference === "system") apply(systemLocale());
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders the caller whenever the app language or format locale changes. */
export function useLocale(): string {
  return useSyncExternalStore(subscribeLocale, getFormatLocale, getFormatLocale);
}

/** Re-renders the caller when the saved language choice changes. */
export function useLanguagePreference(): LanguagePreference {
  return useSyncExternalStore(subscribeLocale, getLanguagePreference, getLanguagePreference);
}

// ---------------------------------------------------------------------------
// Locale-aware formatting. Always use these instead of `toLocaleString()` so
// dates and numbers follow the language chosen in Settings, not just the device.
// ---------------------------------------------------------------------------

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getFormatLocale(), options).format(value);
}

export function formatDate(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(getFormatLocale(), options).format(date);
}

export function formatDateTime(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }
): string {
  return formatDate(value, options);
}

export function formatTime(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { timeStyle: "short" }
): string {
  return formatDate(value, options);
}

export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options: Intl.RelativeTimeFormatOptions = { numeric: "auto" }
): string {
  return new Intl.RelativeTimeFormat(getFormatLocale(), options).format(value, unit);
}
