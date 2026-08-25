import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3000";
const failures = [];
const requests = [];
let retryAttempt = 0;

function fail(message) {
  failures.push(message);
}

function envelope(data, answer = "Deterministic analytics completed.", caveats = []) {
  return {
    ok: true,
    answer,
    data,
    caveats,
    source: {
      provider: "monday.com",
      boardIds: ["5030844099", "5030844103"],
      fetchedAt: "2026-08-25T06:30:00.000Z",
    },
  };
}

function responseFor(message) {
  const lower = message.toLowerCase();
  if (lower.includes("highest won value")) {
    return envelope({ rankingType: "won_value", currencyCode: "INR", entries: [{ rank: 1, normalizedClientKey: "COMPANY007", wonValue: 9100000 }] }, "Highest won value ranking.");
  }
  switch (message) {
    case "qa:pipeline":
      return envelope({ currencyCode: "INR", recordsAnalyzed: 346, totalDeals: 346, openDeals: 49, wonDeals: 165, openPipelineValue: 688152293.17, wonValue: 95038938.98 }, "Pipeline overview.");
    case "qa:sector":
      return envelope([{ sector: "Mining", openDealCount: 3, openPipelineValue: 1250000 }], "Sector analysis.");
    case "qa:stage":
      return envelope([{ stage: "Proposal", dealCount: 2, totalValue: 500000 }], "Stage analysis.");
    case "qa:quarter":
      return envelope([{ quarter: "Q3 2026", dealCount: 5, totalValue: 2100000 }], "Quarter analysis.");
    case "qa:period":
      return envelope({ requestedPeriod: "Q3 2026", hasData: false, result: null, latestAvailablePeriod: "Q2 2026", latestAvailableResult: { quarter: "Q2 2026", sectors: [{ sector: "Mining", openPipelineValue: 750000 }] } }, "No usable Q3 data; showing latest available evidence.", ["Requested period has no usable deterministic data; zero performance is not reported."]);
    case "qa:risk":
      return envelope([{ name: "Risky Alpha", value: 900000, status: "Open", reasons: ["Close timing is stale"] }], "Deals needing attention.");
    case "qa:workorders":
      return envelope({ totalWorkOrders: 176, delayedWorkOrders: 4, receivables: 36291748.87, activeWorkOrders: 61, completedWorkOrders: 115 }, "Work Order health.");
    case "qa:ranking":
      return envelope({ rankingType: "combined_importance", currencyCode: "INR", entries: [{ rank: 1, normalizedClientKey: "COMPANY001", combinedImportanceScore: 9.4, openPipelineValue: 1000000, receivables: 200000 }] }, "Customer ranking.");
    case "qa:crossboard":
      return envelope([{ normalizedClientKey: "COMPANY009", openDealValue: 800000, activeWorkOrderCount: 2, receivables: 120000 }], "Cross-board clients.");
    case "qa:attention":
      return envelope({ currencyCode: "INR", items: [{ severity: "HIGH", title: "WO-88 needs attention", entity: "WO-88", reason: "Past probable end date", relevantSource: "work_orders" }] }, "Founder Attention Feed.");
    case "qa:brief":
      return envelope({ pipeline: { totalDeals: 346, openDeals: 49, openPipelineValue: 688152293.17 }, workOrders: { totalWorkOrders: 176, receivables: 36291748.87 }, topOpenDeals: [{ name: "Big Deal RC2", value: 5000000, status: "Open" }], riskyDeals: [{ name: "Stale Deal RC2", value: 1000000, reasons: ["tentative close date is in the past"] }], clientsWithCommercialAndOperationalExposure: [{ normalizedClientKey: "COMPANY010", openDealValue: 1000000, receivables: 50000 }], sectorMetrics: [{ sector: "Mining", openPipelineValue: 3000000 }], dataQuality: { totalDeals: 346, totalWorkOrders: 176, issues: [] } }, "Leadership brief.");
    case "qa:datahealth":
      return envelope({ totalDeals: 346, totalWorkOrders: 176, unmappedWorkOrderClients: 1, malformedDeals: 0, malformedWorkOrders: 0, issues: [{ severity: "warning", message: "COMPANY042 is not mapped across boards" }] }, "Data Health.");
    case "qa:clarify":
      return {
        ok: true,
        answer: "What should ‘best customers’ mean for this analysis?",
        caveats: ["Clarification is required before ranking."],
        clarification: {
          required: true,
          question: "What should ‘best customers’ mean for this analysis?",
          reason: "The ranking definition must be explicit.",
          options: ["Highest won value", "Largest active pipeline", "Best project execution", "Combined commercial + operational importance"],
        },
        source: { provider: "monday.com", boardIds: [], fetchedAt: "2026-08-25T06:30:00.000Z" },
      };
    case "qa:loading":
      return envelope({ totalDeals: 346, openDeals: 49 }, "Loading-path result.");
    case "qa:retry":
      return envelope({ totalDeals: 346, openDeals: 49 }, "Recovered deterministic result.");
    default:
      return envelope({ marker: "fallback" }, `Mocked deterministic response for ${message}`);
  }
}

