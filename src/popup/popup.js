import { hueForSite } from "../lib/domain.js";
import { extensionReady, sendMessage } from "../ui/client.js";
import { demoSnapshot, reduceDemo } from "../ui/demo.js";
import { applyI18n, applyLanguage, loadFallback, t } from "../ui/i18n.js";
import { formatAgo } from "../ui/time.js";

const els = {
  preview: document.querySelector("#preview"),
  summary: document.querySelector("#summary"),
  notice: document.querySelector("#notice"),
  noticeText: document.querySelector("#notice-text"),
  restoreBatch: document.querySelector("#restore-batch"),
  idlePreview: document.querySelector("#idle-preview"),
  hint: document.querySelector("#hint"),
  sort: document.querySelector("#sort"),
  close: document.querySelector("#close"),
  options: document.querySelector("#options"),
  filterAll: document.querySelector("#filter-all"),
  filterAuto: document.querySelector("#filter-auto"),
  search: document.querySelector("#search"),
  list: document.querySelector("#list"),
  error: document.querySelector("#error"),
};

let state = null;
let flash = "";
let filterMode = "all";

function plural(oneKey, manyKey, count) {
  return Number(count) === 1 ? t(oneKey) : t(manyKey, [count]);
}

function showError() {
  els.error.hidden = false;
  els.error.textContent = t("actionFailed");
}

async function run(type, extra = {}) {
  if (!extensionReady()) {
    state = reduceDemo(state, { type, ...extra });
    return true;
  }
  try {
    const response = await sendMessage({ type, ...extra });
    if (!response?.ok) {
      showError();
      return false;
    }
    state = response;
    els.error.hidden = true;
    return true;
  } catch {
    showError();
    return false;
  }
}

function renderList() {
  const query = els.search.value.trim().toLowerCase();
  const pool = filterMode === "auto"
    ? state.archive.filter((item) => item.reason === "auto")
    : state.archive;
  const matched = pool.filter((item) => `${item.title} ${item.url} ${item.domain}`.toLowerCase().includes(query));
  const visible = matched.slice(0, 40);
  els.list.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = state.archive.length ? t("noMatches") : t("emptyMemory");
    els.list.append(empty);
    return;
  }
  for (const item of visible) els.list.append(renderRow(item));
  if (matched.length > visible.length) {
    const more = document.createElement("p");
    more.className = "more";
    more.textContent = t("moreResults", [matched.length - visible.length]);
    els.list.append(more);
  }
}

function renderRow(item) {
  const row = document.createElement("article");
  row.className = "row";

  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = (item.domain || "?").slice(0, 1).toUpperCase();
  avatar.style.background = `hsl(${hueForSite(item.domain)} 42% 28%)`;

  const copy = document.createElement("div");
  copy.className = "copy";
  const title = document.createElement("p");
  title.className = "title";
  title.textContent = item.title;
  title.title = item.title;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.title = item.url;
  meta.textContent = `${item.domain} · ${t(item.reason === "auto" ? "reasonAuto" : "reasonManual")} · ${formatAgo(item.closedAt)}`;
  copy.append(title, meta);

  const restore = document.createElement("button");
  restore.type = "button";
  restore.className = "row-button";
  restore.textContent = t("restore");
  restore.addEventListener("click", () => onRestore(item.url));

  const forget = document.createElement("button");
  forget.type = "button";
  forget.className = "row-button danger";
  forget.textContent = t("forget");
  forget.addEventListener("click", () => onForget(item.id));

  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(restore, forget);
  row.append(avatar, copy, actions);
  return row;
}

function renderIdlePreview() {
  const items = Array.isArray(state.idlePreview) ? state.idlePreview : [];
  if (!state.idleCount || !items.length) {
    els.idlePreview.hidden = true;
    els.idlePreview.removeAttribute("title");
    els.close.removeAttribute("title");
    return;
  }
  const fullLines = items.map((item) => `• ${item.title} (${item.domain})`).join("\n");
  const shortTitles = items.slice(0, 2).map((item) => item.title).join(" · ");
  const suffix = state.idleCount > 2 ? ` (+${state.idleCount - 2})` : "";
  els.idlePreview.hidden = false;
  els.idlePreview.textContent = t("willPerch", [`${shortTitles}${suffix}`]);
  els.idlePreview.title = fullLines;
  els.close.title = fullLines;
}

