# V2 Screenshot Gallery & Capture Guide

This directory is reserved for **real Skylark Command V2 captures**.

The repository also contains an existing root-level `Screenshots/` folder. Those images are preserved because they are real captures of an earlier public production state, but they must not be presented as evidence for V2-only capabilities such as Change Detective, Customer 360, temporal history, or Scenario Lab unless the visible screen actually contains those features.

## Current status

**V2 gallery: pending real capture.**

No fabricated, generated, or mock screenshot should be committed here and labeled as product output. Capture only from a verified V2 local/preview/deployment state using real application rendering.

## Recommended V2 captures

| Filename | Route / state | What the image should prove |
| --- | --- | --- |
| `overview-v2.png` | `/` | Executive overview, source/freshness context, attention signals, responsive visual hierarchy |
| `changes-v2.png` | `/changes` | Change Detective using actual available historical snapshots or an honest sparse-history state |
| `copilot-change-v2.png` | `/copilot` | `What changed since last week?` result when genuine comparison history exists |
| `evidence-v2.png` | Copilot/evidence state | Source snapshot, semantic metric, evidence/coverage, caveat, or trust details |
| `customer-360-v2.png` | `/customers/[clientKey]` | Cross-board Customer 360 for a real configured customer key |
| `scenario-v2.png` | `/copilot` | Scenario Lab with BASELINE / SCENARIO / DELTA and no source-write claim |
| `data-health-v2.png` | `/data-health` | Missing/malformed/unmapped/coverage evidence |
| `mobile-v2.png` | Any primary V2 route | 390×844 responsive state with readable navigation/content |

If the environment lacks enough temporal history, capture the honest sparse/no-history Change Detective state rather than constructing a fake successful comparison.

## Capture provenance

For every committed V2 screenshot, record the following in the pull request or commit notes:

- git SHA rendered;
- preview/deployment URL or local source state;
- capture date/time;
- viewport;
- route/prompt/state;
- whether temporal history was configured;
- confirmation that no secret or personal browser information is visible.

A small Markdown caption in the README can then state what the screenshot proves without implying that every environment has the same data.

## Capture hygiene

Recommended desktop viewport: **1440×900**.  
Recommended mobile viewport: **390×844**.

Before capture:

1. Verify the deployment/source SHA.
2. Verify the intended live or temporal data-serving mode.
3. For Change Intelligence, verify that the comparison uses real successful snapshots.
4. Remove personal tabs, extension overlays, account menus, DevTools, request headers, and environment settings from view.
5. Check that no token, database URL, cron secret, provider key, or private identifier is visible.
6. Prefer a complete state over a loading skeleton unless the loading state itself is the subject of the screenshot.
7. Keep text legible after GitHub README scaling.

## README gallery structure

Once real V2 images exist, add a compact gallery near the product/features section rather than forcing the reader through a long sequence of full-width images.

Example structure:

```html
<table>
  <tr>
    <td><img src="docs/screenshots/overview-v2.png" alt="Skylark Command V2 executive overview" /></td>
    <td><img src="docs/screenshots/changes-v2.png" alt="Skylark Command V2 Change Detective" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/customer-360-v2.png" alt="Skylark Command V2 Customer 360" /></td>
    <td><img src="docs/screenshots/scenario-v2.png" alt="Skylark Command V2 Scenario Lab" /></td>
  </tr>
</table>
```

Only add paths after the corresponding files exist.

## Rule

**Screenshot evidence follows the same trust model as analytical evidence: show what actually exists, state the source state, and do not fill missing evidence with a convincing substitute.**