async function waitForNewAnswer(page, before) {
  await page.waitForFunction((count) => document.querySelectorAll(".assistant-answer").length > count, before, { timeout: 5000 });
  return page.locator(".assistant-answer").last();
}

async function assertVisibleText(locator, text, label) {
  const found = locator.getByText(text, { exact: false });
  if (await found.count() < 1) fail(`${label}: expected visible text ${JSON.stringify(text)}`);
  else if (!(await found.first().isVisible())) fail(`${label}: text ${JSON.stringify(text)} exists but is not visible`);
}

async function ask(page, prompt, expectedTexts) {
  const input = page.getByLabel("Ask Founder Copilot");
  const before = await page.locator(".assistant-answer").count();
  await input.fill(prompt);
  await input.press("Enter");
  const answer = await waitForNewAnswer(page, before);
  for (const text of expectedTexts) await assertVisibleText(answer, text, prompt);
  const rendered = await answer.innerText();
  if (rendered.includes('{"') || rendered.includes('"openPipelineValue"') || (await answer.locator("pre").count()) > 0) {
    fail(`${prompt}: response appears to expose a raw JSON dump`);
  }
  await page.waitForFunction(() => document.activeElement?.id === "founder-question", undefined, { timeout: 3000 }).catch(() => fail(`${prompt}: composer focus was not restored after response`));
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", (error) => fail(`${viewport.name}: page error: ${error.message}`));
    page.on("console", (msg) => { if (msg.type() === "error") fail(`${viewport.name}: console error: ${msg.text()}`); });

    await page.route("**/api/chat", async (route) => {
      const req = route.request();
      let payload = {};
      try { payload = JSON.parse(req.postData() ?? "{}"); } catch { fail(`${viewport.name}: Copilot sent malformed JSON`); }
      const keys = Object.keys(payload).sort();
      if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") fail(`${viewport.name}: non-canonical chat request ${req.method()} ${req.url()}`);
      if (keys.join(",") !== "message" || typeof payload.message !== "string") fail(`${viewport.name}: unexpected chat request schema ${JSON.stringify(payload)}`);
      requests.push(payload.message);

      if (payload.message === "qa:retry" && retryAttempt++ === 0) {
        await route.fulfill({ status: 502, contentType: "text/plain", body: "upstream failed" });
        return;
      }
      if (payload.message === "qa:loading") await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responseFor(payload.message)) });
    });

    const response = await page.goto(`${BASE}/copilot`, { waitUntil: "networkidle" });
    if (!response?.ok()) fail(`${viewport.name}: /copilot HTTP ${response?.status() ?? "none"}`);
    const input = page.getByLabel("Ask Founder Copilot");
    if (await input.getAttribute("maxlength") !== "2000") fail(`${viewport.name}: textarea maxlength is not 2000`);
    if (await page.locator('[aria-live="polite"][aria-atomic="true"]').count() < 1) fail(`${viewport.name}: atomic polite live region missing`);

    const beforeShift = requests.length;
    await input.fill("first line");
    await input.press("Shift+Enter");
    await input.type("second line");
    const shiftValue = await input.inputValue();
    if (!shiftValue.includes("\n") || requests.length !== beforeShift) fail(`${viewport.name}: Shift+Enter did not preserve multiline input without submitting`);
    await input.fill("");

    await ask(page, "qa:pipeline", ["Pipeline overview", "346", "49"]);
    await ask(page, "qa:sector", ["Mining", "Sector analysis"]);
    await ask(page, "qa:stage", ["Proposal", "Stage analysis"]);
    await ask(page, "qa:quarter", ["Q3 2026", "Quarter analysis"]);
    await ask(page, "qa:period", ["Q2 2026", "Mining", "zero performance is not reported"]);
    await ask(page, "qa:risk", ["Risky Alpha", "Close timing is stale"]);
    await ask(page, "qa:workorders", ["176", "Work Order health"]);
    await ask(page, "qa:ranking", ["COMPANY001", "Rank: 1"]);
    await ask(page, "qa:crossboard", ["COMPANY009", "Cross-board clients"]);
    await ask(page, "qa:attention", ["WO-88", "HIGH"]);
    await ask(page, "qa:brief", ["Big Deal RC2", "Leadership brief"]);
    await ask(page, "qa:datahealth", ["COMPANY042", "Data Health"]);

    const beforeLoading = await page.locator(".assistant-answer").count();
    await input.fill("qa:loading");
    await input.press("Enter");
    const thinking = page.getByText("Analyzing live data…", { exact: true });
    await thinking.waitFor({ state: "visible", timeout: 2000 }).catch(() => fail(`${viewport.name}: loading state not visible`));
    await waitForNewAnswer(page, beforeLoading);

    const beforeClarify = await page.locator(".assistant-answer").count();
    await input.fill("qa:clarify");
    await input.press("Enter");
    const clarifyAnswer = await waitForNewAnswer(page, beforeClarify);
    const highestWon = clarifyAnswer.getByRole("button", { name: "Highest won value" });
    if (await highestWon.count() !== 1) fail(`${viewport.name}: clarification choice missing`);
    else {
      const beforeChoice = await page.locator(".assistant-answer").count();
      await highestWon.click();
      const rankingAnswer = await waitForNewAnswer(page, beforeChoice);
      await assertVisibleText(rankingAnswer, "COMPANY007", `${viewport.name}: clarification ranking`);
    }

    await input.fill("qa:retry");
    await input.press("Enter");
    const alert = page.getByRole("alert");
    await alert.waitFor({ state: "visible", timeout: 3000 }).catch(() => fail(`${viewport.name}: controlled error state not shown`));
    const retry = alert.getByRole("button", { name: "Retry" });
    if (await retry.count() !== 1) fail(`${viewport.name}: retry action missing`);
    else {
      const beforeRetry = await page.locator(".assistant-answer").count();
      await retry.click();
      const recovered = await waitForNewAnswer(page, beforeRetry);
      await assertVisibleText(recovered, "Recovered deterministic result", `${viewport.name}: retry`);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1);
    if (overflow) fail(`${viewport.name}: Copilot has page-level horizontal overflow after long conversation`);

    const sidebarVisible = await page.locator(".sidebar").isVisible();
    const mobileNavVisible = await page.locator(".mobile-nav").isVisible();
    if (viewport.name === "desktop" && !sidebarVisible) fail("desktop: sidebar navigation is not visible");
    if (viewport.name === "mobile" && !mobileNavVisible) fail("mobile: mobile navigation is not visible");

    await context.close();
  }

  for (const route of ["/", "/pipeline", "/operations", "/leadership", "/data-health"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const response = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    if (!response?.ok()) fail(`${route}: HTTP ${response?.status() ?? "none"}`);
    const alerts = page.getByRole("alert");
    if (await alerts.count() > 0) {
      const retry = alerts.first().getByRole("button", { name: /retry/i });
      if (await retry.count() < 1) fail(`${route}: controlled no-secret error state has no retry control`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (!requests.length) fail("No canonical Copilot requests were observed");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Agent 5 RC2 browser red-team passed with ${requests.length} canonical /api/chat requests across desktop and mobile.`);