function render() {
  els.summary.textContent = state.idleCount
    ? t("openSummary", [state.openCount, state.idleCount])
    : t("openSummaryQuiet", [state.openCount]);
  els.close.disabled = state.idleCount === 0;
  renderIdlePreview();

  const rest = Math.max(0, state.eligibleCount - state.idleCount);
  els.hint.hidden = rest === 0;
  if (rest > 0) els.hint.textContent = t("keptOpen", [rest, state.settings.maxClosePerSweep, state.settings.minOpenTabs]);

  const batchUrls = Array.isArray(state.lastBatchUrls) ? state.lastBatchUrls : [];
  if (flash) {
    els.notice.hidden = false;
    els.noticeText.textContent = flash;
    els.restoreBatch.hidden = batchUrls.length === 0;
  } else if (state.pendingNotice > 0) {
    els.notice.hidden = false;
    els.noticeText.textContent = plural("pendingNoticeOne", "pendingNotice", state.pendingNotice);
    els.restoreBatch.hidden = batchUrls.length === 0;
  } else if (state.lastSweep) {
    els.notice.hidden = false;
    els.noticeText.textContent = t("lastSweep", [formatAgo(state.lastSweep.at), state.lastSweep.closed]);
    els.restoreBatch.hidden = batchUrls.length === 0;
  } else {
    els.notice.hidden = true;
    els.restoreBatch.hidden = true;
  }

  els.filterAll.classList.toggle("active", filterMode === "all");
  els.filterAuto.classList.toggle("active", filterMode === "auto");
  renderList();
}

async function refresh() {
  const preview = !extensionReady();
  document.body.dataset.preview = String(preview);
  els.preview.hidden = !preview;
  if (preview) {
    state = state || demoSnapshot();
    render();
    return;
  }
  if (await run("getSnapshot")) render();
}

async function onSort() {
  flash = "";
  if (await run("sortCurrentWindow")) {
    flash = t("sortedFlash");
    render();
  }
}

async function onClose() {
  const count = state?.idleCount || 0;
  flash = "";
  if (!(await run("closeIdleNow"))) return;
  flash = count ? plural("closedFlashOne", "closedFlash", count) : t("idleNone");
  render();
}

async function onRestoreBatch() {
  const urls = Array.isArray(state?.lastBatchUrls) ? state.lastBatchUrls : [];
  if (!urls.length) return;
  flash = "";
  if (await run("restoreBatch", { urls })) {
    flash = t("restoredBatchFlash", [urls.length]);
    render();
  }
}

async function onRestore(url) {
  flash = "";
  if (!extensionReady()) {
    flash = t("restoredFlash");
    render();
    return;
  }
  if (await run("restore", { url })) {
    flash = t("restoredFlash");
    render();
  }
}

async function onForget(id) {
  flash = "";
  if (await run("forget", { id })) render();
}

els.sort.addEventListener("click", () => onSort());
els.close.addEventListener("click", () => onClose());
els.restoreBatch.addEventListener("click", () => onRestoreBatch());
els.filterAll.addEventListener("click", () => {
  filterMode = "all";
  if (state) render();
});
els.filterAuto.addEventListener("click", () => {
  filterMode = "auto";
  if (state) render();
});
els.options.addEventListener("click", () => {
  if (extensionReady()) chrome.runtime.openOptionsPage();
  else window.open(new URL("../options/options.html", import.meta.url), "_blank");
});
els.search.addEventListener("input", () => {
  if (state) renderList();
});

await loadFallback();
applyLanguage();
applyI18n();
els.search.setAttribute("aria-label", t("searchPlaceholder"));
document.title = t("extName");
await refresh();
