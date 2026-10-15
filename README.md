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

Locally, the app stores data in `data/command-center.sqlite` and `data/uploads` unless Turso env vars are set.

### OpenAI

Put the key in `.env.local` (never commit this file):

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Restart `npm run dev` after changing env values.

### Workflow

1. Open a store and upload a file into the matching source category.
2. CSV, TSV, Excel (`.xlsx` / `.xls`), and text-based PDF tables are parsed.
3. Map columns if the file needs review, then **Add to dashboard**.
4. Open **AI Analyzer**, choose reports, run an analysis, then **Copy write-up** or **Download PDF**. Possible Action Steps are written for store managers and floor staff.

## Presenting on other devices (Vercel)

A phone, laptop, or meeting-room computer all open the **same hosted site**. They do **not** each need their own copy of the reports. Upload once on the hosted site; every device sees the same stores and numbers.

Vercel cannot keep a local SQLite file. Use a free [Turso](https://turso.tech) database:

1. Create a Turso account and a database.
2. Copy the database URL and create an auth token.
3. In the Vercel project → **Settings → Environment Variables**, add:
   - `TURSO_DATABASE_URL` = your `libsql://...` URL
   - `TURSO_AUTH_TOKEN` = the token
   - `OPENAI_API_KEY` = your key (optional but needed for AI Analyzer)
   - `OPENAI_MODEL` = `gpt-4o-mini` (optional)
4. Redeploy the project (Deployments → … → Redeploy).
5. Open the Vercel URL, confirm Norwalk and Waterbury appear, then upload the Celerant reports once.

Uploaded report files are stored in Turso when those env vars are set, so they survive across devices and deploys.

### GitHub repo

Code lives at [Paccount3/store-report-center](https://github.com/Paccount3/store-report-center).

```powershell
cd C:\Users\shawn\Desktop\Goodwill\report-center
git add .
git commit -m "Describe your change"
git push origin main
```

Do **not** commit `.env.local`, SQLite databases, or uploaded report files.

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
