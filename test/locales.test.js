import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const EXPECTED_LOCALES = ["de", "en", "es", "fr", "ja", "ko", "pt_BR", "ru", "zh_CN", "zh_TW"];

async function load(locale) {
  const url = new URL(`../_locales/${locale}/messages.json`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

test("all 10 supported locales expose the exact same keys and placeholders as English", async () => {
  const dirs = (await readdir(new URL("../_locales", import.meta.url), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(dirs, EXPECTED_LOCALES);

  const english = await load("en");
  const englishKeys = Object.keys(english).sort();

  for (const locale of EXPECTED_LOCALES) {
    const catalog = await load(locale);
    assert.deepEqual(Object.keys(catalog).sort(), englishKeys, `key mismatch in ${locale}`);
    for (const [key, entry] of Object.entries(english)) {
      assert.equal(typeof catalog[key].message, "string", `${locale}.${key} message`);
      assert.ok(catalog[key].message.length > 0, `${locale}.${key} empty`);
      assert.deepEqual(
        Object.keys(catalog[key].placeholders || {}).sort(),
        Object.keys(entry.placeholders || {}).sort(),
        `${locale}.${key} placeholders`,
      );
    }
  }
});
