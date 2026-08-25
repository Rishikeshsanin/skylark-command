import { chromium } from "playwright";

const routes = ["/", "/copilot", "/pipeline", "/operations", "/leadership", "/data-health"];
const viewports = [
  { name: "desktop-1440", width: 1440, height: 900, reducedMotion: "no-preference" },
  { name: "desktop-1920", width: 1920, height: 1080, reducedMotion: "no-preference" },
  { name: "laptop", width: 1366, height: 768, reducedMotion: "no-preference" },
  { name: "tablet-landscape", width: 1024, height: 768, reducedMotion: "no-preference" },
  { name: "tablet-portrait", width: 768, height: 1024, reducedMotion: "reduce" },
  { name: "mobile-430", width: 430, height: 932, reducedMotion: "reduce" },
  { name: "mobile-390", width: 390, height: 844, reducedMotion: "reduce" },
  { name: "mobile-375", width: 375, height: 667, reducedMotion: "reduce" },
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

      const homeLinks = await page.locator('a[aria-label="Skylark Command home"]').count();
      const visibleHomeLinks = await page.getByRole("link", { name: "Skylark Command home" }).count();
      if (homeLinks !== 2 || visibleHomeLinks !== 1) {
        failures.push(`${viewport.name} ${route}: expected desktop/mobile home-brand links with exactly one visible`);
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
