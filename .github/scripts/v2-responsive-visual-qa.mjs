import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const outputRoot = process.env.QA_OUTPUT_DIR ?? "artifacts/v2-responsive-qa";
const realCustomerKey = "COMPANY089";

const routes = [
  "/",
  "/copilot",
  "/pipeline",
  "/operations",
  "/leadership",
  "/data-health",
  "/changes",
  `/customers/${realCustomerKey}`,
];

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

function record(severity, viewport, route, category, message, data = undefined) {
  findings.push({ severity, viewport, route, category, message, ...(data ? { data } : {}) });
}

function observe(viewport, route, category, message, data = undefined) {
  observations.push({ viewport, route, category, message, ...(data ? { data } : {}) });
}

function routeSlug(route) {
  if (route === "/") return "overview";
  return route.replace(/^\//, "").replaceAll("/", "-");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function inspectPage(page, viewport, route) {
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
  if (!response?.ok()) {
    record("P0", viewport.name, route, "route", `HTTP ${response?.status() ?? "no response"}`);
    return;
  }

  await page.waitForTimeout(viewport.reducedMotion === "reduce" ? 80 : 560);

  const report = await page.evaluate(() => {
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (el) =>
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) ||
      el.tagName.toLowerCase();

    const rootOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
    const h1Count = document.querySelectorAll("h1").length;
    const mainCount = document.querySelectorAll("main").length;
    const navCount = document.querySelectorAll("nav").length;

    const clippedText = Array.from(document.querySelectorAll(
      ".metric-value,.compact-value span,.stacked-value-heading strong,.stacked-value-legend strong,.donut-legend strong,.waterfall-values strong,.customer-identity-key,.answer-metrics strong"
    )).filter(isVisible).flatMap((el) => {
      const clipped = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      if (!clipped) return [];
      const r = el.getBoundingClientRect();
      return [{ label: labelFor(el), width: r.width, scrollWidth: el.scrollWidth, height: r.height, scrollHeight: el.scrollHeight }];
    });

    const outsideViewport = Array.from(document.querySelectorAll(
      ".panel,.metric-card,.state-card,.assistant-answer,.copilot-composer,.copilot-welcome,.chart-empty-state,.stacked-value-chart,.donut-chart,.trend-chart,.waterfall-chart"
    )).filter(isVisible).flatMap((el) => {
      if (el.closest(".table-wrap")) return [];
      const r = el.getBoundingClientRect();
      const overflowLeft = Math.max(0, -r.left);
      const overflowRight = Math.max(0, r.right - window.innerWidth);
      if (overflowLeft <= 1 && overflowRight <= 1) return [];
      return [{ label: labelFor(el), left: r.left, right: r.right, overflowLeft, overflowRight }];
    });

    const localTables = Array.from(document.querySelectorAll(".table-wrap")).filter(isVisible).map((el) => ({
      width: el.clientWidth,
      scrollWidth: el.scrollWidth,
      locallyScrollable: el.scrollWidth > el.clientWidth + 1,
      overflowX: getComputedStyle(el).overflowX,
    }));

    const chartProblems = Array.from(document.querySelectorAll(
      ".stacked-value-chart,.donut-chart,.trend-chart,.waterfall-chart,.data-health-donut-frame"
    )).filter(isVisible).flatMap((chart) => {
      const rect = chart.getBoundingClientRect();
      const parent = chart.parentElement?.getBoundingClientRect();
      const problems = [];
      if (rect.width < 120 || rect.height < 50) problems.push("implausibly small chart geometry");
      if (parent && rect.width > parent.width + 2) problems.push("chart wider than its parent");
      if (chart.scrollWidth > chart.clientWidth + 2) problems.push("chart content horizontally overflows");
      return problems.length ? [{ label: labelFor(chart), problems, width: rect.width, height: rect.height }] : [];
    });

    const unnamedRoleImages = Array.from(document.querySelectorAll('[role="img"]')).filter(isVisible).flatMap((el) => {
      const name = el.getAttribute("aria-label") || el.querySelector("title")?.textContent?.trim();
      return name ? [] : [{ tag: el.tagName, className: el.getAttribute("class") }];
    });

    const unnamedControls = Array.from(document.querySelectorAll("button,a[href],summary,input,textarea,select")).filter(isVisible).flatMap((el) => {
      const id = el.getAttribute("id");
      const associatedLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : "";
      const name = el.getAttribute("aria-label") || associatedLabel || el.textContent?.trim() || el.getAttribute("placeholder") || el.getAttribute("title");
      return name ? [] : [{ tag: el.tagName, className: el.getAttribute("class") }];
    });

    const touchTargets = window.innerWidth <= 430
      ? Array.from(document.querySelectorAll("button,a[href],summary,input,textarea,select")).filter(isVisible).flatMap((el) => {
          if (el.classList.contains("skip-link")) return [];
          const r = el.getBoundingClientRect();
          const inlineTextLink = el.tagName === "A" && r.width > 80 && r.height >= 32;
          if (inlineTextLink) return [];
          if (r.width >= 44 && r.height >= 44) return [];
          return [{ label: labelFor(el), tag: el.tagName, width: Math.round(r.width), height: Math.round(r.height), className: el.getAttribute("class") }];
        })
      : [];

    const activeAnimations = Array.from(document.querySelectorAll("*")).filter(isVisible).flatMap((el) => {
      const s = getComputedStyle(el);
      const durations = `${s.animationDuration},${s.transitionDuration}`.split(",").map((v) => v.trim()).filter(Boolean);
      const ms = durations.map((v) => v.endsWith("ms") ? Number.parseFloat(v) : Number.parseFloat(v) * 1000).filter(Number.isFinite);
      const max = ms.length ? Math.max(...ms) : 0;
      return max > 500 ? [{ label: labelFor(el), maxDurationMs: max, animationName: s.animationName, transitionDuration: s.transitionDuration }] : [];
    }).slice(0, 30);

    return {
      title: document.title,
      h1Count,
      mainCount,
      navCount,
      rootOverflow,
      clippedText,
      outsideViewport,
      localTables,
      chartProblems,
      unnamedRoleImages,
      unnamedControls,
      touchTargets,
      activeAnimations,
      chartCount: document.querySelectorAll(".stacked-value-chart,.donut-chart,.trend-chart,.waterfall-chart").length,
      emptyChartStateCount: document.querySelectorAll(".chart-empty-state").length,
      bodyHeight: document.body.scrollHeight,
    };
  });

  if (report.h1Count !== 1) record("P1", viewport.name, route, "headings", `Expected exactly one h1, found ${report.h1Count}`);
  if (report.mainCount !== 1) record("P1", viewport.name, route, "landmarks", `Expected exactly one main landmark, found ${report.mainCount}`);
  if (report.navCount < 1) record("P1", viewport.name, route, "landmarks", "No navigation landmark found");
  if (report.rootOverflow > 1) record("P0", viewport.name, route, "responsive", `Page-level horizontal overflow of ${report.rootOverflow}px`);
  if (report.clippedText.length) record("P1", viewport.name, route, "readability", "Visible important text/value is clipped", report.clippedText);
  if (report.outsideViewport.length) record("P0", viewport.name, route, "responsive", "Major surface extends outside viewport", report.outsideViewport);
  if (report.chartProblems.length) record("P1", viewport.name, route, "visualization", "Chart geometry problem", report.chartProblems);
  if (report.unnamedRoleImages.length) record("P1", viewport.name, route, "accessibility", "Accessible chart/image name missing", report.unnamedRoleImages);
  if (report.unnamedControls.length) record("P1", viewport.name, route, "accessibility", "Interactive control lacks accessible name", report.unnamedControls);
  if (report.touchTargets.length) record("P1", viewport.name, route, "touch-target", "Visible mobile controls below 44px target", report.touchTargets);
  if (report.activeAnimations.length) record("P1", viewport.name, route, "motion", "Animation/transition exceeds 500ms", report.activeAnimations);

  if (viewport.reducedMotion === "reduce") {
    const reducedMotionLeak = await page.evaluate(() => Array.from(document.querySelectorAll("*")).flatMap((el) => {
      const s = getComputedStyle(el);
      const animationDurations = s.animationDuration.split(",").map((v) => v.trim());
      const maxMs = Math.max(0, ...animationDurations.map((v) => v.endsWith("ms") ? Number.parseFloat(v) : Number.parseFloat(v) * 1000).filter(Number.isFinite));
      return s.animationName !== "none" && maxMs > 50 ? [{ tag: el.tagName, className: el.getAttribute("class"), animationName: s.animationName, duration: s.animationDuration }] : [];
    }).slice(0, 20));
    if (reducedMotionLeak.length) record("P1", viewport.name, route, "reduced-motion", "Non-trivial animation remains under prefers-reduced-motion", reducedMotionLeak);
  }

  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const style = getComputedStyle(el);
    return { tag: el.tagName, text: el.textContent?.trim().slice(0, 80), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  if (!focus || ["BODY", "HTML"].includes(focus.tag)) {
    record("P1", viewport.name, route, "keyboard", "Keyboard focus did not enter an interactive element");
  }

  observe(viewport.name, route, "render", "Rendered successfully", {
    chartCount: report.chartCount,
    emptyChartStateCount: report.emptyChartStateCount,
    bodyHeight: report.bodyHeight,
    localScrollableTables: report.localTables.filter((table) => table.locallyScrollable).length,
  });

  const dir = path.join(outputRoot, viewport.name);
  await ensureDir(dir);
  await page.screenshot({ path: path.join(dir, `${routeSlug(route)}.png`), fullPage: true });
}

async function waitForAssistant(page, previousCount) {
  await page.waitForFunction(
    (count) => document.querySelectorAll(".assistant-message .assistant-answer").length > count,
    previousCount,
    { timeout: 30_000 },
  );
  await page.waitForFunction(() => !document.querySelector(".thinking-card"), { timeout: 30_000 });
}

async function runCopilotInteraction(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: viewport.reducedMotion,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  // Delay chat POSTs slightly so a human-visible loading state can be asserted.
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 220));
    await route.continue();
  });

  const response = await page.goto(`${baseUrl}/copilot`, { waitUntil: "networkidle", timeout: 30_000 });
  if (!response?.ok()) {
    record("P0", viewport.name, "/copilot", "copilot", `Interactive Copilot route HTTP ${response?.status() ?? "none"}`);
    await context.close();
    return;
  }

  const composer = page.getByLabel("Ask Founder Copilot");
  await composer.fill("Line one");
  const minHeight = await composer.evaluate((el) => el.getBoundingClientRect().height);
  await composer.fill("Line one\nLine two\nLine three\nLine four");
  const grownHeight = await composer.evaluate((el) => el.getBoundingClientRect().height);
  if (grownHeight <= minHeight + 5) record("P1", viewport.name, "/copilot", "composer", "Composer did not auto-grow", { minHeight, grownHeight });
  await composer.fill("Shift line");
  await composer.press("Shift+Enter");
  const shiftValue = await composer.inputValue();
  if (!shiftValue.includes("\n")) record("P1", viewport.name, "/copilot", "composer", "Shift+Enter did not insert newline");
  if (await page.locator(".user-message").count()) record("P1", viewport.name, "/copilot", "composer", "Shift+Enter unexpectedly submitted message");
  await composer.fill("");

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
    const previousAssistants = await page.locator(".assistant-message .assistant-answer").count();
    const previousUsers = await page.locator(".user-message").count();
    await composer.fill(prompt);
    await composer.press("Enter");

    await page.waitForFunction(
      (count) => document.querySelectorAll(".user-message").length > count,
      previousUsers,
      { timeout: 2_000 },
    );
    const loadingVisible = await page.locator(".thinking-card").isVisible().catch(() => false);
    if (!loadingVisible) record("P1", viewport.name, "/copilot", "loading", `No visible loading state after sending: ${prompt}`);
    await waitForAssistant(page, previousAssistants);

    const focused = await composer.evaluate((el) => document.activeElement === el);
    if (!focused) record("P1", viewport.name, "/copilot", "keyboard", `Composer focus not restored after: ${prompt}`);
  }

  // Manual scroll-up must be respected; a follow-up should not yank the user to the bottom.
  const thread = page.locator(".copilot-scroll-thread");
  if (await thread.count()) {
    await thread.evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
    await page.waitForTimeout(80);
    const beforeTop = await thread.evaluate((el) => el.scrollTop);
    const previousAssistants = await page.locator(".assistant-message .assistant-answer").count();
    await composer.fill("what is open pipeline?");
    await composer.press("Enter");
    await waitForAssistant(page, previousAssistants);
    const jumpVisible = await page.getByRole("button", { name: /Jump to latest/i }).isVisible().catch(() => false);
    const afterTop = await thread.evaluate((el) => el.scrollTop);
    if (!jumpVisible) record("P1", viewport.name, "/copilot", "scroll", "Jump to latest did not appear after manual scroll-up");
    if (afterTop > beforeTop + 100) record("P1", viewport.name, "/copilot", "scroll", "New response overrode manual scroll position", { beforeTop, afterTop });
    if (jumpVisible) {
      await page.getByRole("button", { name: /Jump to latest/i }).click();
      await page.waitForTimeout(viewport.reducedMotion === "reduce" ? 40 : 420);
      const distance = await thread.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
      if (distance > 140) record("P1", viewport.name, "/copilot", "scroll", "Jump to latest did not reach newest response", { distance });
    }
  }

  const followUp = page.locator(".choice-button").first();
  if (await followUp.isVisible().catch(() => false)) {
    const usersBefore = await page.locator(".user-message").count();
    const assistantsBefore = await page.locator(".assistant-message .assistant-answer").count();
    await followUp.click();
    await page.waitForFunction((count) => document.querySelectorAll(".user-message").length > count, usersBefore, { timeout: 2_000 });
    await waitForAssistant(page, assistantsBefore);
    observe(viewport.name, "/copilot", "follow-up", "Follow-up chip submitted and returned a response");
  } else {
    observe(viewport.name, "/copilot", "follow-up", "No follow-up chip was supplied by deterministic response states");
  }

  const trustSummary = page.getByText("Why should I trust this?", { exact: true }).last();
  if (await trustSummary.isVisible().catch(() => false)) {
    await trustSummary.focus();
    await trustSummary.press("Enter");
    const detailsOpen = await trustSummary.evaluate((el) => el.parentElement?.hasAttribute("open"));
    if (!detailsOpen) record("P1", viewport.name, "/copilot", "evidence", "Trust drawer did not open by keyboard");
    const evidenceSummary = page.getByText("Show evidence IDs", { exact: true }).last();
    if (await evidenceSummary.isVisible().catch(() => false)) {
      await evidenceSummary.focus();
      await evidenceSummary.press("Enter");
      const evidenceOpen = await evidenceSummary.evaluate((el) => el.parentElement?.hasAttribute("open"));
      if (!evidenceOpen) record("P1", viewport.name, "/copilot", "evidence", "Evidence drawer did not open by keyboard");
    }
  } else {
    record("P1", viewport.name, "/copilot", "evidence", "No trust/evidence disclosure available after analytical responses");
  }

  if (viewport.width <= 430) {
    const geometry = await page.evaluate(() => {
      const form = document.querySelector(".copilot-composer");
      const thread = document.querySelector(".copilot-scroll-thread");
      if (!form) return null;
      const f = form.getBoundingClientRect();
      const t = thread?.getBoundingClientRect();
      return { formTop: f.top, formBottom: f.bottom, viewportHeight: innerHeight, threadBottom: t?.bottom ?? null };
    });
    if (!geometry) record("P0", viewport.name, "/copilot", "composer", "Mobile composer not rendered");
    else {
      if (geometry.formBottom > geometry.viewportHeight + 2) record("P0", viewport.name, "/copilot", "composer", "Mobile composer extends below viewport", geometry);
      if (geometry.threadBottom && geometry.formTop < geometry.threadBottom - 8) record("P1", viewport.name, "/copilot", "composer", "Sticky composer overlaps conversation viewport", geometry);
    }
  }

  if (consoleErrors.length) record("P1", viewport.name, "/copilot", "console", "Console/page errors during Copilot interaction", consoleErrors);
  const dir = path.join(outputRoot, viewport.name);
  await ensureDir(dir);
  await page.screenshot({ path: path.join(dir, "copilot-interaction-final.png"), fullPage: true });
  await context.close();
}

