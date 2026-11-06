import { groupKey, isRestorableUrl, isWhitelisted, siteKey } from "./domain.js";

const HOUR_MS = 60 * 60 * 1000;

export function effectiveLastAccessed(tab, installedAt) {
  const lastAccessed = Number(tab.lastAccessed) || 0;
  const installed = Number(installedAt) || 0;
  return Math.max(lastAccessed, installed);
}

function canClose(tab, settings, now, idleMs) {
  if (!tab?.id || tab.incognito || tab.pinned || tab.active || tab.audible || tab.highlighted) return false;
  if (tab.status === "loading") return false;
  if (!isRestorableUrl(tab.url)) return false;
  if (isWhitelisted(tab.url, settings.whitelist)) return false;
  const lastUsed = effectiveLastAccessed(tab, settings.installedAt);
  if (!lastUsed) return false;
  return now - lastUsed >= idleMs;
}

export function inspectIdle(tabs, settings, now, { force = false } = {}) {
  if (!settings.autoCloseEnabled && !force) return { eligible: [], toClose: [] };
  const idleMs = settings.inactiveHours * HOUR_MS;
  const eligible = (Array.isArray(tabs) ? tabs : [])
    .filter((tab) => canClose(tab, settings, now, idleMs))
    .sort((a, b) => effectiveLastAccessed(a, settings.installedAt) - effectiveLastAccessed(b, settings.installedAt));
  const budget = Math.max(0, (Array.isArray(tabs) ? tabs.length : 0) - settings.minOpenTabs);
  const room = force ? budget : Math.min(budget, settings.maxClosePerSweep);
  return { eligible, toClose: eligible.slice(0, room) };
}

export function planWindowLayout(tabs, settings) {
  const ordered = [...(Array.isArray(tabs) ? tabs : [])].sort((a, b) => a.index - b.index);
  if (!settings.autoSortEnabled) return { order: ordered.map((tab) => tab.id), groups: [] };

  const pinned = ordered.filter((tab) => tab.pinned);
  const rest = ordered
    .filter((tab) => !tab.pinned && !tab.incognito)
    .sort((a, b) => {
      const left = groupKey(a.url) || "\uffff";
      const right = groupKey(b.url) || "\uffff";
      if (left !== right) return left.localeCompare(right, "en");
      const leftHost = siteKey(a.url);
      const rightHost = siteKey(b.url);
      if (leftHost !== rightHost) return leftHost.localeCompare(rightHost, "en");
      return String(a.title || "").localeCompare(String(b.title || ""), "en");
    });

  const groups = [];
  if (settings.groupByDomain) {
    let current = null;
    const pushCurrent = () => {
      if (current && current.tabIds.length >= 2) groups.push(current);
    };
    for (const tab of rest) {
      const site = groupKey(tab.url);
      if (!site) {
        pushCurrent();
        current = null;
        continue;
      }
      if (!current || current.site !== site) {
        pushCurrent();
        current = { site, tabIds: [tab.id] };
      } else {
        current.tabIds.push(tab.id);
      }
    }
    pushCurrent();
  }

  return { order: [...pinned, ...rest].map((tab) => tab.id), groups };
}
