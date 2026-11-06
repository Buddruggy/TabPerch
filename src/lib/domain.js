const GROUP_COLORS = ["blue", "cyan", "green", "orange", "pink", "purple", "red", "yellow"];

const MULTI_PART_SUFFIXES = new Set([
  "ac.uk", "co.uk", "gov.uk", "org.uk",
  "com.au", "net.au", "org.au",
  "co.jp", "ne.jp", "or.jp",
  "com.cn", "gov.cn", "net.cn", "org.cn",
  "com.hk", "com.tw", "com.sg", "co.kr", "co.nz", "co.in",
  "com.br", "com.mx", "com.ar", "com.tr", "co.za",
]);

// These labels mark an environment of a service, wherever they sit in the host.
// The service name stays. one.example.net and two.example.net are different services.
const ENVIRONMENT_LABELS = new Set([
  "test", "testing", "testsite", "staging", "stage", "stg",
  "dev", "develop", "development", "uat", "qa", "sit",
  "pre", "preprod", "preview", "beta", "demo", "sandbox",
]);

function hostnameOf(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

function isIpAddress(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function registrableDomain(host) {
  if (host === "localhost" || isIpAddress(host)) return host;
  const parts = host.split(".");
  if (parts.length < 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo) && parts.length >= 3) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

export function siteKey(url) {
  const host = hostnameOf(url);
  return host.replace(/^www\./, "");
}

// Group by service. Drop www and environment labels, then keep every remaining label.
// www.example.com and test.example.com are both example.com.
// shop.example.net and shop.testsite.example.net are both shop.example.net.
// one.example.net and two.example.net stay apart.
export function groupKey(url) {
  const host = hostnameOf(url);
  if (!host) return "";
  const base = registrableDomain(host);
  if (host === base || !host.endsWith(`.${base}`)) return host;
  const labels = host
    .slice(0, -(base.length + 1))
    .split(".")
    .filter((label) => label && label !== "www" && !ENVIRONMENT_LABELS.has(label));
  return labels.length ? `${labels.join(".")}.${base}` : base;
}

export function isRestorableUrl(url) {
  return siteKey(url) !== "";
}

export function ruleFromInput(value) {
  const trimmed = String(value || "").trim().toLowerCase().replace(/^\*\./, "");
  if (!trimmed) return "";
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  return siteKey(withProtocol);
}

export function isWhitelisted(url, whitelist) {
  const host = siteKey(url);
  if (!host || !Array.isArray(whitelist)) return false;
  return whitelist.some((rule) => host === rule || host.endsWith(`.${rule}`));
}

export function colorForDomain(site) {
  let hash = 0;
  for (const char of site || "") hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return GROUP_COLORS[hash % GROUP_COLORS.length];
}

export function hueForSite(site) {
  let hash = 0;
  for (const char of site || "?") hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}
