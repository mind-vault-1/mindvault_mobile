import { getLocales } from "expo-localization";
import { I18n } from "i18n-js";

import catalog from "./en/catalog.json";

export type TranslationKey = keyof typeof catalog;

type Variables = Record<string, string | number>;

const i18n = new I18n({ en: catalog });
i18n.enableFallback = true;
i18n.defaultSeparator = "|";
i18n.placeholder = /\{(.*?)\}/g;
i18n.defaultLocale = "en";
i18n.locale = getLocales()[0]?.languageCode ?? "en";

/** Typed translation helper for namespaced Catalog strings. */
export function t(key: TranslationKey, variables?: Variables): string {
  if (!variables) return i18n.t(key) as string;
  return i18n.t(key, variables) as string;
}

export function setLocale(locale: string): void {
  i18n.locale = locale;
}
