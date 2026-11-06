import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettings, normalizeWhitelist } from "../src/lib/settings.js";

test("settings fall back to the safe defaults", () => {
  const settings = normalizeSettings(null);
  assert.equal(settings.autoCloseEnabled, true);
  assert.equal(settings.inactiveHours, 48);
  assert.equal(settings.minOpenTabs, 12);
  assert.equal(settings.maxClosePerSweep, 5);
  assert.equal(settings.installedAt, 0);
});

test("settings clamp numbers and normalize the whitelist", () => {
  const settings = normalizeSettings({
    inactiveHours: 0,
    minOpenTabs: 999,
    maxClosePerSweep: 100,
    archiveLimit: 10,
    whitelist: "docs.google.com\nnot a url\nhttps://mail.example.com/inbox",
    installedAt: 123,
  });
  assert.equal(settings.inactiveHours, 1);
  assert.equal(settings.minOpenTabs, 200);
  assert.equal(settings.maxClosePerSweep, 25);
  assert.equal(settings.archiveLimit, 50);
  assert.deepEqual(settings.whitelist, ["docs.google.com", "mail.example.com"]);
  assert.equal(settings.installedAt, 123);
});

test("whitelist input can be a textarea string", () => {
  assert.deepEqual(normalizeWhitelist("example.com, www.nytimes.com"), ["example.com", "nytimes.com"]);
});
