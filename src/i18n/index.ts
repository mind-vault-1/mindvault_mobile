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
const RTL_LANGUAGE_PREFIXES = new Set(["ar", "dv", "fa", "he", "ku", "ps", "sd", "ur", "yi"]);

export type LayoutDirectionPreference = "system" | "ltr" | "rtl";
export const DIRECTION_STORAGE_KEY = "@mindvault_layout_direction";

let directionPreference: LayoutDirectionPreference = "system";
let resolvedIsRtl = false;

function rtlFromLocale(locale: string): boolean {
  const primary = locale.split(/[-_]/)[0]?.toLowerCase() ?? "";
  return RTL_LANGUAGE_PREFIXES.has(primary);
}

export function isRtlLocale(locale: string): boolean {
  return rtlFromLocale(locale);
}

export function isCurrentLocaleRtl(): boolean {
  return resolvedIsRtl;
}

export function getDirectionPreference(): LayoutDirectionPreference {
  return directionPreference;
}

export function resolveIsRtl(locale: string, pref: LayoutDirectionPreference = directionPreference): boolean {
  if (pref === "rtl") return true;
  if (pref === "ltr") return false;
  return rtlFromLocale(locale);
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
    // Keep English strings as the fallback while preserving the device's RTL
    // formatting direction for languages not translated yet.
    if (code && RTL_LANGUAGE_PREFIXES.has(code)) {
      return { language: DEFAULT_LANGUAGE, formatLocale: locale.languageTag || code };
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
resolvedIsRtl = resolveIsRtl(current.formatLocale);
const listeners = new Set<() => void>();

function apply(next: ResolvedLocale, nextDirection: LayoutDirectionPreference = directionPreference) {
  const previous = current;
  const previousRtl = resolvedIsRtl;
  current = next;
  directionPreference = nextDirection;
  resolvedIsRtl = resolveIsRtl(next.formatLocale, nextDirection);
  i18n.locale = next.language;
  const changed =
    previous.language !== current.language ||
    previous.formatLocale !== current.formatLocale ||
    previousRtl !== resolvedIsRtl;
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
  const next = isSupportedLanguage(language)
    ? { language, formatLocale: locale }
    : { language: DEFAULT_LANGUAGE, formatLocale: locale || DEFAULT_LANGUAGE };
  apply(next);
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

/** Applies and persists the layout direction override. */
export async function setDirectionPreference(next: LayoutDirectionPreference): Promise<void> {
  directionPreference = next;
  apply(resolveLocale(preference), next);
  if (next === "system") await AsyncStorage.removeItem(DIRECTION_STORAGE_KEY);
  else await AsyncStorage.setItem(DIRECTION_STORAGE_KEY, next);
}

/** Restores the saved language and layout direction choices. */
export async function loadLanguagePreference(): Promise<LanguagePreference> {
  let saved: string | null = null;
  let savedDirection: string | null = null;
  try {
    [saved, savedDirection] = await Promise.all([
      AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
      AsyncStorage.getItem(DIRECTION_STORAGE_KEY),
    ]);
  } catch {
    saved = null;
    savedDirection = null;
  }
  const nextDirection: LayoutDirectionPreference =
    savedDirection === "ltr" || savedDirection === "rtl" ? savedDirection : "system";
  if (savedDirection !== null && nextDirection === "system") {
    try { await AsyncStorage.removeItem(DIRECTION_STORAGE_KEY); } catch { /* ignore */ }
  }
  preference = isLanguagePreference(saved) ? saved : "system";
  apply(resolveLocale(preference), nextDirection);
  return preference;
}

/** Re-resolves "system" after the device language changes (e.g. on foreground). */
export function refreshSystemLanguage(): void {
  if (preference === "system") apply(systemLocale(), directionPreference);
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

const getLayoutDirectionSnapshot = () => ({ isRtl: resolvedIsRtl, preference: directionPreference });
let layoutDirectionSnapshot = getLayoutDirectionSnapshot();
const getLayoutDirection = () => {
  const next = getLayoutDirectionSnapshot();
  if (next.isRtl !== layoutDirectionSnapshot.isRtl || next.preference !== layoutDirectionSnapshot.preference) {
    layoutDirectionSnapshot = next;
  }
  return layoutDirectionSnapshot;
};

export function useLayoutDirection(): { isRtl: boolean; preference: LayoutDirectionPreference } {
  return useSyncExternalStore(subscribeLocale, getLayoutDirection, getLayoutDirection);
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
