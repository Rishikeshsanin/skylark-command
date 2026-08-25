import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:3000";
const options = [
  "Highest won value",
  "Largest active pipeline",
  "Best project execution",
  "Combined commercial + operational importance",
];
const source = {
  provider: "monday.com",
  boardIds: ["5030844099", "5030844103"],
  fetchedAt: "2026-08-25T00:00:00.000Z",
};

function ok(data, caveats = []) {
  return {
    ok: true,
    answer: "Deterministic analytics completed.",
    data,
    caveats,
    source,
  };
}

function clarification() {
  return {
    ok: true,
    answer: "What should ‘best customers’ mean for this analysis?",
    caveats: ["No business analytics were executed because clarification is required."],
    clarification: {
      required: true,
      question: "What should ‘best customers’ mean for this analysis?",
      reason: "Choose the deterministic ranking definition.",
      options,
    },
    source,
  };
}

function ranking(option) {
  const rankingType = {
    "Highest won value": "won_value",
    "Largest active pipeline": "open_pipeline",
    "Best project execution": "work_order_execution_health",
    "Combined commercial + operational importance": "combined_importance",
  }[option];
  return ok({
    rankingType,
    currencyCode: "INR",
    entries: [
      {
        rank: 1,
        normalizedClientKey: "COMPANY001",
        deterministicBasis: `Deterministic basis for ${option}.`,
        monetaryValues: {
          wonValue: 100,
          openPipelineValue: 200,
          workOrderValueInclGst: 300,
          receivables: 40,
          combinedExposure: 640,
          knownDealValueRecords: 3,
          unknownDealValueRecords: 2,
        },
        operationalValues: {
          workOrderCount: 4,
          activeWorkOrders: 4,
          delayedWorkOrders: 1,
          pausedWorkOrders: 2,
          arPriorityWorkOrders: 1,
          executionRiskScore: 15,
        },
        caveats: ["Two contributing deal records have missing monetary values."],
      },
    ],
    caveats: ["Ranking uses supplied deterministic values only."],
  });
}

function answerFor(message) {
  if (message === "Who are our best customers?") return clarification();
  if (options.includes(message)) return ranking(message);
  if (message === "Which sector has the largest open opportunity?") {
    return ok([
      { sector: "Energy", openPipelineValue: 900, openDealCount: 1, workOrderValueInclGst: 500 },
      { sector: "Logistics", openPipelineValue: 100, openDealCount: 1, workOrderValueInclGst: 10000 },
    ]);
  }
  if (message === "What is our won value?") {
    return ok({
      currencyCode: "INR",
      openPipelineValue: 688152293.17,
      wonValue: 95038938.98,
      openDeals: 49,
      wonDeals: 165,
      knownOpenValueDeals: 40,
      unknownOpenValueDeals: 9,
      knownWonValueDeals: 64,
      unknownWonValueDeals: 101,
      averageOpenDealSize: 100,
    });
  }
  if (message === "What are our receivables?") {
    return ok({
      currencyCode: "INR",
      receivables: 36291748.87,
      unknownReceivableCount: 5,
      billedValueInclGst: 1000,
      collectedAmountInclGst: 700,
      amountToBeBilledInclGst: 300,
    });
  }
  if (message === "Which customers appear in both boards?") {
    return ok({
      totalUniqueWorkOrderClientKeys: 51,
      matchedUniqueWorkOrderClientKeys: 50,
      unmatchedUniqueWorkOrderClientKeys: 1,
      unmatchedWorkOrderClientKeys: ["COMPANY042"],
      matchedClients: [{ normalizedClientKey: "COMPANY001", dealCount: 2, workOrderCount: 3 }],
    });
  }
  if (message === "What data should I not trust?") {
    return ok({
      totalDeals: 346,
      totalWorkOrders: 176,
      malformedDeals: 1,
      malformedWorkOrders: 0,
      unmappedWorkOrderClients: 1,
      unmappedWorkOrderClientKeys: ["COMPANY042"],
      issueCounts: { info: 1, warning: 1, error: 0 },
      issues: [{ severity: "warning", message: "No Deals client matched Work Order client key COMPANY042." }],
    });
  }
  if (message === "Mining sector this quarter") {
    return ok({
      requestedPeriod: "Q3 2026",
      hasData: true,
      result: {
        period: "Q3 2026",
        sectors: [{ sector: "Mining", openPipelineValue: 700, knownValueDealCount: 1, unknownValueDealCount: 0 }],
      },
      latestAvailablePeriod: "Q3 2026",
      latestAvailableResult: null,
      caveats: [],
    });
  }
  if (message === "Which projects need leadership attention?") {
    return ok({
      currencyCode: "INR",
      items: [
        {
          severity: "HIGH",
          title: "Delayed Work Order needs leadership attention",
          client: "COMPANY002",
          entity: "WO-002",
          reason: "The active Work Order is past its probable end date.",
        },
      ],
      caveats: [],
    });
  }
  throw new Error(`Unexpected evaluator prompt: ${message}`);
}

async function installMock(page, seenMessages) {
  await page.route("**/api/chat", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const payload = request.postDataJSON();
    const message = payload?.message;
    if (typeof message !== "string") throw new Error("Mocked chat request did not contain a string message");
    seenMessages.push(message);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(answerFor(message)),
    });
  });
}

async function ask(page, question) {
  const composer = page.getByLabel("Ask Founder Copilot");
  await composer.fill(question);
  await composer.press("Enter");
}

async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible" });
}

const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const option of options) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const seenMessages = [];
    try {
      await installMock(page, seenMessages);
      await page.goto(`${baseUrl}/copilot`, { waitUntil: "networkidle" });
      await ask(page, "Who are our best customers?");
      await expectText(page, "What should ‘best customers’ mean for this analysis?");
      await page.getByRole("button", { name: option, exact: true }).click();
      await expectText(page, "Rank 1");
      await expectText(page, "COMPANY001");
      await expectText(page, "Known won value");
      await expectText(page, "Known open pipeline value");
      await expectText(page, "Execution risk score");
      if (seenMessages[1] !== option) {
        throw new Error(`clarification button sent ${JSON.stringify(seenMessages[1])} instead of canonical option ${JSON.stringify(option)}`);
      }
    } catch (error) {
      failures.push(`clarification ${option}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await context.close();
    }
  }

  const checks = [
    ["Which sector has the largest open opportunity?", ["Energy", "Open Pipeline Value", "900"]],
    ["What is our won value?", ["Known won value", "9,50,38,938.98", "64 known", "101 unknown"]],
    ["What are our receivables?", ["Known receivables", "3,62,91,748.87", "Unknown receivable records"]],
    ["Which customers appear in both boards?", ["Unique Work Order client keys: 51", "Matched unique Work Order client keys: 50", "COMPANY042"]],
    ["What data should I not trust?", ["COMPANY042", "No Deals client matched"]],
    ["Mining sector this quarter", ["Mining", "Q3 2026"]],
    ["Which projects need leadership attention?", ["WO-002", "HIGH", "past its probable end date"]],
  ];

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    for (const [question, expected] of checks) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      try {
        await installMock(page, []);
        await page.goto(`${baseUrl}/copilot`, { waitUntil: "networkidle" });
        await ask(page, question);
        for (const text of expected) await expectText(page, text);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) throw new Error("horizontal overflow detected after evaluator response");
      } catch (error) {
        failures.push(`${viewport.name} ${question}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("RC3 evaluator browser smoke passed: all four clarification options and seven evaluator prompts render correctly across desktop/mobile, with canonical option payloads.");
