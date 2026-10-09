import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*.supabase.co/**", (route) => route.abort());
    await page.goto("http://localhost:5189/scripts/fixtures/interpreter-detail.html");
    await page.getByRole("tab", { name: "활동 정보" }).click();
    await page.getByRole("heading", { name: "ON-LI 인증 관리" }).waitFor();
    const before = await page.getByRole("tablist").boundingBox();
    const metrics = await page.locator(".admin-interpreter-detail-modal").evaluate((modal) => {
      const body = modal.querySelector(".admin-interpreter-detail-body");
      body.scrollTop = body.scrollHeight;
      return {
        width: modal.clientWidth, scrollWidth: modal.scrollWidth,
        bodyWidth: body.clientWidth, bodyScrollWidth: body.scrollWidth,
        background: getComputedStyle(modal.querySelector(".admin-interpreter-verification-card")).backgroundColor,
      };
    });
    assert.equal(metrics.background, "rgb(255, 255, 255)");
    assert.ok(metrics.scrollWidth <= metrics.width + 1, `Modal overflow at ${width}`);
    assert.ok(metrics.bodyScrollWidth <= metrics.bodyWidth + 1, `Body overflow at ${width}`);
    const after = await page.getByRole("tablist").boundingBox();
    assert.equal(before.y, after.y, "Tabs must not scroll away");
    await page.screenshot({ path: `/tmp/onli-interpreter-detail-${width}.png` });
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "인증 해제", exact: true }).click();
    await page.getByRole("button", { name: "자동으로 복귀" }).click();
    const actions = await page.evaluate(() => window.fixtureActions);
    assert.equal(actions[0][1].certification_mode, "manual_rejected");
    assert.equal(actions[1][1].certification_mode, "auto");
    await page.getByRole("tab", { name: "기본 정보" }).click();
    assert.equal(await page.locator(".admin-interpreter-detail-body").evaluate((body) => body.scrollTop), 0);
    await page.getByRole("tab", { name: "기본 정보" }).press("ArrowRight");
    await page.getByRole("tab", { name: "활동 정보", selected: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS: ${width}px layout, fixed tabs, keyboard navigation and certification actions`);
    await page.close();
  }
} finally { await browser.close(); }
