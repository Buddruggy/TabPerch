import assert from "node:assert/strict";
import test from "node:test";
import { inspectIdle, planWindowLayout } from "../src/lib/decide.js";
import { normalizeSettings } from "../src/lib/settings.js";

const HOUR = 60 * 60 * 1000;

function tab(overrides) {
  return {
    id: overrides.id,
    index: overrides.index ?? overrides.id,
    url: overrides.url,
    title: overrides.title || overrides.url,
    pinned: false,
    active: false,
    audible: false,
    highlighted: false,
    incognito: false,
    status: "complete",
    lastAccessed: overrides.lastAccessed,
    ...overrides,
  };
}

test("idle tabs wait out a full interval after install before they can close", () => {
  const installedAt = 1_000_000_000_000;
  const settings = normalizeSettings({ installedAt, inactiveHours: 72, minOpenTabs: 0, maxClosePerSweep: 5 });
  const ancient = tab({ id: 1, url: "https://old.example/a", lastAccessed: installedAt - 10 * 24 * HOUR });
  const fresh = tab({ id: 2, url: "https://fresh.example/a", lastAccessed: installedAt + 70 * HOUR });

  const tooSoon = inspectIdle([ancient, fresh], settings, installedAt + 2 * HOUR);
  assert.deepEqual(tooSoon.toClose.map((item) => item.id), []);

  const later = inspectIdle([ancient, fresh], settings, installedAt + 80 * HOUR);
  assert.deepEqual(later.toClose.map((item) => item.id), [1]);
});

test("pinned, active, audible, loading, and whitelisted tabs stay open", () => {
  const now = 10_000 * HOUR;
  const settings = normalizeSettings({
    installedAt: now - 100 * 24 * HOUR,
    inactiveHours: 24,
    minOpenTabs: 0,
    maxClosePerSweep: 10,
    whitelist: ["keep.example"],
  });
  const tabs = [
    tab({ id: 1, url: "https://idle.example/a", lastAccessed: now - 48 * HOUR }),
    tab({ id: 2, url: "https://idle.example/pinned", lastAccessed: now - 48 * HOUR, pinned: true }),
    tab({ id: 3, url: "https://idle.example/active", lastAccessed: now - 48 * HOUR, active: true }),
    tab({ id: 4, url: "https://idle.example/sound", lastAccessed: now - 48 * HOUR, audible: true }),
    tab({ id: 5, url: "https://keep.example/inbox", lastAccessed: now - 48 * HOUR }),
    tab({ id: 6, url: "https://idle.example/loading", lastAccessed: now - 48 * HOUR, status: "loading" }),
    tab({ id: 7, url: "chrome://newtab/", lastAccessed: now - 48 * HOUR }),
  ];
  const result = inspectIdle(tabs, settings, now);
  assert.deepEqual(result.toClose.map((item) => item.id), [1]);
});

test("a sweep keeps the minimum tab count and the per-pass cap", () => {
  const now = 5_000 * HOUR;
  const settings = normalizeSettings({
    installedAt: now - 30 * 24 * HOUR,
    inactiveHours: 24,
    minOpenTabs: 4,
    maxClosePerSweep: 2,
  });
  const tabs = [1, 2, 3, 4, 5, 6].map((id) =>
    tab({ id, url: `https://example.com/${id}`, lastAccessed: now - (100 - id) * HOUR }),
  );
  const result = inspectIdle(tabs, settings, now);
  assert.equal(result.eligible.length, 6);
  assert.deepEqual(result.toClose.map((item) => item.id), [1, 2]);

  const manual = inspectIdle(tabs, settings, now, { force: true });
  assert.deepEqual(manual.toClose.map((item) => item.id), [1, 2]);

  const manualMoreRoom = inspectIdle(tabs, { ...settings, minOpenTabs: 1 }, now, { force: true });
  assert.deepEqual(manualMoreRoom.toClose.map((item) => item.id), [1, 2, 3, 4, 5]);
});

test("automatic closing can be turned off without changing a manual check", () => {
  const now = 5_000 * HOUR;
  const settings = normalizeSettings({ autoCloseEnabled: false, installedAt: now - 100 * HOUR, inactiveHours: 1, minOpenTabs: 0 });
  const tabs = [tab({ id: 1, url: "https://example.com/a", lastAccessed: now - 5 * HOUR })];
  assert.equal(inspectIdle(tabs, settings, now).toClose.length, 0);
  assert.equal(inspectIdle(tabs, settings, now, { force: true }).toClose.length, 1);
});

