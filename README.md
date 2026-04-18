# TATVA — Global Intelligence

Vite + React intel globe. See `.env.example` for API keys (copy to `.env` locally).

## Deploy on Vercel

### 1. Environment variables

In the [Vercel project](https://vercel.com/dashboard) → **Settings** → **Environment Variables**, add every `VITE_*` key from `.env.example` (Production / Preview as needed).  
`VITE_CESIUM_ION_TOKEN` is required for the Cesium globe; others depend on which features you use.

Redeploy after changing env vars.

### 2. Deploy via Git (recommended)

Connect this repo in Vercel → **Import Project** → root directory **`/`** (repo root is this `atlas` folder if the monorepo only contains the app).  
Vercel reads `vercel.json` and runs `npm install` + `npm run build`, serving `dist/`.

### 3. Deploy via CLI

```bash
npm i -g vercel
cd path/to/atlas
vercel login
vercel link    # link to an existing project or create one
vercel         # preview
vercel --prod  # production
```

If the GitHub repo moved, update the remote:

`git remote set-url origin https://github.com/shreyassunke/atlas-global-intelligence.git`

### Notes

- **SPA routing:** `vercel.json` rewrites unknown paths to `index.html` so refreshes work if you add client routes later.
- **Large assets:** `public/audio` MP3s ship with the static build; keep an eye on bundle/deploy size.
- **Secrets:** Never commit `.env`; use Vercel env UI only for production keys.

## GDELT BigQuery backend (local dev)

All historical GDELT analytics (country stability, theme timelines, actor networks, mentions progression, Visual GKG, TV AI, etc.) go through a Vercel serverless proxy at `/api/gdelt-query`. The proxy reads the service-account credentials from `GOOGLE_CLOUD_CREDENTIALS` and targets `GOOGLE_CLOUD_PROJECT`. Both must be set in Vercel for prod, and in `.env.local` when running `vercel dev` locally.

### Terminal A — API

```bash
cd atlas
# One-time: populate .env.local with GOOGLE_CLOUD_CREDENTIALS and GOOGLE_CLOUD_PROJECT
npm run dev:api
# serves /api/* at http://localhost:3001
```

### Terminal B — Vite

```bash
cd atlas
npm run dev
# Vite proxies /api/* → http://localhost:3001 (see vite.config.js)
```

The client always calls the same `/api/gdelt-query` path; the Vite proxy makes dev and prod indistinguishable.

### Cost control

- `ATLAS_MAX_SCAN_BYTES` (default 500 MB) rejects any BigQuery query whose `dryRun` estimate exceeds the limit. Bump it in Vercel env if a legitimate template needs more.
- Named SQL templates live in [`api/_lib/queryTemplates.js`](api/_lib/queryTemplates.js). All are `_PARTITIONTIME`-bounded and `LIMIT @limit`-capped.
- In-memory rate limiter ([`api/_lib/rateLimiter.js`](api/_lib/rateLimiter.js)) caps clients at 30 req/min per IP.

### Debug overlay

Append `?debug=1` to any atlas URL (or set `localStorage.atlasDebug = '1'`) to toggle the dev-only **Fetch Status Overlay** in the bottom-right: per-source live status, event counts, and partial-failure warnings. Useful for spotting silent GDELT chain failures.
