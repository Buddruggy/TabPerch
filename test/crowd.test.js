import assert from "node:assert/strict";
import test from "node:test";
import { crowdThreshold, visibleSlotCount } from "../src/lib/crowd.js";

test("the finder threshold grows with the browser window", () => {
  assert.equal(crowdThreshold(800), 6);
  assert.equal(crowdThreshold(1512), 11);
  assert.equal(crowdThreshold(1920), 14);
  assert.equal(crowdThreshold(2560), 20);
  assert.equal(crowdThreshold(3840), 30);
  assert.equal(crowdThreshold(undefined), 6);
});

test("visibleSlotCount counts each collapsed group as one slot and expanded tabs individually", () => {
  const tabs = [
    { id: 1, groupId: 10 },
    { id: 2, groupId: 10 },
    { id: 3, groupId: 10 },
    { id: 4, groupId: 20 },
    { id: 5, groupId: 20 },
    { id: 6, groupId: -1 },
  ];
  assert.equal(visibleSlotCount(tabs, new Set([10, 20])), 3);
  assert.equal(visibleSlotCount(tabs, new Set([10])), 4);
  assert.equal(visibleSlotCount(tabs, new Set()), 6);
});
