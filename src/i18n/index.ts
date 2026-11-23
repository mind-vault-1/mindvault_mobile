import { getLocales } from "expo-localization";
import { I18n } from "i18n-js";

import catalog from "./en/catalog.json";
import detail from "./en/detail.json";
import scanner from "./en/scanner.json";

export type TranslationKey =
  | keyof typeof catalog
  | keyof typeof detail
  | keyof typeof scanner;

type Variables = Record<string, string | number>;

const translations = {
  ...catalog,
  ...detail,
  ...scanner,
};

const i18n = new I18n({ en: translations });
i18n.enableFallback = true;
i18n.defaultSeparator = "|";
i18n.placeholder = /\{(.*?)\}/g;
i18n.defaultLocale = "en";
i18n.locale = getLocales()[0]?.languageCode ?? "en";

/** Typed translation helper for namespaced app strings. */
export function t(key: TranslationKey, variables?: Variables): string {
  if (!variables) return i18n.t(key) as string;
  return i18n.t(key, variables) as string;
}

export function setLocale(locale: string): void {
  i18n.locale = locale;
}
