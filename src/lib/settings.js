import { ruleFromInput } from "./domain.js";

export const DEFAULT_SETTINGS = Object.freeze({
  autoCloseEnabled: true,
  inactiveHours: 48,
  minOpenTabs: 12,
  maxClosePerSweep: 5,
  autoSortEnabled: true,
  groupByDomain: true,
  archiveEnabled: true,
  archiveLimit: 400,
  whitelist: Object.freeze([]),
  installedAt: 0,
});

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function normalizeWhitelist(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  const rules = [];
  for (const item of source) {
    const rule = ruleFromInput(item);
    if (rule && !rules.includes(rule)) rules.push(rule);
  }
  return rules;
}

export function normalizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    autoCloseEnabled: source.autoCloseEnabled !== undefined ? Boolean(source.autoCloseEnabled) : DEFAULT_SETTINGS.autoCloseEnabled,
    inactiveHours: clampInt(source.inactiveHours, 1, 720, DEFAULT_SETTINGS.inactiveHours),
    minOpenTabs: clampInt(source.minOpenTabs, 0, 200, DEFAULT_SETTINGS.minOpenTabs),
    maxClosePerSweep: clampInt(source.maxClosePerSweep, 1, 25, DEFAULT_SETTINGS.maxClosePerSweep),
    autoSortEnabled: source.autoSortEnabled !== undefined ? Boolean(source.autoSortEnabled) : DEFAULT_SETTINGS.autoSortEnabled,
    groupByDomain: source.groupByDomain !== undefined ? Boolean(source.groupByDomain) : DEFAULT_SETTINGS.groupByDomain,
    archiveEnabled: source.archiveEnabled !== undefined ? Boolean(source.archiveEnabled) : DEFAULT_SETTINGS.archiveEnabled,
    archiveLimit: clampInt(source.archiveLimit, 50, 1000, DEFAULT_SETTINGS.archiveLimit),
    whitelist: normalizeWhitelist(source.whitelist !== undefined ? source.whitelist : DEFAULT_SETTINGS.whitelist),
    installedAt: Number.isFinite(Number(source.installedAt)) && Number(source.installedAt) > 0 ? Number(source.installedAt) : 0,
  };
}