async function runForcedColors(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, forcedColors: "active", reducedMotion: "reduce" });
  const page = await context.newPage();
  const response = await page.goto(`${baseUrl}/copilot`, { waitUntil: "networkidle", timeout: 30_000 });
  if (!response?.ok()) record("P1", "mobile-390-forced-colors", "/copilot", "forced-colors", `HTTP ${response?.status() ?? "none"}`);
  else {
    const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth);
    if (overflow > 1) record("P1", "mobile-390-forced-colors", "/copilot", "forced-colors", `Forced-colors mode has ${overflow}px horizontal overflow`);
    await page.keyboard.press("Tab");
    const focusVisible = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || ["BODY", "HTML"].includes(el.tagName)) return false;
      const s = getComputedStyle(el);
      return s.outlineStyle !== "none" || s.boxShadow !== "none";
    });
    if (!focusVisible) record("P1", "mobile-390-forced-colors", "/copilot", "forced-colors", "Keyboard focus is not visually exposed in forced-colors mode");
    const dir = path.join(outputRoot, "mobile-390-forced-colors");
    await ensureDir(dir);
    await page.screenshot({ path: path.join(dir, "copilot.png"), fullPage: true });
  }
  await context.close();
}

await ensureDir(outputRoot);
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: viewport.reducedMotion,
    });
    for (const route of routes) {
      const page = await context.newPage();
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await inspectPage(page, viewport, route);
      } catch (error) {
        record("P0", viewport.name, route, "browser", error instanceof Error ? error.message : String(error));
      }
      if (errors.length) record("P1", viewport.name, route, "console", "Console/page errors during route render", errors);
      await page.close();
    }
    await context.close();
  }

  await runCopilotInteraction(browser, { name: "copilot-desktop-1440", width: 1440, height: 900, reducedMotion: "no-preference" });
  await runCopilotInteraction(browser, { name: "copilot-mobile-390", width: 390, height: 844, reducedMotion: "reduce" });
  await runForcedColors(browser);
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  realCustomerKey,
  viewports,
  routes,
  findingCount: findings.length,
  findings,
  observations,
};
await fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  testedRoutes: routes.length,
  testedViewports: viewports.length,
  interactiveCopilotViewports: ["1440x900", "390x844"],
  realCustomerKey,
  findings: findings.length,
  p0: findings.filter((f) => f.severity === "P0").length,
  p1: findings.filter((f) => f.severity === "P1").length,
}, null, 2));

if (findings.length) {
  console.error("\nVisual QA findings:\n" + findings.map((f) => `${f.severity} ${f.viewport} ${f.route} [${f.category}] ${f.message}${f.data ? ` :: ${JSON.stringify(f.data)}` : ""}`).join("\n"));
  process.exit(1);
}
