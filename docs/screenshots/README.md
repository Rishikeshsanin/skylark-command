# Production Screenshot Capture Plan

Add screenshots only after the final Vercel deployment passes live-data and desktop/mobile smoke. Capture real production output; do not use mock data or expose tokens, browser extensions, personal tabs, request headers, or environment settings.

| Filename | Route / state | Capture requirement |
| --- | --- | --- |
| `overview.png` | `/` | Header, source state, primary metrics, and Founder Attention Feed |
| `pipeline.png` | `/pipeline` | Open pipeline, known won value, and visible coverage caveat |
| `copilot.png` | `/copilot` | A structured deterministic answer with source provenance |
| `clarification.png` | `/copilot` | “Who are our best customers?” with all four definitions visible |
| `operations.png` | `/operations` | Work Order health, billing/collections, and receivables |
| `leadership.png` | `/leadership` | Leadership Brief and priority/risk context |
| `data-health.png` | `/data-health` | Missing/malformed/unmapped evidence and caveats |
| `mobile.png` | Any primary route | 390×844 layout with navigation and content legible |

Recommended desktop viewport: **1440×900**. Recommended mobile viewport: **390×844**. Crop consistently, keep text readable, and verify every visible number against the configured-live baseline before committing images.

After capture:

1. Add the PNG files to this directory.
2. Create a compact README gallery using relative paths such as `docs/screenshots/overview.png`.
3. Verify image links on GitHub and ensure the repository/ZIP size remains reasonable.
4. Re-run the tracked-secret scan and record the final SHA.
