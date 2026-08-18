# mirr-tryon-worker

> **SOURCE NOT YET IMPORTED — copy it from the Cloudflare dashboard**
> (Workers & Pages → mirr-tryon-worker → edit code → copy into `src/index.js`
> here). Until then this folder documents the deployed worker's contract so
> the gap is visible rather than forgotten. Do not reconstruct the code from
> memory — copy the deployed source verbatim.

**What it does:** proxies try-on jobs from brand-demo.html to PixelAPI. This
worker IS the product's critical path — it is the reason this folder exists.

## Endpoints (client-verified contract)

- `POST /` — body `{ person_image_b64, garment_url, category }` →
  `{ success: true, job_id, credits_used }` on accept; `400` with
  `{ error, detail }` on validation failure (detail carries PixelAPI error
  codes such as `person_image_social_ui`, `person_image_insufficient_framing`).
  Enforces a ~15MB person-image cap server-side (the client pre-checks 11MB).
- `GET /status?job=<id>` — `{ status: queued|processing|completed,
  result_url?, result_b64?, all_keys? }`. The client polls every 3s, max 60.
- CORS allows the production origin only (verified: requests from other
  origins are rejected at the browser).

## Secrets (names only — never values, never in this repo)

- Its PixelAPI credentials (API key). Exact secret name: check the worker's
  Settings → Variables in the dashboard and record the NAME here on import.

## Deploy

Once source + `wrangler.toml` are imported into THIS folder:

```
cd workers/mirr-tryon-worker && wrangler deploy
```

**Standing rule (July 2026 incident, DISASTER-RECOVERY.md §4):** wrangler
config lives INSIDE this subfolder only. Never place wrangler config at the
repo root — that is what deployed the whole site as a stale Worker.
