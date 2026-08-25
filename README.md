# Skylark Command

AI-powered business intelligence copilot for live monday.com sales and operations data.

## Status

Foundation initialized with Next.js, TypeScript, Tailwind CSS, ESLint, and GitHub Codespaces support.

The next implementation phase begins after the assignment datasets are reviewed:

- `Deal funnel Data.xlsx`
- `Work_Order_Tracker Data.xlsx`

Those files will define the real monday.com board schemas and analytics model. Production logic will query monday.com dynamically rather than hardcoding spreadsheet data.

## Architecture

```text
monday.com boards
      ↓
server-side data access
      ↓
normalization layer
      ↓
deterministic analytics engine
      ↓
AI planner / executive copilot
      ↓
Skylark Command UI
```

## Local / Codespaces development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

A `.devcontainer/devcontainer.json` is included, so GitHub Codespaces will automatically prepare Node and install dependencies.

## Environment

Copy `.env.example` to `.env.local` and add secrets only there.

```text
MONDAY_API_TOKEN=
```

Never commit API tokens or expose them in client-side code.

## Principles

- Live monday.com data is the source of truth.
- Deterministic BI calculations come before LLM interpretation.
- No assignment data is hardcoded into the production app.
- Secrets remain server-side.
- Quality and explainability matter more than decorative AI features.
