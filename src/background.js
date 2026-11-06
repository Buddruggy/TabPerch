import { forgetEntry, normalizeArchive, rememberEntry } from "./lib/archive.js";
import { crowdThreshold, visibleSlotCount } from "./lib/crowd.js";
import { colorForDomain, groupKey, isRestorableUrl, siteKey } from "./lib/domain.js";
import { inspectIdle, planWindowLayout } from "./lib/decide.js";
import { normalizeSettings } from "./lib/settings.js";

const ALARM = "tabperch-sweep";
const CACHE_KEY = "tabCache";
const PATCHABLE = [
  "autoCloseEnabled",
  "inactiveHours",
  "minOpenTabs",
  "maxClosePerSweep",
  "autoSortEnabled",
  "groupByDomain",
  "archiveEnabled",
  "archiveLimit",
  "whitelist",
];

const autoClosing = new Set();
const collapsedState = new Map();
const freshTabIds = new Set();
let memoryCache = {};
let cacheReady = null;
let layoutTimer = 0;
let archiveQueue = Promise.resolve();
let organizing = false;

function enqueueArchive(work) {
  const run = archiveQueue.then(work, work);
  archiveQueue = run.then(() => undefined, () => undefined);
  return run;
}

function toSnap(tab) {
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index ?? 0,
    url: tab.url || "",
    title: tab.title || "",
    pinned: Boolean(tab.pinned),
    active: Boolean(tab.active),
    audible: Boolean(tab.audible),
    highlighted: Boolean(tab.highlighted),
    incognito: Boolean(tab.incognito),
    status: tab.status || "",
    groupId: typeof tab.groupId === "number" ? tab.groupId : -1,
    lastAccessed: typeof tab.lastAccessed === "number" ? tab.lastAccessed : 0,
  };
}

async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  let settings = normalizeSettings(stored.settings);
  if (!stored.settings || !settings.installedAt) {
    settings = { ...settings, installedAt: settings.installedAt || Date.now() };
    await chrome.storage.local.set({ settings });
  }
  return settings;
}

async function saveSettings(patch) {
  const current = await loadSettings();
  const next = normalizeSettings({ ...current, ...patch, installedAt: current.installedAt });
  await chrome.storage.local.set({ settings: next });
  return next;
}

async function loadArchive(limit) {
  const stored = await chrome.storage.local.get("archive");
  return normalizeArchive(stored.archive, limit);
}

async function ensureCache() {
  if (!cacheReady) {
    cacheReady = chrome.storage.session.get(CACHE_KEY).then((data) => {
      memoryCache = { ...memoryCache, ...(data[CACHE_KEY] || {}) };
    });
  }
  await cacheReady;
}

async function rememberTab(tab) {
  if (!tab?.id || tab.incognito || !isRestorableUrl(tab.url)) return;
  await ensureCache();
  memoryCache[tab.id] = toSnap(tab);
  await chrome.storage.session.set({ [CACHE_KEY]: memoryCache });
}

async function replaceCache(tabs) {
  memoryCache = {};
  for (const tab of tabs) {
    if (tab?.id && !tab.incognito && isRestorableUrl(tab.url)) memoryCache[tab.id] = toSnap(tab);
  }
  cacheReady = Promise.resolve();
  await chrome.storage.session.set({ [CACHE_KEY]: memoryCache });
}

async function archiveSnapshot(tab, reason, settings) {
  if (!settings.archiveEnabled || !isRestorableUrl(tab.url)) return;
  const archive = rememberEntry(await loadArchive(settings.archiveLimit), {
    id: crypto.randomUUID(),
    url: tab.url,
    title: tab.title,
    closedAt: Date.now(),
    reason,
  }, settings.archiveLimit);
  await chrome.storage.local.set({ archive });
}

async function archiveClosed(tabId) {
  await ensureCache();
  const tab = memoryCache[tabId];
  delete memoryCache[tabId];
  await chrome.storage.session.set({ [CACHE_KEY]: memoryCache });
  if (!tab || autoClosing.has(tabId)) {
    autoClosing.delete(tabId);
    return;
  }
  const settings = await loadSettings();
  await enqueueArchive(() => archiveSnapshot(tab, "manual", settings));
}

function visibleTabs(tabs) {
  return tabs.filter((tab) => !tab.incognito).map(toSnap);
}

async function setBadge(count) {
  const text = count > 0 ? String(Math.min(count, 99)) : "";
  await chrome.action.setBadgeText({ text });
  if (text) await chrome.action.setBadgeBackgroundColor({ color: "#23443a" });
}

async function clearBadge() {
  await chrome.storage.local.set({ pendingNotice: 0, pendingUrls: [] });
  await chrome.action.setBadgeText({ text: "" });
}

