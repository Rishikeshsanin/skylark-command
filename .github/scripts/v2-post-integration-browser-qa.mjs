import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const outputRoot = process.env.QA_OUTPUT_DIR ?? "artifacts/v2-post-integration";
const customerKey = "COMPANY089";

const primaryRoutes = [
  "/",
  "/copilot",
  `/customers/${customerKey}`,
  "/changes",
  "/data-health",
];
const smokeRoutes = ["/pipeline", "/operations", "/leadership"];
const viewports = [
  { name: "desktop-1440", width: 1440, height: 900, reducedMotion: "no-preference" },
  { name: "laptop-1366", width: 1366, height: 768, reducedMotion: "no-preference" },
  { name: "tablet-1024", width: 1024, height: 768, reducedMotion: "no-preference" },
  { name: "tablet-768", width: 768, height: 1024, reducedMotion: "reduce" },
  { name: "mobile-430", width: 430, height: 932, reducedMotion: "reduce" },
  { name: "mobile-390", width: 390, height: 844, reducedMotion: "reduce" },
  { name: "mobile-375", width: 375, height: 667, reducedMotion: "reduce" },
];

const hydrationPattern = /hydration|React error #418|server rendered HTML|server rendered text didn't match|text content does not match/i;
const findings = [];
const observations = [];

function finding(severity, viewport, route, category, message, data) {
  findings.push({ severity, viewport, route, category, message, ...(data ? { data } : {}) });
}

