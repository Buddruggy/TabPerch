import { t } from "./i18n.js";

export function formatAgo(timestamp, now = Date.now()) {
  const then = Number(timestamp);
  const delta = Math.max(0, now - (Number.isFinite(then) ? then : now));
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return minutes === 1 ? t("minuteAgo") : t("minutesAgo", [minutes]);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? t("hourAgo") : t("hoursAgo", [hours]);
  const days = Math.round(hours / 24);
  return days <= 1 ? t("dayAgo") : t("daysAgo", [days]);
}