async function ungroup(ids) {
  if (!ids.length) return;
  try {
    await chrome.tabs.ungroup(ids);
  } catch {
    // The tab may already have been closed or ungrouped.
  }
}

async function ungroupBeforeClosing(allTabs, closingIds) {
  const closing = new Set(closingIds);
  const members = new Map();
  for (const tab of allTabs) {
    if (tab.groupId == null || tab.groupId === -1) continue;
    const list = members.get(tab.groupId) || [];
    list.push(tab.id);
    members.set(tab.groupId, list);
  }
  const ids = [];
  for (const grouped of members.values()) {
    const staying = grouped.filter((id) => !closing.has(id)).length;
    if (staying < 2) ids.push(...grouped);
  }
  await ungroup(ids);
}

async function dissolveSingletonGroups() {
  if (organizing) return;
  const tabs = await chrome.tabs.query({});
  const members = new Map();
  for (const tab of tabs) {
    if (tab.groupId == null || tab.groupId === -1) continue;
    const list = members.get(tab.groupId) || [];
    list.push(tab.id);
    members.set(tab.groupId, list);
  }
  const ids = [];
  for (const grouped of members.values()) {
    if (grouped.length === 1) ids.push(grouped[0]);
  }
  await ungroup(ids);
}

async function closeIdle(force) {
  const settings = await loadSettings();
  if (!force && !settings.autoCloseEnabled) return 0;
  const tabs = await chrome.tabs.query({});
  await replaceCache(tabs);
  const { toClose } = inspectIdle(visibleTabs(tabs), settings, Date.now(), { force });
  for (const tab of toClose) {
    autoClosing.add(tab.id);
    await enqueueArchive(() => archiveSnapshot(tab, "auto", settings));
  }
  const ids = toClose.map((tab) => tab.id);
  if (ids.length) {
    try {
      await ungroupBeforeClosing(tabs, ids);
      await chrome.tabs.remove(ids);
    } catch {
      ids.forEach((id) => autoClosing.delete(id));
    }
  }
  if (!ids.length && !force) return 0;
  const closedUrls = toClose.map((tab) => tab.url).filter(isRestorableUrl);
  const stored = await chrome.storage.local.get(["pendingNotice", "pendingUrls"]);
  const pendingNotice = (Number(stored.pendingNotice) || 0) + ids.length;
  const previousPending = Array.isArray(stored.pendingUrls) ? stored.pendingUrls.filter(isRestorableUrl) : [];
  const mergedPending = [...new Set([...closedUrls, ...previousPending])].slice(0, 25);
  const update = {
    lastSweep: {
      at: Date.now(),
      closed: ids.length,
      urls: force ? closedUrls : mergedPending,
    },
  };
  if (ids.length) {
    update.pendingNotice = pendingNotice;
    update.pendingUrls = mergedPending;
  }
  await chrome.storage.local.set(update);
  if (ids.length) await setBadge(pendingNotice);
  return ids.length;
}

async function styleGroup(groupId, site, collapsed) {
  const appearance = { title: site, color: colorForDomain(site) };
  try {
    await chrome.tabGroups.update(groupId, { ...appearance, collapsed });
    collapsedState.set(groupId, collapsed);
  } catch {
    // Chrome refuses to collapse a group while its active tab is inside it.
    await chrome.tabGroups.update(groupId, appearance);
    collapsedState.set(groupId, false);
  }
}

async function openSitesInWindow(windowId) {
  const groups = await chrome.tabGroups.query({ windowId });
  const sites = new Set();
  for (const group of groups) {
    if (!group.collapsed && group.title) sites.add(group.title);
  }
  return sites;
}

async function syncGroups(windowId, tabs, groups, { collapseAll = false, openSites = new Set() } = {}) {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const wanted = new Set(groups.flatMap((group) => group.tabIds));
  await ungroup(tabs.filter((tab) => !tab.pinned && tab.groupId !== -1 && !wanted.has(tab.id)).map((tab) => tab.id));

  let expandedByFreshTab = null;
  for (const group of groups) {
    const members = group.tabIds.map((id) => byId.get(id)).filter(Boolean);
    if (members.length < 2) continue;
    const existing = [...new Set(members.map((tab) => tab.groupId).filter((id) => id !== -1))];
    const sharedId = existing.length === 1 ? existing[0] : -1;
    const exact = sharedId !== -1
      && members.every((tab) => tab.groupId === sharedId)
      && tabs.filter((tab) => tab.groupId === sharedId).length === members.length;
    // Reusing a larger group would keep unrelated services folded together.
    const groupId = exact
      ? sharedId
      : await chrome.tabs.group({ createProperties: { windowId }, tabIds: group.tabIds });
    const hasActive = members.some((tab) => tab.active);
    const hasFresh = members.some((tab) => freshTabIds.has(tab.id));
    if (hasFresh) {
      for (const tab of members) freshTabIds.delete(tab.id);
    }
    const keepOpen = !collapseAll && (hasActive || hasFresh || openSites.has(group.site) || (exact && collapsedState.get(groupId) === false));
    await styleGroup(groupId, group.site, !keepOpen);
    if (hasFresh && keepOpen) expandedByFreshTab = { id: groupId, windowId };
  }
  return expandedByFreshTab;
}

