import assert from "node:assert/strict";
import test from "node:test";
import { forgetEntry, rememberEntry } from "../src/lib/archive.js";

test("memory keeps the newest copy of a url and drops everything else", () => {
  const first = rememberEntry([], {
    id: "1",
    url: "https://example.com/a",
    title: "A",
    closedAt: 10,
    reason: "manual",
  }, 10);
  const second = rememberEntry(first, {
    id: "2",
    url: "https://example.com/a",
    title: "A again",
    closedAt: 20,
    reason: "auto",
  }, 10);
  assert.equal(second.length, 1);
  assert.equal(second[0].id, "2");
  assert.equal(second[0].reason, "auto");
  assert.equal(second[0].domain, "example.com");
});

test("memory refuses script urls and respects the limit", () => {
  const existing = [
    { id: "old", url: "https://example.com/old", title: "Old", closedAt: 1, reason: "manual" },
  ];
  const withScript = rememberEntry(existing, {
    url: "javascript:alert(1)",
    title: "nope",
    closedAt: 2,
  }, 10);
  assert.equal(withScript.length, 1);

  const capped = rememberEntry(existing, {
    id: "new",
    url: "https://example.com/new",
    title: "New",
    closedAt: 3,
    reason: "manual",
  }, 1);
  assert.deepEqual(capped.map((item) => item.id), ["new"]);
});

test("forgetting an entry removes only that entry", () => {
  const archive = rememberEntry([], { id: "keep", url: "https://example.com/keep", closedAt: 2 }, 10);
  const withDrop = rememberEntry(archive, { id: "drop", url: "https://example.com/drop", closedAt: 3 }, 10);
  assert.deepEqual(forgetEntry(withDrop, "drop").map((item) => item.id), ["keep"]);
});
