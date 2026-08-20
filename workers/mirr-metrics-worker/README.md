# mirr-metrics-worker

**Source imported 2026-08-20** — from the worker's deployment (deployed
2026-08-19), together with its real `wrangler.toml`. The repo copy must
match the deployment byte-for-byte: never "tidy" it here. If the
dashboard's Edit code view differs from this file, the dashboard is the
source of truth — re-export (DISASTER-RECOVERY.md §2).

**What it does:** counts anonymous funnel events per brand and serves the
counts back to the brand dashboard. Privacy by construction: it stores
ONLY aggregate counters keyed by brand/event/UTC-day — the beacon's
`product` and `at` fields are accepted but discarded, and no IPs, user
agents, measurements, photos, or emails are ever stored.

## Architecture — Cloudflare D1, and why not a Durable Object

Storage is **Cloudflare D1** (binding `DB`, database `mirr-metrics`).
A Durable Object was the textbook fit for an atomic counter, but a DO
class cannot be deployed from the Cloudflare dashboard — it needs a
wrangler migration, and this worker was deployed dashboard-only with no
CLI access. D1 can be created and bound entirely in the dashboard, and
the ingest uses an atomic upsert, so nothing is lost by the substitution.

The full schema, exactly as applied via the D1 console (reproducible):

```sql
CREATE TABLE IF NOT EXISTS counts (
  brand TEXT NOT NULL,
  event TEXT NOT NULL,
  day   TEXT NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (brand, event, day)
);
```

Ingest is `INSERT ... ON CONFLICT(brand, event, day) DO UPDATE SET n = n + 1`.

## Endpoints (match the deployed source)

- `POST /` — body `{ event, brand, product, at }` (≤512 bytes). Events
  allowlisted to the five the site sends: `demo-started`,
  `tryon-completed`, `tryon-failed`, `buy-clicked`, `sample-viewed`
  (all five wired site-side since Sprint 87). Brands validated against
  `^[a-z0-9][a-z0-9-]{0,39}$`. Origin must be a production origin — OR
  the request may present `X-Admin-Key`, a side door for
  verification/testing without an Origin header.
- `GET /counts?brand=<slug>` — `{ tryons, buys, demos, samples }`
  (60s public cache). dashboard.html needs numeric `tryons` for the
  try-on card and BOTH `tryons` and `buys` for the LIVE ACTIVITY panel;
  `demos`/`samples` are collected but not yet displayed anywhere.
- `GET /stats` — full per-day breakdown; requires `X-Admin-Key`.
- Anything else → `{ ok: true, service: 'mirr-metrics-worker' }`.

## KNOWN ISSUE (found 2026-08-20, Sprint 90) — /stats is curl-only until a one-line deploy

`cors()` returns `Access-Control-Allow-Headers: Content-Type`, so a browser
preflight for the `X-Admin-Key` header is rejected **even from the
production origin** — metrics.html (the founder view) cannot reach /stats
from any browser. The fix is one line in the deployed worker, in `cors()`:

```
'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
```

(exactly what mirr-brand-setup-worker already allows). Deploy that change,
then update this folder's `worker.js` to match — in that order, so the repo
copy never claims something the deployment doesn't do. Until then /stats
works only from non-browser clients (curl sends no preflight), and
metrics.html shows its honest "worker didn't respond" state.

- `ADMIN_KEY` (secret) — guards `/stats` and the no-Origin ingest side
  door.
- `DB` (D1 binding) — database `mirr-metrics` (id recorded in
  `wrangler.toml`; a D1 database id is configuration, not a credential).

## Redeploy

This folder carries the real `wrangler.toml`, so:

```
cd workers/mirr-metrics-worker && wrangler deploy
```

`wrangler secret put ADMIN_KEY` sets the secret separately. The D1
database must exist first (dashboard → D1 → create `mirr-metrics`, run
the CREATE TABLE above, bind as `DB`).

**Standing rule (July 2026 incident, DISASTER-RECOVERY.md §4):** wrangler
config lives INSIDE this subfolder only — never at the repo root.
