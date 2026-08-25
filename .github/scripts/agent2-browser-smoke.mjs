import { chromium } from "playwright";

const routes = ["/", "/copilot", "/pipeline", "/operations", "/leadership", "/data-health"];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const failures = [];
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
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

console.log(`Browser smoke passed for ${routes.length} routes across ${viewports.length} viewports.`);
