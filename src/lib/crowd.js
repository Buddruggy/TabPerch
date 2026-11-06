const TAB_STRIP_RESERVED = 160;
const READABLE_TAB_WIDTH = 120;
const MIN_CROWD = 6;
const MAX_CROWD = 40;

export function crowdThreshold(windowWidth) {
  const width = Number(windowWidth);
  if (!Number.isFinite(width) || width <= TAB_STRIP_RESERVED) return MIN_CROWD;
  const count = Math.floor((width - TAB_STRIP_RESERVED) / READABLE_TAB_WIDTH);
  return Math.min(MAX_CROWD, Math.max(MIN_CROWD, count));
}

export function visibleSlotCount(tabs, collapsedGroupIds) {
  const collapsed = collapsedGroupIds instanceof Set ? collapsedGroupIds : new Set(collapsedGroupIds || []);
  const seenCollapsed = new Set();
  let slots = 0;
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    const groupId = typeof tab?.groupId === "number" ? tab.groupId : -1;
    if (groupId !== -1 && collapsed.has(groupId)) {
      if (!seenCollapsed.has(groupId)) {
        seenCollapsed.add(groupId);
        slots += 1;
      }
      continue;
    }
    slots += 1;
  }
  return slots;
}
