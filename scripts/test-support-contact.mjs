import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const home = source("src/pages/Home.jsx");
const business = source("src/pages/BusinessMypage.jsx");
const policy = source("src/pages/PolicyPage.jsx");
const email = source("supabase/functions/send-email/index.ts") + source("supabase/functions/_shared/email-template.js");

for (const page of [home, business, policy]) {
  const links = [...page.matchAll(/href="mailto:([^"]+)"/g)].map((match) => match[1]);
  assert.ok(links.length > 0, "Contact page must expose an email link");
  assert.ok(links.every((address) => address === "onlinkwith@gmail.com"));
  assert.doesNotMatch(page, /support@on-li\.(co\.kr|jp)|onlinkcp@gmail\.com/);
}
assert.doesNotMatch(business, /010-4494-0418|대표 전화|className="contact-tel"/);
assert.doesNotMatch(email, /support@on-li\.(co\.kr|jp)/);
assert.match(email, /href="mailto:onlinkwith@gmail.com"[^>]*>onlinkwith@gmail.com<\/a>/);
console.log("Support contact checks passed.");
