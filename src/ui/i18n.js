let catalog = {};
let catalogReady = null;

function applyPlaceholders(entry, values) {
  let text = entry.message;
  for (const [name, placeholder] of Object.entries(entry.placeholders || {})) {
    const content = String(placeholder.content || "").replace(/\$(\d+)/g, (_match, index) => values[Number(index) - 1] ?? "");
    text = text.replaceAll(`$${name.toUpperCase()}$`, content);
  }
  return text.replace(/\$(\d+)/g, (_match, index) => values[Number(index) - 1] ?? "");
}

export function loadFallback() {
  if (!catalogReady) {
    catalogReady = fetch(new URL("../../_locales/en/messages.json", import.meta.url))
      .then((response) => (response.ok ? response.json() : {}))
      .then((messages) => {
        catalog = messages;
      })
      .catch(() => {
        catalog = {};
      });
  }
  return catalogReady;
}

export function t(key, substitutions) {
  const values = substitutions == null ? undefined : (Array.isArray(substitutions) ? substitutions : [substitutions]).map((value) => String(value));
  if (typeof chrome !== "undefined" && chrome.i18n?.getMessage) {
    const message = values ? chrome.i18n.getMessage(key, values) : chrome.i18n.getMessage(key);
    if (message) return message;
  }
  const entry = catalog[key];
  if (!entry?.message) return key;
  return applyPlaceholders(entry, values || []);
}

export function applyLanguage() {
  const language = typeof chrome !== "undefined" && chrome.i18n?.getUILanguage ? chrome.i18n.getUILanguage() : "en";
  document.documentElement.lang = language || "en";
}

export function applyI18n(root = document) {
  for (const node of root.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll("[data-i18n-placeholder]")) node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  for (const node of root.querySelectorAll("[data-i18n-title]")) {
    const label = t(node.dataset.i18nTitle);
    node.title = label;
    if (!node.getAttribute("aria-label")) node.setAttribute("aria-label", label);
  }
}
