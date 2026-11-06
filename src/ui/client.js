export function extensionReady() {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

export async function sendMessage(message) {
  if (!extensionReady()) return null;
  return chrome.runtime.sendMessage(message);
}
