# Skylark Command — Final Submission Runbook

Use this only **after Agent 5 explicitly approves application RC3 SHA `039cadfda8678ff82e105bf5fea2da72937c18c6`**. Stop if the approved SHA differs or if the submission branch contains non-documentation changes after that SHA.

## MASTER CHAT release checklist

1. [ ] Verify Agent 5 approved the exact RC3 SHA `039cadfda8678ff82e105bf5fea2da72937c18c6`.
2. [ ] Verify the diff from that SHA to `release/rc3-submission` is README/docs/safe release assets only.
3. [ ] Advance `main` to the approved RC3 plus the reviewed documentation commit; do not merge unrelated branches.
4. [ ] Import the public GitHub repository into Vercel with repository root `.` and Next.js auto-detection.
5. [ ] Configure `MONDAY_API_TOKEN`, `MONDAY_DEALS_BOARD_ID`, and `MONDAY_WORK_ORDERS_BOARD_ID`; optionally configure `GEMINI_API_KEY` (`AI_API_KEY` is fallback-compatible).
6. [ ] Deploy the final `main` SHA and record the immutable deployment URL/ID.
7. [ ] Confirm `GET /api/health` returns HTTP 200 and `status: "ok"` without exposing secrets.
8. [ ] Verify the configured-live monday baseline, including known-only monetary coverage and the exact cross-board unmatched key.
9. [ ] Verify a Gemini explanation when configured; confirm the structured deterministic values remain authoritative.
10. [ ] Verify deterministic Gemini fallback if practical (for example, a Preview without an AI key); do not disrupt Production secrets solely for this check.
11. [ ] Run desktop (1440×900) and mobile (390×844) smoke across Overview, Copilot, Pipeline, Operations, Leadership, and Data Health.
12. [ ] Capture the production screenshots listed in `docs/screenshots/README.md`.
13. [ ] Replace the README live-demo placeholder and add the reviewed production screenshot gallery.
14. [ ] Run the final tracked-tree/diff secret scan; ensure no token appears in docs, images, logs, ZIP, or `NEXT_PUBLIC_` variables.
15. [ ] Record the final submission SHA below and confirm Vercel serves that same source state.
16. [ ] Generate/verify the GitHub source ZIP from final `main`; confirm it opens and contains the expected README/docs.
17. [ ] Re-open every submission link, then submit.

## Final live acceptance check

| Metric | Expected value |
| --- | ---: |
| Deals | 346 total; 49 open; 165 won |
| Known open pipeline | 688152293.17 INR |
| Known won value | 95038938.98 INR |
| Won-value coverage | 64 known-value; 101 unknown-value won deals |
| Work Orders | 176 |
| Known receivables | 36291748.87 INR |
| Cross-board client keys | 51 total; 50 matched; 1 unmatched |
| Unmatched key | `COMPANY042` |

Known open/won values exclude missing monetary records. Known won value is not full historical revenue.

## Submission links template

```text
Hosted application:
[PRODUCTION URL]

Public source repository:
https://github.com/Rishikeshsanin/skylark-command

Source ZIP:
https://github.com/Rishikeshsanin/skylark-command/archive/refs/heads/main.zip

Decision Log:
docs/DECISION_LOG.md

QA-approved application RC3 SHA:
039cadfda8678ff82e105bf5fea2da72937c18c6

Final release SHA:
[FINAL SHA]
```

## Final record

- Production URL: `[PRODUCTION URL]`
- Final release SHA: `[FINAL SHA]`
- Deployment ID / immutable URL: `[DEPLOYMENT ID OR URL]`
- Final smoke time (IST): `[YYYY-MM-DD HH:MM IST]`
- Agent 5 approval reference: `[LINK OR RECORDED MESSAGE]`

**Status:** not ready until every required item is complete against the final hosted source state.
