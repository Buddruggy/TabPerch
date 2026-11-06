import assert from "node:assert/strict";
import test from "node:test";
import { groupKey, isRestorableUrl, isWhitelisted, ruleFromInput, siteKey } from "../src/lib/domain.js";

test("siteKey keeps each subdomain and only drops a leading www", () => {
  assert.equal(siteKey("https://www.nytimes.com/section"), "nytimes.com");
  assert.equal(siteKey("https://www.one.example.net/"), "one.example.net");
  assert.equal(siteKey("https://one.example.net/"), "one.example.net");
  assert.equal(siteKey("https://two.example.net/"), "two.example.net");
  assert.notEqual(siteKey("https://one.example.net/"), siteKey("https://two.example.net/"));
  assert.equal(siteKey("chrome://newtab/"), "");
  assert.equal(siteKey("javascript:alert(1)"), "");
});

test("groupKey folds environment subdomains into the site and leaves other subdomains apart", () => {
  assert.equal(groupKey("https://www.example.com/docs"), "example.com");
  assert.equal(groupKey("https://test.example.com/docs"), "example.com");
  assert.equal(groupKey("https://dev.example.com/docs"), "example.com");
  assert.equal(groupKey("https://shop.example.net/admin"), "shop.example.net");
  assert.equal(groupKey("https://shop.testsite.example.net/admin"), "shop.example.net");
  assert.equal(groupKey("https://one.example.net/"), "one.example.net");
  assert.equal(groupKey("https://two.example.net/"), "two.example.net");
  assert.notEqual(groupKey("https://one.example.net/"), groupKey("https://two.example.net/"));
  assert.equal(groupKey("https://192.168.1.20/admin"), "192.168.1.20");
  assert.equal(groupKey("http://localhost:3000/a"), "localhost");
});

test("only http and https urls can be remembered", () => {
  assert.equal(isRestorableUrl("https://example.com"), true);
  assert.equal(isRestorableUrl("http://localhost:3000/a"), true);
  assert.equal(isRestorableUrl("chrome://extensions"), false);
  assert.equal(isRestorableUrl("javascript:alert(1)"), false);
});

test("whitelist rules match a site and its subdomains", () => {
  assert.equal(ruleFromInput("https://www.Docs.Google.com/a"), "docs.google.com");
  assert.equal(ruleFromInput("*.example.com"), "example.com");
  assert.equal(isWhitelisted("https://mail.google.com/mail", ["google.com"]), true);
  assert.equal(isWhitelisted("https://mail.google.com/mail", ["docs.google.com"]), false);
  assert.equal(isWhitelisted("https://docs.google.com/a", ["docs.google.com"]), true);
});
