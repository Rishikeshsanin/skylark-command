import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const outputRoot = process.env.QA_OUTPUT_DIR ?? "artifacts/v2-responsive-qa";
const realCustomerKey = "COMPANY089";

const routes = ["/", "/copilot", `/customers/${realCustomerKey}`];
const viewports = [
  { name: "desktop-1920", width: 1920, height: 1080, reducedMotion: "no-preference" },
  { name: "desktop-1440", width: 1440, height: 900, reducedMotion: "no-preference" },
  { name: "laptop-1366", width: 1366, height: 768, reducedMotion: "no-preference" },
  { name: "tablet-1024", width: 1024, height: 768, reducedMotion: "no-preference" },
  { name: "tablet-768", width: 768, height: 1024, reducedMotion: "reduce" },
  { name: "mobile-430", width: 430, height: 932, reducedMotion: "reduce" },
  { name: "mobile-390", width: 390, height: 844, reducedMotion: "reduce" },
  { name: "mobile-375", width: 375, height: 667, reducedMotion: "reduce" },
];

const findings = [];
const observations = [];

function record(severity, viewport, route, category, message, data) {
  findings.push({ severity, viewport, route, category, message, ...(data ? { data } : {}) });
}

function observe(viewport, route, category, message, data) {
  observations.push({ viewport, route, category, message, ...(data ? { data } : {}) });
}

