import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CoverageBar } from "./coverage-bar";
import { DistributionBars } from "./distribution-bars";
import { FinancialFlow } from "./financial-flow";
import { MetricCard } from "./metric-card";
import { VisualFlow } from "./visual-flow";

describe("executive visualization primitives", () => {
  it("keeps known and unknown coverage visible without inventing a quality percentage", () => {
    const html = renderToStaticMarkup(createElement(CoverageBar, {
      label: "Won-deal value coverage",
      known: 64,
      unknown: 101,
      description: "Known totals exclude missing values.",
    }));

    expect(html).toContain("Won-deal value coverage: 64 known, 101 unknown.");
    expect(html).toContain("Known totals exclude missing values.");
    expect(html).toContain(">64<");
    expect(html).toContain(">101<");
    expect(html).not.toContain("%");
  });

  it("renders exact backend-supplied Work Order amounts in the financial flow", () => {
    const html = renderToStaticMarkup(createElement(FinancialFlow, {
      totalAmount: 250_000_000,
      billed: 127_000_000,
      collected: 90_708_251.13,
      toBeBilled: 123_000_000,
      receivables: 36_291_748.87,
      currency: "INR",
    }));

    expect(html).toContain("Work Order financial flow from total value through billing and collection");
    expect(html).toContain("₹25,00,00,000");
    expect(html).toContain("₹3,62,91,748.87");
    expect(html).toContain("the visual does not derive financial totals");
  });

  it("provides text equivalents for custom distribution bars", () => {
    const html = renderToStaticMarkup(createElement(DistributionBars, {
      ariaLabel: "Known pipeline by sector",
      items: [
        { label: "Tender", value: 532_000_000, secondary: "₹53.2Cr", detail: "₹53,20,00,000 across 4 open opportunities" },
        { label: "Mining", value: 29_000_000, secondary: "₹2.9Cr", detail: "₹2,90,00,000 across 9 open opportunities" },
      ],
    }));

    expect(html).toContain('role="list"');
    expect(html).toContain('aria-label="Known pipeline by sector"');
    expect(html).toContain("₹53,20,00,000 across 4 open opportunities");
    expect(html).toContain('aria-hidden="true"');
  });

  it("keeps compact and exact values together in executive metric cards", () => {
    const html = renderToStaticMarkup(createElement(MetricCard, {
      label: "Known won value",
      value: "₹9.5Cr",
      exactValue: "₹9,50,38,938.98",
      hint: "64 of 165 won deals have known values.",
      tone: "positive",
    }));

    expect(html).toContain("Known won value");
    expect(html).toContain("Exact ₹9,50,38,938.98");
    expect(html).toContain("64 of 165 won deals have known values.");
  });

  it("renders a labeled narrative flow without adding a chart dependency", () => {
    const html = renderToStaticMarkup(createElement(VisualFlow, {
      ariaLabel: "Commercial to delivery to cash to attention",
      nodes: [
        { eyebrow: "Commercial", value: "₹68.8Cr", detail: "47 known open values", tone: "info" },
        { eyebrow: "Delivery", value: "55 active WOs", detail: "48 delayed", tone: "warning" },
        { eyebrow: "Cash", value: "₹3.6Cr", detail: "Known receivables", tone: "warning" },
        { eyebrow: "Attention", value: "5 deal risks", detail: "Deterministic evidence", tone: "critical" },
      ],
    }));

    expect(html).toContain('aria-label="Commercial to delivery to cash to attention"');
    expect(html).toContain("Commercial");
    expect(html).toContain("Deterministic evidence");
  });
});
