import { isRestorableUrl, siteKey } from "./domain.js";

function cleanEntry(item) {
  if (!item || !isRestorableUrl(item.url)) return null;
  const closedAt = Number(item.closedAt) || Date.now();
  return {
    id: String(item.id || `${closedAt}:${item.url}`),
    url: item.url,
    title: String(item.title || item.url).slice(0, 300),
    domain: siteKey(item.url),
    closedAt,
    reason: item.reason === "auto" ? "auto" : "manual",
  };
}

export function normalizeArchive(value, limit = 400) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  const cap = Math.max(1, limit);
  for (const item of value) {
    const entry = cleanEntry(item);
    if (!entry || seen.has(entry.url)) continue;
    seen.add(entry.url);
    result.push(entry);
    if (result.length >= cap) break;
  }
  return result;
}

export function rememberEntry(existing, entry, limit) {
  return normalizeArchive([entry, ...(Array.isArray(existing) ? existing : [])], limit);
}

export function forgetEntry(existing, id, limit = 1000) {
  return normalizeArchive(existing, limit).filter((item) => item.id !== id);
}
