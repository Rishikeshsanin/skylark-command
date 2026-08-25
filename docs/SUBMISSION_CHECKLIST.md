# Skylark Command Submission Checklist

Use this checklist only against the **final approved integrated release candidate**. Agent 6 prepares the checklist but does not deploy production.

## Submission assets

- [ ] **Hosted web URL** — final production URL recorded and opens successfully: `____________________________`
- [x] **Public GitHub URL** — `https://github.com/Rishikeshsanin/skylark-command`
- [ ] **Source ZIP** — generated from the approved final SHA/branch, not an older agent branch
- [x] **Decision Log** — `docs/DECISION_LOG.md` exists; re-check it after final integration for completeness
- [ ] **Final release SHA** — record here: `____________________________`

## Security / repository hygiene

- [ ] **No committed secrets** — final-tree and git-diff secret scan complete
- [ ] No real monday.com token appears in code, docs, screenshots, logs, Actions output, or submission ZIP
- [ ] No real optional AI provider key appears in repository/submission artifacts
- [ ] No server secret uses a `NEXT_PUBLIC_` prefix
- [ ] monday.com access remains query-only/read-only
- [ ] Canonical chat backend is only `POST /api/chat`; no competing production `/api/copilot` backend

## Build and CI

- [ ] `npm install` succeeds on the exact release candidate
- [ ] `npm test` succeeds
- [ ] `npm run lint` succeeds
- [ ] `npm run build` succeeds
- [ ] Release Gate GitHub Actions workflow is green for the exact release SHA

## Production / preview smoke

- [ ] Required Vercel environment variables configured
- [ ] `GET /` passes
- [ ] `GET /pipeline` passes
- [ ] `GET /operations` passes
- [ ] `GET /leadership` passes
- [ ] `GET /data-health` passes
- [ ] `GET /copilot` passes
- [ ] `GET /api/health` returns HTTP 200 and `status: "ok"`
- [ ] Optional safe `POST /api/chat` smoke passes
- [ ] **Production smoke complete** against final hosted URL

## Product verification

- [ ] **Desktop verified** — primary navigation, dashboards, data states, Copilot interaction
- [ ] **Mobile verified** — no blocking overflow/navigation/input issues
- [ ] **Chat verified** — loading, success, clarification, controlled error/retry behavior
- [ ] **monday live data verified** — source metadata/timestamps reflect live monday.com runtime data
- [ ] **Leadership Brief verified** — renders and matches deterministic data output
- [ ] **Data Health verified** — quality issues/caveats render and do not falsely imply clean data
- [ ] Pipeline page verified
- [ ] Operations page verified
- [ ] Overview page verified

## Evaluator sanity checks

- [ ] Ask: `What is our current open pipeline?`
- [ ] Ask: `Show me pipeline by stage.`
- [ ] Ask: `How healthy are our work orders?`
- [ ] Ask: `What are our receivables?`
- [ ] Ask: `Give me a leadership brief.`
- [ ] Ask: `What data-quality issues should I know about?`
- [ ] Ask: `Who are our best customers?` and verify a clarification is returned rather than an invented ranking definition
- [ ] Confirm displayed metrics match deterministic analytics/source truth rather than LLM arithmetic

## Release evidence to capture

- [ ] Screenshot: Overview
- [ ] Screenshot: Pipeline
- [ ] Screenshot: Operations
- [ ] Screenshot: Leadership Brief
- [ ] Screenshot: Data Health
- [ ] Screenshot: Founder Copilot response
- [ ] Screenshot or record: `/api/health` status `ok`
- [ ] Record: exact release SHA
- [ ] Record: final hosted URL
- [ ] Record: UTC/IST time of final smoke test

## Final manual sign-off

- [ ] Agent 4 integration accepted
- [ ] Agent 5 release QA/security red-team accepted
- [ ] MASTER CHAT reviewed deployment risks in `docs/DEPLOYMENT.md`
- [ ] MASTER CHAT confirmed no production deployment occurred from an unapproved agent branch
- [ ] Submission links and ZIP all point to the same approved release state

**Release status:** NOT READY until every required unchecked item above has been completed against the final integrated candidate.