function routeSlug(route) {
  if (route === "/") return "overview";
  return route.replace(/^\//, "").replaceAll("/", "-");
}

function isHydrationError(message) {
  return /hydration|React error #418|server rendered HTML|hydrated but some attributes|text content does not match/i.test(message);
}

await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: viewport.reducedMotion,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      const response = await page.goto(`${baseUrl}${route}`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      if (!response?.ok()) {
        record("P0", viewport.name, route, "route", `HTTP ${response?.status() ?? "no response"}`);
        await context.close();
        continue;
      }
      await page.waitForTimeout(viewport.reducedMotion === "reduce" ? 80 : 560);

      const geometry = await page.evaluate(() => {
        const rootOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
        const customerMoney = document.querySelector(".customer-money-value");
        const customerMoneyRect = customerMoney?.getBoundingClientRect();
        const customerMoneyClipped = customerMoney
          ? customerMoney.scrollWidth > customerMoney.clientWidth + 2 || customerMoney.scrollHeight > customerMoney.clientHeight + 2
          : false;
        const mobileTargets = window.innerWidth <= 430
          ? Array.from(document.querySelectorAll(".customer-link,.customer-evidence > summary"))
              .filter((element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
              })
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  label: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ?? element.tagName,
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                };
              })
              .filter((target) => target.width < 44 || target.height < 44)
          : [];
        return {
          rootOverflow,
          customerMoneyClipped,
          customerMoney: customerMoneyRect
            ? {
                text: customerMoney?.textContent?.trim(),
                width: customerMoneyRect.width,
                scrollWidth: customerMoney?.scrollWidth,
                height: customerMoneyRect.height,
                scrollHeight: customerMoney?.scrollHeight,
              }
            : null,
          mobileTargets,
        };
      });

      if (geometry.rootOverflow > 1) {
        record("P0", viewport.name, route, "responsive", `Page-level horizontal overflow of ${geometry.rootOverflow}px`);
      }
      if (route.startsWith("/customers/") && geometry.customerMoneyClipped) {
        record("P1", viewport.name, route, "customer-kpi", "Customer 360 receivables KPI is clipped", geometry.customerMoney);
      }
      if (route.startsWith("/customers/") && geometry.mobileTargets.length) {
        record("P1", viewport.name, route, "touch-target", "Customer 360 mobile targets below 44px", geometry.mobileTargets);
      }
      if (route === "/" && errors.some(isHydrationError)) {
        record("P1", viewport.name, route, "hydration", "Overview emitted a React hydration mismatch", errors.filter(isHydrationError));
      }
      const unexpectedErrors = errors.filter((message) => !isHydrationError(message));
      if (unexpectedErrors.length) {
        record("P1", viewport.name, route, "console", "Unexpected browser console/page errors", unexpectedErrors);
      }

      const dir = path.join(outputRoot, viewport.name);
      await fs.mkdir(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${routeSlug(route)}.png`), fullPage: true });
      observe(viewport.name, route, "render", "Focused final render completed", geometry);
      await context.close();
    }
  }

  for (const viewport of [viewports[1], viewports[6]]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: viewport.reducedMotion,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.route("**/api/chat", async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 220));
      await route.continue();
    });

    const response = await page.goto(`${baseUrl}/copilot`, { waitUntil: "networkidle", timeout: 30_000 });
    if (!response?.ok()) {
      record("P0", `copilot-${viewport.name}`, "/copilot", "route", `HTTP ${response?.status() ?? "no response"}`);
      await context.close();
      continue;
    }

    const composer = page.getByLabel("Ask Founder Copilot");
    const prompts = [
      "hi",
      "what can you do?",
      "what is open pipeline?",
      "how is energy sector performing?",
      "which sector has the largest pipeline?",
      "Only deals above ₹1Cr",
      "Which customers are behind those?",
      "What changed since last week?",
    ];

    for (const prompt of prompts) {
      const before = await page.locator(".assistant-message .assistant-answer").count();
      await composer.fill(prompt);
      await composer.press("Enter");
      await page.waitForFunction(
        (count) => document.querySelectorAll(".assistant-message .assistant-answer").length > count,
        before,
        { timeout: 30_000 },
      );
      await page.waitForFunction(() => !document.querySelector(".thinking-card"), { timeout: 30_000 });
      await page.waitForTimeout(80);
      const focused = await composer.evaluate((element) => document.activeElement === element);
      if (!focused) {
        record("P1", `copilot-${viewport.name}`, "/copilot", "focus", `Composer focus was not restored after: ${prompt}`);
      }
    }

    const thread = page.locator(".copilot-scroll-thread");
    await thread.evaluate((element) => { element.scrollTop = 0; });
    await page.waitForTimeout(80);
    const beforeTop = await thread.evaluate((element) => element.scrollTop);
    const beforeAssistants = await page.locator(".assistant-message .assistant-answer").count();
    await composer.fill("what is open pipeline?");
    await composer.press("Enter");
    await page.waitForFunction(
      (count) => document.querySelectorAll(".assistant-message .assistant-answer").length > count,
      beforeAssistants,
      { timeout: 30_000 },
    );
    await page.waitForFunction(() => !document.querySelector(".thinking-card"), { timeout: 30_000 });
    await page.waitForTimeout(80);

    const jump = page.getByRole("button", { name: /Jump to latest/i });
    const jumpVisible = await jump.isVisible().catch(() => false);
    const afterTop = await thread.evaluate((element) => element.scrollTop);
    if (!jumpVisible) {
      record("P1", `copilot-${viewport.name}`, "/copilot", "scroll", "Jump to latest did not appear after manual scroll-up");
    }
    if (afterTop > beforeTop + 100) {
      record("P1", `copilot-${viewport.name}`, "/copilot", "scroll", "New response overrode manual scroll position", { beforeTop, afterTop });
    }
    if (jumpVisible) {
      await jump.click();
      await page.waitForTimeout(80);
      const distance = await thread.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
      if (distance > 4) {
        record("P1", `copilot-${viewport.name}`, "/copilot", "scroll", "Jump to latest did not reach the nested conversation bottom", { distance });
      }
    }

    if (viewport.width <= 430) {
      const overlap = await page.evaluate(() => {
        const composerElement = document.querySelector(".copilot-quality-composer");
        const threadElement = document.querySelector(".copilot-scroll-thread");
        const lastMessage = threadElement?.querySelector(".assistant-message:last-of-type") ?? threadElement?.lastElementChild;
        if (!composerElement || !threadElement || !lastMessage) return null;
        threadElement.scrollTop = threadElement.scrollHeight;
        const formRect = composerElement.getBoundingClientRect();
        const lastRect = lastMessage.getBoundingClientRect();
        return {
          formTop: formRect.top,
          lastBottom: lastRect.bottom,
          obscured: lastRect.bottom > formRect.top - 4,
        };
      });
      if (overlap?.obscured) {
        record("P1", `copilot-${viewport.name}`, "/copilot", "composer", "Sticky composer obscures latest conversation content", overlap);
      }
    }

    const focusedAfterScroll = await composer.evaluate((element) => document.activeElement === element);
    if (!focusedAfterScroll) {
      record("P1", `copilot-${viewport.name}`, "/copilot", "focus", "Composer focus was not restored after the final send");
    }
    if (errors.length) {
      record("P1", `copilot-${viewport.name}`, "/copilot", "console", "Copilot emitted browser errors", errors);
    }

    const dir = path.join(outputRoot, `copilot-${viewport.name}`);
    await fs.mkdir(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, "interaction-final.png"), fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  testedRoutes: routes,
  testedViewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
  realCustomerKey,
  findings,
  observations,
};
await fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2));

const p0 = findings.filter((finding) => finding.severity === "P0").length;
const p1 = findings.filter((finding) => finding.severity === "P1").length;
console.log(JSON.stringify({ testedRoutes: routes.length, testedViewports: viewports.length, realCustomerKey, findings: findings.length, p0, p1 }, null, 2));
if (findings.length) {
  console.log("\nFocused QA findings:");
  for (const finding of findings) {
    console.log(`${finding.severity} ${finding.viewport} ${finding.route} [${finding.category}] ${finding.message}${finding.data ? ` :: ${JSON.stringify(finding.data)}` : ""}`);
  }
  process.exitCode = 1;
}
