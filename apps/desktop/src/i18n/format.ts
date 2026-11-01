import { i18n } from "@lingui/core";
import {
  format as dateFormat,
  formatDistanceToNow as distance,
  type FormatDistanceToNowOptions,
  type FormatOptions,
} from "date-fns";
import { enUS, ru } from "date-fns/locale";

export function formatDistanceToNow(
  date: Date,
  options?: FormatDistanceToNowOptions,
) {
  return distance(date, {
    ...options,
    locale: i18n.locale === "ru" ? ru : enUS,
  });
}

export function format(
  date: Parameters<typeof dateFormat>[0],
  pattern: string,
  options?: FormatOptions,
) {
  const locale = i18n.locale === "ru" ? ru : enUS;
  const localizedPattern =
    i18n.locale === "ru"
      ? pattern
          .replace("MMMM yyyy", "LLLL yyyy")
          .replace("MMM d, yyyy", "d MMM yyyy")
          .replace("MMM d", "d MMM")
      : pattern;
  return dateFormat(date, localizedPattern, { ...options, locale });
}

export function safeFormat(value: unknown, pattern: string, fallback = "") {
  if (
    !(
      typeof value === "string" ||
      typeof value === "number" ||
      value instanceof Date
    )
  )
    return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, pattern);
}