async function capture(page, viewportName, route, suffix = "") {
  const directory = path.join(outputRoot, viewportName);
  await fs.mkdir(directory, { recursive: true });
  const slug = route === "/" ? "overview" : route.replace(/^\//, "").replaceAll("/", "-");
  await page.screenshot({
    path: path.join(directory, `${slug}${suffix}.png`),
    fullPage: true,
  });
}

async function inspectPage(browser, viewport, route, { smoke = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: viewport.reducedMotion,
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  try {
    const response = await page.goto(`${baseUrl}${route}`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    if (!response?.ok()) {
      finding("P0", viewport.name, route, "route", `HTTP ${response?.status() ?? "no response"}`);
      return;
    }

    await page.waitForTimeout(viewport.reducedMotion === "reduce" ? 320 : 650);

    const beforeMoney = await page.locator("body").evaluate(() =>
      Array.from(document.querySelectorAll("body *"))
        .filter((element) => element.children.length === 0 && element.textContent?.includes("₹"))
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((element) => element.textContent?.trim())
        .filter(Boolean)
        .slice(0, 24),
    );
    await page.waitForTimeout(120);

    const state = await page.evaluate(() => {
      const bodyWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      const rootOverflow = bodyWidth - innerWidth;
      const customerMoney = document.querySelector(".customer-money-value");
      const customerMoneyRect = customerMoney?.getBoundingClientRect();

      // Audit actual native product controls. Do not treat generic role="button"
      // attributes on chart-library SVG internals as standalone touch targets.
      const touchTargets = innerWidth <= 390
        ? Array.from(document.querySelectorAll("button, summary, a.customer-link, .customer-evidence > summary"))
            .map((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
              return {
                visible,
                label: element.getAttribute("aria-label") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || element.tagName,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              };
            })
            .filter((target) => target.visible && (target.width < 44 || target.height < 44))
        : [];

      const largeVisuals = Array.from(document.querySelectorAll("svg, canvas"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            visible: rect.width >= 120 && rect.height >= 60,
          };
        })
        .filter((visual) => visual.visible);

      const clippedVisuals = largeVisuals.filter((visual) => visual.left < -2 || visual.right > innerWidth + 2);

      const runningAnimations = typeof document.getAnimations === "function"
        ? document.getAnimations().filter((animation) => {
            if (animation.playState !== "running") return false;
            const timing = animation.effect?.getTiming?.();
            const duration = typeof timing?.duration === "number" ? timing.duration : 0;
            return duration > 100;
          }).length
        : 0;

      return {
        rootOverflow,
        touchTargets,
        largeVisuals,
        clippedVisuals,
        runningAnimations,
        customerMoney: customerMoneyRect
          ? {
              text: customerMoney?.textContent?.trim(),
              width: Math.round(customerMoneyRect.width),
              height: Math.round(customerMoneyRect.height),
              scrollWidth: customerMoney?.scrollWidth ?? 0,
              scrollHeight: customerMoney?.scrollHeight ?? 0,
              clientWidth: customerMoney?.clientWidth ?? 0,
              clientHeight: customerMoney?.clientHeight ?? 0,
            }
          : null,
      };
    });

    const afterMoney = await page.locator("body").evaluate(() =>
      Array.from(document.querySelectorAll("body *"))
        .filter((element) => element.children.length === 0 && element.textContent?.includes("₹"))
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((element) => element.textContent?.trim())
        .filter(Boolean)
        .slice(0, 24),
    );

    if (state.rootOverflow > 1) {
      finding("P0", viewport.name, route, "responsive", `Page-level horizontal overflow of ${state.rootOverflow}px`);
    }

    const hydrationErrors = browserErrors.filter((message) => hydrationPattern.test(message));
    if (hydrationErrors.length) {
      finding("P0", viewport.name, route, "hydration", "Hydration mismatch detected", hydrationErrors);
    }

    const otherErrors = browserErrors.filter((message) => !hydrationPattern.test(message));
    if (otherErrors.length) {
      finding("P1", viewport.name, route, "console", "Unexpected browser error", otherErrors);
    }

    if (JSON.stringify(beforeMoney) !== JSON.stringify(afterMoney)) {
      finding("P1", viewport.name, route, "currency", "Rendered INR text changed after hydration/settling", { beforeMoney, afterMoney });
    }

    if (afterMoney.some((text) => /(?:NaN|undefined|Invalid)/i.test(text))) {
      finding("P0", viewport.name, route, "currency", "Invalid deterministic INR output", afterMoney);
    }

    if (route.startsWith("/customers/") && state.customerMoney) {
      const money = state.customerMoney;
      if (money.scrollWidth > money.clientWidth + 2 || money.scrollHeight > money.clientHeight + 2) {
        finding("P1", viewport.name, route, "customer-kpi", "Customer 360 receivables KPI is clipped", money);
      }
    }

    if (state.touchTargets.length) {
      finding("P1", viewport.name, route, "touch-target", "Visible mobile target below 44×44px", state.touchTargets);
    }

    if (state.clippedVisuals.length) {
      finding("P1", viewport.name, route, "chart", "Large chart/visual extends beyond viewport", state.clippedVisuals);
    }

    if (viewport.reducedMotion === "reduce" && state.runningAnimations > 0) {
      finding("P1", viewport.name, route, "reduced-motion", "Long-running animation remains active with reduced motion requested", {
        runningAnimations: state.runningAnimations,
      });
    }

    observations.push({ viewport: viewport.name, route, smoke, state, money: afterMoney });
    await capture(page, viewport.name, route, smoke ? "-smoke" : "");
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

async function exerciseCopilot(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: viewport.reducedMotion,
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  try {
    const response = await page.goto(`${baseUrl}/copilot`, { waitUntil: "networkidle", timeout: 30_000 });
    if (!response?.ok()) {
      finding("P0", `copilot-${viewport.name}`, "/copilot", "route", `HTTP ${response?.status() ?? "no response"}`);
      return;
    }

    const composer = page.getByLabel("Ask Founder Copilot");
    const prompts = [
      "hi",
      "what is open pipeline?",
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
      if (!focused) {
        finding("P1", `copilot-${viewport.name}`, "/copilot", "focus", `Composer focus not restored after: ${prompt}`);
      }
    }

    const thread = page.locator(".copilot-scroll-thread");
    await thread.evaluate((element) => { element.scrollTop = 0; });
    await page.waitForTimeout(100);
    const beforeTop = await thread.evaluate((element) => element.scrollTop);
    const previous = await page.locator(".assistant-message .assistant-answer").count();
    await composer.fill("what is open pipeline?");
    await composer.press("Enter");
    await waitForReply(page, previous);

    const focusedAfterSend = await composer.evaluate((element) => document.activeElement === element);
    if (!focusedAfterSend) {
      finding("P1", `copilot-${viewport.name}`, "/copilot", "focus", "Composer focus not restored after sending while manually scrolled up");
    }

    const afterTop = await thread.evaluate((element) => element.scrollTop);
    if (afterTop > beforeTop + 100) {
      finding("P1", `copilot-${viewport.name}`, "/copilot", "scroll", "New response overrode manual scroll position", { beforeTop, afterTop });
    }

    const jump = page.getByRole("button", { name: /Jump to latest/i });
    const jumpVisible = await jump.isVisible().catch(() => false);
    if (!jumpVisible) {
      finding("P1", `copilot-${viewport.name}`, "/copilot", "scroll", "Jump to latest did not appear after manual scroll-up");
    } else {
      await jump.click();
      await page.waitForTimeout(100);
      const distance = await thread.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
      if (distance > 4) {
        finding("P1", `copilot-${viewport.name}`, "/copilot", "scroll", "Jump to latest did not reach conversation bottom", { distance });
      }
    }

    if (viewport.width <= 390) {
      const overlap = await page.evaluate(() => {
        const composerElement = document.querySelector(".copilot-quality-composer");
        const threadElement = document.querySelector(".copilot-scroll-thread");
        if (!composerElement || !threadElement) return null;
        threadElement.scrollTop = threadElement.scrollHeight;
        const lastAnswer = threadElement.querySelector(".assistant-message:last-of-type") ?? threadElement.lastElementChild;
        if (!lastAnswer) return null;
        const composerRect = composerElement.getBoundingClientRect();
        const lastRect = lastAnswer.getBoundingClientRect();
        return {
          composerTop: Math.round(composerRect.top),
          lastBottom: Math.round(lastRect.bottom),
          obscured: lastRect.bottom > composerRect.top - 4,
        };
      });
      if (overlap?.obscured) {
        finding("P1", `copilot-${viewport.name}`, "/copilot", "composer", "Sticky composer obscures latest conversation content", overlap);
      }
    }

    const hydrationErrors = browserErrors.filter((message) => hydrationPattern.test(message));
    if (hydrationErrors.length) {
      finding("P0", `copilot-${viewport.name}`, "/copilot", "hydration", "Copilot emitted hydration errors", hydrationErrors);
    }
    const otherErrors = browserErrors.filter((message) => !hydrationPattern.test(message));
    if (otherErrors.length) {
      finding("P1", `copilot-${viewport.name}`, "/copilot", "console", "Copilot emitted browser errors", otherErrors);
    }

    await capture(page, `copilot-${viewport.name}`, "/copilot", "-interaction");
  } finally {
    await context.close();
  }
}

await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    for (const route of primaryRoutes) {
      await inspectPage(browser, viewport, route);
    }
  }

  const smokeViewport = viewports.find((viewport) => viewport.name === "laptop-1366") ?? viewports[0];
  for (const route of smokeRoutes) {
    await inspectPage(browser, smokeViewport, route, { smoke: true });
  }

  await exerciseCopilot(browser, viewports[0]);
  await exerciseCopilot(browser, viewports.find((viewport) => viewport.name === "mobile-390") ?? viewports.at(-1));
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  customerKey,
  primaryRoutes,
  smokeRoutes,
  viewports: viewports.map(({ name, width, height, reducedMotion }) => ({ name, width, height, reducedMotion })),
  findings,
  observations,
};
await fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2));

const p0 = findings.filter((item) => item.severity === "P0").length;
const p1 = findings.filter((item) => item.severity === "P1").length;
console.log(JSON.stringify({
  testedPrimaryRoutes: primaryRoutes.length,
  testedSmokeRoutes: smokeRoutes.length,
  testedViewports: viewports.length,
  findings: findings.length,
  p0,
  p1,
}, null, 2));

for (const item of findings) {
  console.log(`${item.severity} ${item.viewport} ${item.route} [${item.category}] ${item.message}${item.data ? ` :: ${JSON.stringify(item.data)}` : ""}`);
}

if (findings.length > 0) process.exitCode = 1;
