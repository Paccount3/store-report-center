# Goodwill Store Dashboard

Reporting and performance dashboards for Goodwill retail stores, plus an AI report analyzer.

Stores are created on first launch (**Norwalk** / code **20**, **Waterbury** / code **210**). Add or rename stores from the store directory. Charts use imported files only.

Each store page is split by source: Celerant, ADP, Upright Labs, GW Work Place, Financial / P&L, and Other. Empty sources stay grey until a file is imported.

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

Restart `npm run dev` after changing env values. The key is read only by `src/app/api/analyze/route.ts`.

### Workflow

1. Open a store and upload a file into the matching source category.
2. CSV, TSV, Excel (`.xlsx` / `.xls`), and text-based PDF tables are parsed.
3. Map columns if the file needs review, then **Add to dashboard**.
4. Open **AI Analyzer**, choose reports, run an analysis, then **Copy write-up** or **Download PDF**. Possible Action Steps are written for store managers and floor staff, not as report-reading instructions.

Accepted uploads live under `data/uploads`. Metrics live in `data/command-center.sqlite` (or under `DATA_DIR` if set).

## New GitHub repository

This project is meant to live in its **own** GitHub repository. Do not push it into any other existing repo.

From this folder (after the local git repo is initialized):

```powershell
cd C:\Users\shawn\Desktop\Goodwill\report-center
git status
git add .
git commit -m "Initial Goodwill Store Dashboard"
gh repo create goodwill-store-dashboard --private --source=. --remote=origin
git push -u origin main
```

Or create an empty repository on GitHub first, then:

```powershell
git remote add origin https://github.com/<your-org-or-user>/goodwill-store-dashboard.git
git push -u origin main
```

Do **not** commit `.env.local`, SQLite databases, or uploaded report files. They are ignored.

## Deploy on Vercel

1. Import the new GitHub repository in [Vercel](https://vercel.com).
2. Framework preset: **Next.js**.
3. Add environment variables:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional)
4. Deploy.

### Important: data storage on Vercel

This app uses a local SQLite file and a local `data/uploads` folder. On Vercel those paths are **ephemeral**: uploads and dashboard numbers will not reliably persist across deploys or serverless instances.

For a production Vercel deployment you will need durable storage next, for example:

- SQLite-compatible hosted DB (e.g. Turso / LibSQL), and
- object storage for uploaded files (e.g. Vercel Blob or S3)

Until that is wired up, use local `npm run dev` / a host with a persistent disk for real store data. You can still deploy the UI and AI analyzer to Vercel for demos if you accept that imported files reset.

Set `DATA_DIR` only when you control a writable persistent path.

## Live feed later

Manual upload and any future connector should call `ingestInbound()` in `src/lib/ingestion/ingest.ts`.

```ts
await ingestInbound(storeId, {
  filename: "celerant-export.csv",
  bytes,
  category: "celerant",
  source: "automated",
});
```