async function layoutWindow(windowId, settings, { collapseAll = false } = {}) {
  if (!settings.autoSortEnabled || windowId == null) return;
  organizing = true;
  let expandedByFreshTab = null;
  try {
    const openSites = collapseAll ? new Set() : await openSitesInWindow(windowId);
    let tabs = visibleTabs(await chrome.tabs.query({ windowId })).sort((a, b) => a.index - b.index);
    const plan = planWindowLayout(tabs, settings);
    const orderChanged = plan.order.some((id, index) => id !== tabs[index]?.id);
    if (orderChanged) {
      await ungroup(tabs.filter((tab) => !tab.pinned && tab.groupId !== -1).map((tab) => tab.id));
      const pinnedCount = tabs.filter((tab) => tab.pinned).length;
      const movable = plan.order.slice(pinnedCount);
      if (movable.length > 1) await chrome.tabs.move(movable, { windowId, index: pinnedCount });
      tabs = visibleTabs(await chrome.tabs.query({ windowId }));
    }
    if (!settings.groupByDomain) {
      await ungroup(tabs.filter((tab) => !tab.pinned && tab.groupId !== -1).map((tab) => tab.id));
      return;
    }
    expandedByFreshTab = await syncGroups(windowId, tabs, plan.groups, { collapseAll, openSites });
  } finally {
    organizing = false;
  }
  if (expandedByFreshTab) {
    await onGroupExpanded(expandedByFreshTab, { keepActiveTab: true });
  }
}

async function sortAll() {
  const settings = await loadSettings();
  if (!settings.autoSortEnabled) return;
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  for (const win of windows) {
    if (win.incognito) continue;
    try {
      await layoutWindow(win.id, settings);
    } catch {
      // One window failing should not stop the others.
    }
  }
}

async function sortCurrent() {
  const settings = await loadSettings();
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!active || active.incognito) return;
  await layoutWindow(active.windowId, { ...settings, autoSortEnabled: true }, { collapseAll: true });
}

function scheduleLayout() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    sortAll().catch(() => {});
  }, 1200);
}

async function rememberGroupStates() {
  const groups = await chrome.tabGroups.query({});
  collapsedState.clear();
  for (const group of groups) collapsedState.set(group.id, group.collapsed);
}

async function dissolveLegacyHiddenGroups() {
  const groups = await chrome.tabGroups.query({});
  for (const group of groups) {
    if (group.color !== "grey" || !["...", "…", "Hidden", "隐藏"].includes(group.title || "")) continue;
    const tabs = await chrome.tabs.query({ groupId: group.id });
    await ungroup(tabs.map((tab) => tab.id));
  }
}

async function onGroupExpanded(group, { keepActiveTab = false } = {}) {
  if (organizing) return;
  const [tabs, win, groups] = await Promise.all([
    chrome.tabs.query({ windowId: group.windowId }),
    chrome.windows.get(group.windowId),
    chrome.tabGroups.query({ windowId: group.windowId }),
  ]);
  const collapsedIds = new Set(groups.filter((item) => item.collapsed).map((item) => item.id));
  if (visibleSlotCount(tabs, collapsedIds) < crowdThreshold(win.width)) return;

  const openOthers = groups.filter((other) => other.id !== group.id && !other.collapsed);
  if (!openOthers.length) return;

  organizing = true;
  try {
    const active = tabs.find((tab) => tab.active);
    const openedTabs = tabs
      .filter((tab) => tab.groupId === group.id)
      .sort((a, b) => a.index - b.index);
    // Chrome refuses to collapse a group while the active tab is inside it.
    if (!keepActiveTab && active && openOthers.some((other) => other.id === active.groupId) && openedTabs.length) {
      try {
        await chrome.tabs.update(openedTabs[0].id, { active: true });
      } catch {
        // If focus cannot move, the active group will stay open.
      }
    }
    for (const other of openOthers) {
      try {
        await chrome.tabGroups.update(other.id, { collapsed: true });
        collapsedState.set(other.id, true);
      } catch {
        // The active tab's group stays open.
      }
    }
  } finally {
    organizing = false;
  }
}

