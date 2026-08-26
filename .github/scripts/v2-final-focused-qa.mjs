import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const outputRoot = process.env.QA_OUTPUT_DIR ?? "artifacts/v2-responsive-final";
const customerKey = "COMPANY089";
const routes = ["/", "/copilot", `/customers/${customerKey}`];
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
const hydrationPattern = /hydration|React error #418|server rendered HTML|server rendered text didn't match|text content does not match/i;

function addFinding(viewport, route, category, message, data) {
  findings.push({ severity: "P1", viewport, route, category, message, ...(data ? { data } : {}) });
}

function addP0(viewport, route, category, message, data) {
  findings.push({ severity: "P0", viewport, route, category, message, ...(data ? { data } : {}) });
}

async function screenshot(page, viewport, route) {
  const dir = path.join(outputRoot, viewport);
  await fs.mkdir(dir, { recursive: true });
  const slug = route === "/" ? "overview" : route.replace(/^\//, "").replaceAll("/", "-");
  await page.screenshot({ path: path.join(dir, `${slug}.png`), fullPage: true });
}

async function inspectAffectedRoute(browser, viewport, route) {
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

  try {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
    if (!response?.ok()) {
      addP0(viewport.name, route, "route", `HTTP ${response?.status() ?? "no response"}`);
      return;
    }
    await page.waitForTimeout(viewport.reducedMotion === "reduce" ? 100 : 560);

    const state = await page.evaluate(() => {
      const rootOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth;
      const money = document.querySelector(".customer-money-value");
      const moneyRect = money?.getBoundingClientRect();
      const moneyClipped = money
        ? money.scrollWidth > money.clientWidth + 2 || money.scrollHeight > money.clientHeight + 2
        : false;
      const targets = innerWidth <= 430
        ? Array.from(document.querySelectorAll(".customer-link,.customer-evidence > summary"))
            .map((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return {
                visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
                label: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              };
            })
            .filter((target) => target.visible && (target.width < 44 || target.height < 44))
        : [];
      return {
        rootOverflow,
        moneyClipped,
        money: moneyRect
          ? { text: money?.textContent?.trim(), width: moneyRect.width, scrollWidth: money?.scrollWidth }
          : null,
        targets,
      };
    });

    if (state.rootOverflow > 1) addP0(viewport.name, route, "responsive", `Page-level horizontal overflow of ${state.rootOverflow}px`);
    if (route.startsWith("/customers/") && state.moneyClipped) {
      addFinding(viewport.name, route, "customer-kpi", "Customer 360 receivables KPI is clipped", state.money);
    }
    if (route.startsWith("/customers/") && state.targets.length) {
      addFinding(viewport.name, route, "touch-target", "Customer 360 mobile target below 44px", state.targets);
    }
    const hydrationErrors = errors.filter((error) => hydrationPattern.test(error));
    if (route === "/" && hydrationErrors.length) {
      addFinding(viewport.name, route, "hydration", "Overview emitted a hydration mismatch", hydrationErrors);
    }
    const otherErrors = errors.filter((error) => !hydrationPattern.test(error));
    if (otherErrors.length) addFinding(viewport.name, route, "console", "Unexpected browser error", otherErrors);

    observations.push({ viewport: viewport.name, route, state });
    await screenshot(page, viewport.name, route);
  } finally {
    await context.close();
  }
}

async function waitForReply(page, previousCount) {
  await page.waitForFunction(
    (count) => document.querySelectorAll(".assistant-message .assistant-answer").length > count,
    previousCount,
    { timeout: 30_000 },
  );
  await page.waitForFunction(() => !document.querySelector(".thinking-card"), { timeout: 30_000 });
  await page.waitForTimeout(100);
}

async function runCopilotInteraction(browser, viewport) {
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

  try {
    const response = await page.goto(`${baseUrl}/copilot`, { waitUntil: "networkidle", timeout: 30_000 });
    if (!response?.ok()) {
      addP0(`copilot-${viewport.name}`, "/copilot", "route", `HTTP ${response?.status() ?? "no response"}`);
      return;
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
      const previous = await page.locator(".assistant-message .assistant-answer").count();
      await composer.fill(prompt);
      await composer.press("Enter");
      await waitForReply(page, previous);
      const focused = await composer.evaluate((element) => document.activeElement === element);
      if (!focused) addFinding(`copilot-${viewport.name}`, "/copilot", "focus", `Composer focus not restored after: ${prompt}`);
    }

    const thread = page.locator(".copilot-scroll-thread");
    await thread.evaluate((element) => { element.scrollTop = 0; });
    await page.waitForTimeout(100);
    const beforeTop = await thread.evaluate((element) => element.scrollTop);
    const previous = await page.locator(".assistant-message .assistant-answer").count();
    await composer.fill("what is open pipeline?");
    await composer.press("Enter");
    await waitForReply(page, previous);

    const focusedAfterScrolledSend = await composer.evaluate((element) => document.activeElement === element);
    if (!focusedAfterScrolledSend) {
      addFinding(`copilot-${viewport.name}`, "/copilot", "focus", "Composer focus not restored after sending while manually scrolled up");
    }

    const afterTop = await thread.evaluate((element) => element.scrollTop);
    if (afterTop > beforeTop + 100) {
      addFinding(`copilot-${viewport.name}`, "/copilot", "scroll", "New response overrode manual scroll position", { beforeTop, afterTop });
    }

    const jump = page.getByRole("button", { name: /Jump to latest/i });
    const jumpVisible = await jump.isVisible().catch(() => false);
    if (!jumpVisible) {
      addFinding(`copilot-${viewport.name}`, "/copilot", "scroll", "Jump to latest did not appear after manual scroll-up");
    } else {
      await jump.click();
      await page.waitForTimeout(80);
      const distance = await thread.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
      if (distance > 4) {
        addFinding(`copilot-${viewport.name}`, "/copilot", "scroll", "Jump to latest did not reach nested conversation bottom", { distance });
      }
    }

    if (viewport.width <= 430) {
      const overlap = await page.evaluate(() => {
        const composerElement = document.querySelector(".copilot-quality-composer");
        const threadElement = document.querySelector(".copilot-scroll-thread");
        if (!composerElement || !threadElement) return null;
        threadElement.scrollTop = threadElement.scrollHeight;
        const lastAnswer = threadElement.querySelector(".assistant-message:last-of-type") ?? threadElement.lastElementChild;
        if (!lastAnswer) return null;
        const composerRect = composerElement.getBoundingClientRect();
        const lastRect = lastAnswer.getBoundingClientRect();
        return { composerTop: composerRect.top, lastBottom: lastRect.bottom, obscured: lastRect.bottom > composerRect.top - 4 };
      });
      if (overlap?.obscured) {
        addFinding(`copilot-${viewport.name}`, "/copilot", "composer", "Sticky composer obscures latest conversation content", overlap);
      }
    }

    if (errors.length) addFinding(`copilot-${viewport.name}`, "/copilot", "console", "Copilot emitted browser errors", errors);
    const dir = path.join(outputRoot, `copilot-${viewport.name}`);
    await fs.mkdir(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, "interaction.png"), fullPage: true });
  } finally {
    await context.close();
  }
}

await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    for (const route of routes) await inspectAffectedRoute(browser, viewport, route);
  }
  await runCopilotInteraction(browser, viewports[1]);
  await runCopilotInteraction(browser, viewports[6]);
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  customerKey,
  routes,
  viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
  findings,
  observations,
};
await fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2));

const p0 = findings.filter((finding) => finding.severity === "P0").length;
const p1 = findings.filter((finding) => finding.severity === "P1").length;
console.log(JSON.stringify({ testedRoutes: routes.length, testedViewports: viewports.length, findings: findings.length, p0, p1 }, null, 2));
if (findings.length) {
  for (const finding of findings) console.log(`${finding.severity} ${finding.viewport} ${finding.route} [${finding.category}] ${finding.message}${finding.data ? ` :: ${JSON.stringify(finding.data)}` : ""}`);
  process.exitCode = 1;
}
