# Goodwill Store Dashboard

Reporting and performance dashboards for Goodwill retail stores, plus an AI report analyzer.

**This deployment is a read-only demo.** Norwalk (20) and Waterbury (210) plus the prototype Celerant reports are baked into the app, so the Vercel site works on any device without a database. Uploading new files or adding stores is disabled until a shared database is wired up later.

Source report files in the repo:

- `Report #1 Prototype Run.csv`
- `Report #1 Prototype Run 2025.csv`
- `Report #2 Prototype Run.csv.xlsx`
- `Sq Ft.xlsx`

Metrics shown in the UI come from `src/lib/demo/snapshot.json.gz` (exported from those files).

## Local setup

```powershell
cd C:\Users\shawn\Desktop\Goodwill\report-center
copy .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000.

### OpenAI

Put the key in `.env.local` (never commit this file):

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Restart `npm run dev` after changing env values.

## Deploy on Vercel

1. Import [Paccount3/store-report-center](https://github.com/Paccount3/store-report-center).
2. Framework preset: **Next.js**.
3. Add `OPENAI_API_KEY` (optional, for AI Analyzer).
4. Deploy — no database env vars are required for the demo.

## Refreshing the demo snapshot

If the local `data/command-center.sqlite` is updated from new imports:

```powershell
node scripts/export-demo-snapshot.mjs
```

Commit the updated `src/lib/demo/snapshot.json.gz`.

## Live database later

Manual upload and connectors should call `ingestInbound()` again once a shared database replaces the demo snapshot.
