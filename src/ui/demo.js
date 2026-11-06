import { normalizeSettings } from "../lib/settings.js";

const HOUR = 60 * 60 * 1000;

export function demoSnapshot(now = Date.now()) {
  return {
    ok: true,
    settings: normalizeSettings({
      installedAt: now - 10 * 24 * HOUR,
      whitelist: ["mail.example.com"],
    }),
    openCount: 28,
    idleCount: 4,
    eligibleCount: 4,
    idlePreview: [
      { id: 1, title: "API migration checklist", domain: "docs.example.com" },
      { id: 2, title: "Release retrospective", domain: "notes.example.com" },
      { id: 3, title: "Latency dashboard", domain: "metrics.example.com" },
      { id: 4, title: "Incident #418 timeline", domain: "status.example.com" },
    ],
    lastBatchUrls: [
      "https://docs.example.com/document/planning",
      "https://metrics.example.com/weekly",
    ],
    pendingNotice: 2,
    lastSweep: {
      at: now - 3 * HOUR,
      closed: 2,
      urls: [
        "https://docs.example.com/document/planning",
        "https://metrics.example.com/weekly",
      ],
    },
    archive: [
      {
        id: "notes",
        url: "https://docs.example.com/document/planning",
        title: "Q3 planning notes",
        domain: "docs.example.com",
        closedAt: now - 2 * HOUR,
        reason: "auto",
      },
      {
        id: "recipe",
        url: "https://cooking.example.com/noodle-soup",
        title: "Weeknight noodle soup",
        domain: "cooking.example.com",
        closedAt: now - 26 * HOUR,
        reason: "manual",
      },
      {
        id: "reference",
        url: "https://developer.mozilla.org/docs/Web/API/Window/open",
        title: "Window.open() — Web APIs",
        domain: "developer.mozilla.org",
        closedAt: now - 4 * 24 * HOUR,
        reason: "manual",
      },
    ],
  };
}

export function reduceDemo(state, action) {
  if (action.type === "forget") {
    return { ...state, archive: state.archive.filter((item) => item.id !== action.id) };
  }
  if (action.type === "clearArchive") return { ...state, archive: [] };
  if (action.type === "closeIdleNow") {
    return {
      ...state,
      idleCount: 0,
      eligibleCount: 0,
      idlePreview: [],
      pendingNotice: 0,
      lastSweep: { at: Date.now(), closed: state.idleCount, urls: state.lastBatchUrls || [] },
    };
  }
  if (action.type === "restoreBatch") {
    return {
      ...state,
      openCount: state.openCount + (action.urls?.length || 0),
      lastBatchUrls: [],
      pendingNotice: 0,
    };
  }
  if (action.type === "patchSettings") {
    return {
      ...state,
      settings: normalizeSettings({ ...state.settings, ...action.patch, installedAt: state.settings.installedAt }),
    };
  }
  return state;
}
