# Skylark Command Submission Checklist

Use this checklist only against the **final approved integrated release candidate**.

## Submission assets

- [ ] **Hosted web URL** — final production URL recorded and opens successfully: `____________________________`
- [x] **Public GitHub URL** — `https://github.com/Rishikeshsanin/skylark-command`
- [ ] **Source ZIP** — generated from the approved final `main` state / final SHA
- [x] **Decision Log** — `docs/DECISION_LOG.md`
- [ ] **Final release SHA** — `____________________________`

## Security / repository hygiene

- [ ] Final-tree / final-diff secret scan passes
- [ ] No real monday token or Gemini key appears in code, docs, screenshots, logs, Actions output, or ZIP
- [ ] No server secret uses a `NEXT_PUBLIC_` prefix
- [ ] monday access remains query-only/read-only and mutation attempts remain blocked
- [ ] Canonical chat backend remains only `POST /api/chat`
- [ ] Controlled errors do not expose stack traces, filesystem paths, or secret values

## Build and CI

- [ ] `npm ci` succeeds on the exact final candidate without changing `package-lock.json`
- [ ] `npm test` succeeds
- [ ] `npm run lint` succeeds
- [ ] `npm run build` succeeds
- [ ] RC3 / Release Gate GitHub Actions checks are green for the exact final SHA

## Vercel configuration

Required server environment variables:

- [ ] `MONDAY_API_TOKEN`
- [ ] `MONDAY_DEALS_BOARD_ID=5030844099`
- [ ] `MONDAY_WORK_ORDERS_BOARD_ID=5030844103`
- [ ] `GEMINI_API_KEY` configured for optional explanation (`AI_API_KEY` is fallback compatibility only)

Never paste secret values into repository files or screenshots.

## Hosted routes

- [ ] `GET /`
- [ ] `GET /copilot`
- [ ] `GET /pipeline`
- [ ] `GET /operations`
- [ ] `GET /leadership`
- [ ] `GET /data-health`
- [ ] `GET /api/health` → HTTP 200 / status ok
- [ ] malformed `POST /api/chat` → controlled 400

## Live monday golden baseline

Verify dynamically loaded data against the assignment baseline. Do not change the expected values to make a failing build pass.

- [ ] Deals = **346**
- [ ] Work Orders = **176**
- [ ] Open deals = **49**
- [ ] Won deals = **165**
- [ ] Known open pipeline = **INR 688,152,293.17**
- [ ] Known recorded won value = **INR 95,038,938.98**
- [ ] Known won-value records = **64**
- [ ] Unknown won-value records = **101**
- [ ] Known receivables = **INR 36,291,748.87**
- [ ] Unique Work Order client keys = **51**
- [ ] Matched unique Work Order client keys = **50**
- [ ] Sole unmatched key = **COMPANY042**

## Evaluator journeys

- [ ] `Who are our best customers?` clarifies exactly once
- [ ] Click **Highest won value** → ranking completes
- [ ] Click **Largest active pipeline** → ranking completes
- [ ] Click **Best project execution** → ranking completes
- [ ] Click **Combined commercial + operational importance** → ranking completes
- [ ] `Which sector has the largest open opportunity?` ranks by open pipeline value, not combined exposure
- [ ] `What is our won value?` visibly shows known won value and known/unknown coverage; does not claim complete historical revenue
- [ ] `What are our receivables?` visibly shows receivables and missing-value coverage
- [ ] `Which customers appear in both boards?` uses unique-client matching and exposes 50/51 plus COMPANY042
- [ ] `What data should I not trust?` routes to deterministic Data Health
- [ ] `Mining sector this quarter` respects sector + period and never turns missing/stale data into fake zero performance
- [ ] `Which projects need leadership attention?` returns evidence-backed Founder Attention items
- [ ] Gemini absent/failure still returns deterministic analytics and usable fallback explanation

## Threat / abuse sanity checks

- [ ] Prompt asks for environment secrets → no secret exposure
- [ ] Prompt requests monday mutation → no mutation/network write
- [ ] Malicious monday cell text remains untrusted data
- [ ] Oversized body/message gets controlled rejection
- [ ] Rate-limit path returns controlled `429` with `Retry-After`

## Browser / UX

- [ ] Desktop `1440×900` — no blocking overflow/errors
- [ ] Mobile `390×844` — no blocking overflow/errors
- [ ] keyboard navigation/focus works
- [ ] loading / controlled error / Retry / Dismiss work
- [ ] ARIA live region works
- [ ] clarification buttons work end-to-end
- [ ] Leadership Brief copy/download works

## Release evidence

- [ ] Screenshot: Executive Overview
- [ ] Screenshot: Founder Attention
- [ ] Screenshot: Founder Copilot strongest answer
- [ ] Screenshot: clarification → completed customer ranking
- [ ] Screenshot: Leadership Brief
- [ ] Screenshot: Data Health
- [ ] Record exact final SHA
- [ ] Record production URL
- [ ] Record final smoke-test time

## Final release

- [ ] Agent 4 RC3 integration accepted
- [ ] Agent 5 targeted red-team says **APPROVE FOR VERCEL PREVIEW** or stronger
- [ ] Final approved candidate moved/merged to default `main`
- [ ] Vercel deployment uses that exact approved release state
- [ ] Live monday + Gemini smoke passes after environment configuration
- [ ] README updated with live URL / final release evidence
- [ ] Source ZIP and all submitted links point to the same final release

**Release status:** NOT READY until every required item above is completed against the final integrated candidate.