async function snapshot() {
  const settings = await loadSettings();
  const tabs = visibleTabs(await chrome.tabs.query({}));
  const preview = inspectIdle(tabs, settings, Date.now(), { force: true });
  const stored = await chrome.storage.local.get(["lastSweep", "pendingNotice", "pendingUrls"]);
  const pendingNotice = Number(stored.pendingNotice) || 0;
  const pendingUrls = Array.isArray(stored.pendingUrls) ? stored.pendingUrls.filter(isRestorableUrl) : [];
  const sweepUrls = Array.isArray(stored.lastSweep?.urls) ? stored.lastSweep.urls.filter(isRestorableUrl) : [];
  const lastBatchUrls = pendingUrls.length ? pendingUrls : sweepUrls;
  await clearBadge();
  return {
    ok: true,
    settings,
    openCount: tabs.length,
    idleCount: preview.toClose.length,
    eligibleCount: preview.eligible.length,
    idlePreview: preview.toClose.slice(0, 10).map((tab) => ({
      id: tab.id,
      title: tab.title || tab.url,
      domain: siteKey(tab.url),
    })),
    lastBatchUrls,
    archive: await loadArchive(settings.archiveLimit),
    lastSweep: stored.lastSweep || null,
    pendingNotice,
  };
}

function sanitizePatch(patch) {
  if (!patch || typeof patch !== "object") return {};
  const next = {};
  for (const key of PATCHABLE) {
    if (key in patch) next[key] = patch[key];
  }
  return next;
}

async function handle(message) {
  switch (message?.type) {
    case "getSnapshot":
      return snapshot();
    case "patchSettings": {
      await saveSettings(sanitizePatch(message.patch));
      const patch = message.patch || {};
      if ("autoSortEnabled" in patch || "groupByDomain" in patch) scheduleLayout();
      return snapshot();
    }
    case "sortCurrentWindow":
      await sortCurrent();
      return snapshot();
    case "closeIdleNow":
      await closeIdle(true);
      await sortAll();
      return snapshot();
    case "restore":
      if (typeof message.url !== "string" || !isRestorableUrl(message.url)) return { ok: false, error: "bad_url" };
      await chrome.tabs.create({ url: message.url });
      return snapshot();
    case "restoreBatch": {
      const stored = await chrome.storage.local.get("lastSweep");
      const raw = Array.isArray(message.urls) && message.urls.length ? message.urls : stored.lastSweep?.urls || [];
      const urls = [...new Set(raw.filter((url) => typeof url === "string" && isRestorableUrl(url)))].slice(0, 25);
      for (const url of urls) {
        await chrome.tabs.create({ url, active: false });
      }
      if (stored.lastSweep) {
        await chrome.storage.local.set({ lastSweep: { ...stored.lastSweep, urls: [] } });
      }
      await sortAll();
      return snapshot();
    }
    case "forget": {
      if (typeof message.id !== "string" || !message.id) return { ok: false, error: "bad_id" };
      const current = await loadSettings();
      const archive = forgetEntry(await loadArchive(current.archiveLimit), message.id, current.archiveLimit);
      await chrome.storage.local.set({ archive });
      return snapshot();
    }
    case "clearArchive":
      await chrome.storage.local.set({ archive: [] });
      return snapshot();
    default:
      return { ok: false, error: "unknown" };
  }
}

async function warm() {
  await loadSettings();
  await chrome.alarms.create(ALARM, { periodInMinutes: 10 });
  await dissolveLegacyHiddenGroups();
  await replaceCache(await chrome.tabs.query({}));
  await rememberGroupStates();
  await dissolveSingletonGroups();
}

chrome.runtime.onInstalled.addListener(() => {
  warm().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  warm().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM) return;
  closeIdle(false)
    .then(() => sortAll())
    .catch(() => {});
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab?.id != null) freshTabIds.add(tab.id);
  rememberTab(tab).catch(() => {});
  scheduleLayout();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const previousUrl = memoryCache[tabId]?.url || "";
    if (groupKey(previousUrl) !== groupKey(changeInfo.url)) {
      freshTabIds.add(tabId);
    }
  }
  rememberTab(tab).catch(() => {});
  if ("groupId" in changeInfo && changeInfo.groupId === -1) {
    dissolveSingletonGroups().catch(() => {});
  }
  if (changeInfo.url) scheduleLayout();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(rememberTab).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  freshTabIds.delete(tabId);
  archiveClosed(tabId).catch(() => {});
  dissolveSingletonGroups().catch(() => {});
});

chrome.tabs.onDetached.addListener(() => {
  dissolveSingletonGroups().catch(() => {});
});

chrome.tabs.onAttached.addListener(() => {
  scheduleLayout();
});

chrome.tabGroups.onUpdated.addListener((group) => {
  const previous = collapsedState.get(group.id);
  collapsedState.set(group.id, group.collapsed);
  if (previous !== true || group.collapsed) return;
  onGroupExpanded(group).catch(() => {});
});

chrome.tabGroups.onRemoved.addListener((group) => {
  collapsedState.delete(group.id);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, error: "request_failed" }));
  return true;
});

warm().catch(() => {});
