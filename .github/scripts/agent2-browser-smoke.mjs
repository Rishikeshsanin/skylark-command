import { chromium } from "playwright";

const routes = ["/", "/copilot", "/pipeline", "/operations", "/leadership", "/data-health"];
const viewports = [
  { name: "desktop", width: 1440, height: 900, reducedMotion: "no-preference" },
  { name: "mobile", width: 390, height: 844, reducedMotion: "reduce" },
];
const failures = [];
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: viewport.reducedMotion,
    });

    for (const route of routes) {
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") failures.push(`${viewport.name} ${route}: console error: ${message.text()}`);
      });
      page.on("pageerror", (error) => failures.push(`${viewport.name} ${route}: page error: ${error.message}`));

      const response = await page.goto(`http://127.0.0.1:3000${route}`, { waitUntil: "networkidle" });
      if (!response?.ok()) failures.push(`${viewport.name} ${route}: HTTP ${response?.status() ?? "no response"}`);

      const h1Count = await page.locator("h1").count();
      if (h1Count !== 1) failures.push(`${viewport.name} ${route}: expected one page heading, found ${h1Count}`);

      const overflow = await page.evaluate(() => {
        const viewportWidth = window.innerWidth;
        return document.documentElement.scrollWidth > viewportWidth + 1 || document.body.scrollWidth > viewportWidth + 1;
      });
      if (overflow) failures.push(`${viewport.name} ${route}: page-level horizontal overflow detected`);

      await page.keyboard.press("Tab");
      const focusTag = await page.evaluate(() => document.activeElement?.tagName ?? "NONE");
      if (focusTag === "BODY" || focusTag === "HTML" || focusTag === "NONE") {
        failures.push(`${viewport.name} ${route}: keyboard focus did not enter an interactive element`);
      }

      if (route === "/copilot") {
        const liveRegions = await page.locator('[aria-live="polite"]').count();
        if (liveRegions < 1) failures.push(`${viewport.name} ${route}: expected a polite ARIA live region`);
        const composer = page.getByLabel("Ask Founder Copilot");
        if (await composer.count() !== 1) failures.push(`${viewport.name} ${route}: Copilot composer label missing`);
        const maxLength = await composer.getAttribute("maxlength");
        if (maxLength !== "2000") failures.push(`${viewport.name} ${route}: expected 2000-character input limit`);
      }

      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Browser smoke passed for ${routes.length} routes across ${viewports.length} viewports with keyboard, ARIA, reduced-motion, and overflow checks.`);
