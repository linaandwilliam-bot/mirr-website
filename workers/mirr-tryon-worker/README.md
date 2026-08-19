# mirr-tryon-worker

**Source imported 2026-08-20** — exported verbatim from the Cloudflare
dashboard (Workers & Pages → mirr-tryon-worker → Edit code) into
`worker.js`. The repo copy must match the deployment byte-for-byte: never
"tidy" it here. If the dashboard's Edit code view differs from this file,
the dashboard is the source of truth — re-export (DISASTER-RECOVERY.md §2).

**What it does:** proxies try-on jobs from brand-demo.html to PixelAPI,
with a KV cache for garment images (binding `GARMENT_CACHE`, 30-day TTL)
so repeat try-ons of the same garment skip the fetch+base64 step. This
worker IS the product's critical path.

## Endpoints (match the deployed v10/v11 source)

- `POST /` — body `{ person_image_b64, garment_url, category }` →
  `{ success: true, job_id, credits_used }` on accept. Validates category
  against `upperbody|lowerbody`, caps person images at 15MB server-side
  (the client pre-checks ~11MB), returns `502` with PixelAPI's error detail
  on submit failure (codes like `person_image_social_ui` reach the client
  through `detail`).
- `GET /status?job=<id>` — single PixelAPI poll →
  `{ status, result_url?, result_b64? }`. The client polls every 3s, max 60.
- `GET /ping` — health check, returns `{ status: 'ok', version: 11 }`.
- CORS: browser access from the production origins only
  (www.trymirr.com / trymirr.com).

## Known quirks in the deployed source (recorded, NOT fixed — byte-for-byte rule)

- The file header says "v10" while `/ping` reports `version: 11`.
- `json()` at module scope reads the worker-global `origin` (the worker's
  own origin), not the request's — so every JSON response pins
  `Access-Control-Allow-Origin: https://www.trymirr.com` regardless of
  which allowed origin called. Observed in the Sprint 72 CORS probes;
  harmless for the two-origin allowlist because www is the canonical host.

## Secrets and bindings (names only — never values, never in this repo)

- `PIXEL_KEY` (secret) — PixelAPI bearer token.
- `IMGBB_KEY` (secret) — bound but unreferenced by any current code path;
  kept in case imgbb upload logic returns.
- `GARMENT_CACHE` (KV namespace binding) — garment base64 cache.

## Redeploy

The deployment predates any wrangler config for this worker (dashboard-
managed). Either paste `worker.js` into the dashboard's Edit code view and
deploy, or create a minimal `wrangler.toml` IN THIS FOLDER (name, main,
compatibility_date, the `GARMENT_CACHE` KV binding) and run
`wrangler deploy` from this folder. Secrets are set separately
(`wrangler secret put PIXEL_KEY` etc.) and are never part of the source.

**Standing rule (July 2026 incident, DISASTER-RECOVERY.md §4):** wrangler
config lives INSIDE this subfolder only. Never place wrangler config at the
repo root — that is what deployed the whole site as a stale Worker.