test("related tabs sort by site while pinned tabs stay in front", () => {
  const settings = normalizeSettings({ autoSortEnabled: true, groupByDomain: true });
  const tabs = [
    tab({ id: 1, index: 0, pinned: true, url: "https://pinned.example", title: "Pinned" }),
    tab({ id: 2, index: 1, url: "https://b.example/z", title: "Zoo" }),
    tab({ id: 3, index: 2, url: "https://a.example/b", title: "Bravo" }),
    tab({ id: 4, index: 3, url: "https://a.example/a", title: "Alpha" }),
    tab({ id: 5, index: 4, url: "chrome://newtab/", title: "New Tab" }),
  ];
  const plan = planWindowLayout(tabs, settings);
  assert.deepEqual(plan.order, [1, 4, 3, 2, 5]);
  assert.deepEqual(plan.groups, [{ site: "a.example", tabIds: [4, 3] }]);
});

test("service groups stay consistent across the reported hosts", () => {
  const settings = normalizeSettings({ autoSortEnabled: true, groupByDomain: true });
  const tabs = [
    tab({ id: 1, index: 0, url: "https://two.example.net/a", title: "J" }),
    tab({ id: 2, index: 1, url: "https://test.example.com/docs", title: "Test" }),
    tab({ id: 3, index: 2, url: "https://shop.testsite.example.net/admin", title: "Shop test" }),
    tab({ id: 4, index: 3, url: "https://www.example.com/docs", title: "Prod" }),
    tab({ id: 5, index: 4, url: "https://one.example.net/b", title: "Beta" }),
    tab({ id: 6, index: 5, url: "https://shop.example.net/admin", title: "Shop" }),
    tab({ id: 7, index: 6, url: "https://www.one.example.net/a", title: "Alpha" }),
    tab({ id: 8, index: 7, url: "https://mail.google.com/mail", title: "Mail" }),
    tab({ id: 9, index: 8, url: "https://docs.google.com/document/d/1", title: "Docs" }),
  ];
  const plan = planWindowLayout(tabs, settings);
  assert.deepEqual(plan.groups, [
    { site: "example.com", tabIds: [4, 2] },
    { site: "one.example.net", tabIds: [7, 5] },
    { site: "shop.example.net", tabIds: [6, 3] },
  ]);
  assert.equal(plan.groups.some((group) => group.site === "example.net"), false);
  assert.equal(plan.groups.some((group) => group.site === "google.com"), false);
  assert.equal(plan.groups.some((group) => group.tabIds.includes(1)), false);
});

test("www and an environment subdomain share one group", () => {
  const settings = normalizeSettings({ autoSortEnabled: true, groupByDomain: true });
  const tabs = [
    tab({ id: 1, index: 0, url: "https://test.example.com/docs", title: "Test" }),
    tab({ id: 2, index: 1, url: "https://news.ycombinator.com/", title: "HN" }),
    tab({ id: 3, index: 2, url: "https://www.example.com/docs", title: "Prod" }),
  ];
  const plan = planWindowLayout(tabs, settings);
  assert.deepEqual(plan.order, [3, 1, 2]);
  assert.deepEqual(plan.groups, [{ site: "example.com", tabIds: [3, 1] }]);
});

test("an environment label between the service name and the domain still groups", () => {
  const settings = normalizeSettings({ autoSortEnabled: true, groupByDomain: true });
  const tabs = [
    tab({ id: 1, index: 0, url: "https://shop.testsite.example.net/admin", title: "Test" }),
    tab({ id: 2, index: 1, url: "https://two.example.net/", title: "Other" }),
    tab({ id: 3, index: 2, url: "https://shop.example.net/admin", title: "Prod" }),
  ];
  const plan = planWindowLayout(tabs, settings);
  assert.deepEqual(plan.order, [3, 1, 2]);
  assert.deepEqual(plan.groups, [{ site: "shop.example.net", tabIds: [3, 1] }]);
});

test("different subdomains stay in separate groups", () => {
  const settings = normalizeSettings({ autoSortEnabled: true, groupByDomain: true });
  const tabs = [
    tab({ id: 1, index: 0, url: "https://two.example.net/a", title: "Board" }),
    tab({ id: 2, index: 1, url: "https://one.example.net/b", title: "Beta" }),
    tab({ id: 3, index: 2, url: "https://www.one.example.net/a", title: "Alpha" }),
    tab({ id: 4, index: 3, url: "https://two.example.net/z", title: "Queue" }),
  ];
  const plan = planWindowLayout(tabs, settings);
  assert.deepEqual(plan.order, [3, 2, 1, 4]);
  assert.deepEqual(plan.groups, [
    { site: "one.example.net", tabIds: [3, 2] },
    { site: "two.example.net", tabIds: [1, 4] },
  ]);
});

test("sorting can be disabled without losing the current order", () => {
  const tabs = [
    tab({ id: 2, index: 0, url: "https://b.example" }),
    tab({ id: 1, index: 1, url: "https://a.example" }),
  ];
  const plan = planWindowLayout(tabs, normalizeSettings({ autoSortEnabled: false }));
  assert.deepEqual(plan.order, [2, 1]);
  assert.deepEqual(plan.groups, []);
});
