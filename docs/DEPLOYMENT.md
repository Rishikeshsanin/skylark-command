# Deployment Readiness

This document describes release configuration for Skylark Command application RC3 (`039cadfda8678ff82e105bf5fea2da72937c18c6`). It is **not** authorization to deploy: final independent Agent 5 approval is still required, and this documentation branch does not merge `main` or deploy.

## Platform baseline

- Next.js 16 App Router
- TypeScript
- `/api/chat` runtime: Node.js
- Minimum Node.js: 20.9+
- Package manager: npm
- Vercel framework preset: Next.js / auto-detect
- Repository root: `.`
- Install: `npm ci`
- Build: `npm run build`
- Do not configure a static export

## Required server environment variables

Configure these for any final Preview/Production environment:

| Variable | Required | Purpose | Secret? |
| --- | --- | --- | --- |
| `MONDAY_API_TOKEN` | Yes | Authenticates monday.com GraphQL reads | Yes |
| `MONDAY_DEALS_BOARD_ID` | Yes | Deals board ID (`5030844099`) | Non-secret server configuration |
| `MONDAY_WORK_ORDERS_BOARD_ID` | Yes | Work Orders board ID (`5030844103`) | Non-secret server configuration |

The data client requires non-empty values and numeric board IDs. Never expose the token through `NEXT_PUBLIC_` variables or commit a real value.

## Gemini executive explanation provider

RC3 uses Google Gemini for optional qualitative executive explanation:

```text
gemini-2.5-flash-lite
```

Key precedence is:

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | No | Preferred Gemini server API key |
| `AI_API_KEY` | No | Backward-compatible fallback when `GEMINI_API_KEY` is unset |

If both are configured, `GEMINI_API_KEY` wins. Both are server-only secrets and must never use a `NEXT_PUBLIC_` prefix.

Gemini is not the source of business arithmetic. The planner/dispatcher runs deterministic analytics first. If Gemini is unavailable, times out, is rate-limited, or returns invalid output, the request retains authoritative deterministic `response.data` and uses the deterministic explanation fallback.

## Canonical API routes

### `GET /api/health`

Returns service/configuration metadata. It checks configuration presence; it does not perform a live monday.com dependency probe.

### `POST /api/chat`

This is the **only** Founder Copilot backend. Do not add `/api/copilot`.

Request shape:

```json
{"message":"How is our pipeline looking?"}
```

The route applies:

- strict JSON/schema validation;
- message/request size limits;
- request IDs;
- rate limiting;
- safe public errors;
- canonical planner/dispatcher;
- deterministic analytics before optional Gemini explanation.

## monday.com behavior

The server-side monday client:

- imports `server-only`;
- sends GraphQL queries only and rejects mutation text;
- uses `cache: "no-store"`;
- paginates board items;
- uses bounded request timeout/retry behavior;
- fetches Deals and Work Orders server-side;
- does not embed assignment/business datasets in application code.

## Required release gate

From the exact candidate SHA:

```bash
npm ci
npm test
npm run lint
npm run build
```

All must succeed. `npm test` must include the Agent 5 evaluator and release-security regression suites; do not skip them.

The final candidate must also pass:

- tracked-repository secret scan;
- desktop smoke at 1440×900;
- mobile smoke at 390×844;
- route checks for `/`, `/copilot`, `/pipeline`, `/operations`, `/leadership`, `/data-health`, `/api/health`;
- `/api/chat` validation;
- red-team retest.

## Secret audit

Search the tracked release tree for real values associated with:

- `MONDAY_API_TOKEN`
- `GEMINI_API_KEY`
- `AI_API_KEY`
- Bearer credentials
- passwords / hardcoded secrets
- `NEXT_PUBLIC_` references to server secrets

Environment names and empty/example placeholders are acceptable. Real credentials are not.

## Preview procedure for MASTER CHAT

Only after independent approval of the exact application RC3 SHA:

1. Record the exact approved SHA.
2. Confirm `package-lock.json` is present and matches `package.json`.
3. Run install/test/lint/build on that SHA.
4. Configure the three required monday variables in Preview.
5. Configure `GEMINI_API_KEY` only if Gemini explanation is desired; `AI_API_KEY` remains fallback-compatible.
6. Create a Preview deployment.
7. Run:

```bash
BASE_URL="https://<preview-host>" npm run smoke
```

8. Optionally validate safe chat behavior with:

```bash
BASE_URL="https://<preview-host>" SMOKE_CHAT=1 npm run smoke
```

9. Verify desktop/mobile views, structured Copilot output, Leadership Brief, Founder Attention, Data Health, and source provenance.
10. Inspect runtime logs for timeouts, safe fallback behavior, and accidental secret exposure.
11. Complete `docs/SUBMISSION_CHECKLIST.md`.
12. Only then decide whether to promote/deploy production.

## Function-duration risk

monday.com pagination and retry behavior can increase server execution time under upstream latency or rate limiting. Before production approval, measure realistic Preview function durations with live monday configuration and confirm the selected hosting plan comfortably covers observed behavior. Do not hide upstream timeout problems in release tooling.

## Rollback readiness

Before production promotion, record:

- approved git SHA;
- validated Preview URL;
- production deployment ID/URL once created;
- previous known-good production deployment if one exists.

If production smoke fails, roll back or halt release. Fix application behavior in the owning engineering branch rather than bypassing analytics/security gates.
