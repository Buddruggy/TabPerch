import { extensionReady, sendMessage } from "../ui/client.js";
import { demoSnapshot, reduceDemo } from "../ui/demo.js";
import { applyI18n, applyLanguage, loadFallback, t } from "../ui/i18n.js";

const form = document.querySelector("#settings");
const preview = document.querySelector("#preview");
const status = document.querySelector("#status");
const error = document.querySelector("#error");
const version = document.querySelector("#version");
const clearButton = document.querySelector("#clear");

const fields = [
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

let state = null;
let timer = 0;

function setStatus(text) {
  status.textContent = text;
}

function showError() {
  error.hidden = false;
  error.textContent = t("saveFailed");
}

function readForm() {
  return {
    autoCloseEnabled: form.autoCloseEnabled.checked,
    inactiveHours: form.inactiveHours.value,
    minOpenTabs: form.minOpenTabs.value,
    maxClosePerSweep: form.maxClosePerSweep.value,
    autoSortEnabled: form.autoSortEnabled.checked,
    groupByDomain: form.groupByDomain.checked,
    archiveEnabled: form.archiveEnabled.checked,
    archiveLimit: form.archiveLimit.value,
    whitelist: form.whitelist.value,
  };
}

function fillForm(settings, { keepFocus = false } = {}) {
  const active = document.activeElement;
  for (const key of fields) {
    const field = form.elements[key];
    if (keepFocus && field === active) continue;
    if (field.type === "checkbox") field.checked = Boolean(settings[key]);
    else if (key === "whitelist") field.value = settings.whitelist.join("\n");
    else field.value = settings[key];
  }
  form.groupByDomain.disabled = !form.autoSortEnabled.checked;
}

async function run(type, extra = {}) {
  if (!extensionReady()) {
    state = reduceDemo(state || demoSnapshot(), { type, ...extra });
    return true;
  }
  try {
    const response = await sendMessage({ type, ...extra });
    if (!response?.ok) {
      showError();
      return false;
    }
    state = response;
    error.hidden = true;
    return true;
  } catch {
    showError();
    return false;
  }
}

async function save() {
  if (!(await run("patchSettings", { patch: readForm() }))) return;
  fillForm(state.settings, { keepFocus: true });
  setStatus(t("saved"));
}

function scheduleSave() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    save().catch(() => showError());
  }, 250);
}

async function refresh() {
  const isPreview = !extensionReady();
  preview.hidden = !isPreview;
  if (isPreview) state = demoSnapshot();
  else if (!(await run("getSnapshot"))) return;
  fillForm(state.settings);
  version.textContent = t("versionLabel", [extensionReady() ? chrome.runtime.getManifest().version : "0.1.0"]);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  save().catch(() => showError());
});

form.addEventListener("input", (event) => {
  if (event.target.name === "whitelist") scheduleSave();
});

form.addEventListener("change", () => {
  form.groupByDomain.disabled = !form.autoSortEnabled.checked;
  scheduleSave();
});

clearButton.addEventListener("click", async () => {
  if (!window.confirm(t("clearConfirm"))) return;
  if (!(await run("clearArchive"))) return;
  setStatus(t("saved"));
});

await loadFallback();
applyLanguage();
applyI18n();
document.title = `${t("options")} · ${t("extName")}`;
await refresh();
