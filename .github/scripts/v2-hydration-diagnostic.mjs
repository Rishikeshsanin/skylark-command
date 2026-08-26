import { chromium } from "playwright";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on("console", (message) => {
  console.log(`[browser:${message.type()}] ${message.text()}`);
});
page.on("pageerror", (error) => {
  console.log(`[pageerror] ${error.stack ?? error.message}`);
});

try {
  const response = await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 30_000 });
  console.log(`Overview HTTP ${response?.status() ?? "no response"}`);
  await page.waitForTimeout(1_000);
} finally {
  await context.close();
  await browser.close();
}
