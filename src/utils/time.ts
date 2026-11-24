import { getFormatLocale } from "../i18n";

export function getRelativeTimeString(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat(getFormatLocale(), { numeric: "auto" });

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (Math.abs(diffSec) < 60) {
    return rtf.format(diffSec, "second");
  } else if (Math.abs(diffMin) < 60) {
    return rtf.format(diffMin, "minute");
  } else if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  } else if (Math.abs(diffDays) < 7) {
    return rtf.format(diffDays, "day");
  } else {
    return rtf.format(diffWeeks, "week");
  }
}
