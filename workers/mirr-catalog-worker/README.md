# mirr-catalog-worker

**Source imported 2026-08-20** — exported verbatim from the Cloudflare
dashboard (Workers & Pages → mirr-catalog-worker → Edit code) into
`worker.js`. The repo copy must match the deployment byte-for-byte: never
"tidy" it here. If the dashboard's Edit code view differs from this file,
the dashboard is the source of truth — re-export (DISASTER-RECOVERY.md §2).

**What it does:** the authoritative product-submission pipeline. Receives
submissions from submit-products.html and commits them into
`submissions.json` on this repo's `main` branch via the GitHub contents
API (a real commit — which is why every hand edit in the runbook starts
with `git pull`). Generates the `MIRR-<stamp>-<rand>` reference the brand
sees on their success screen.

## Endpoints (match the deployed source)

- `POST /submit` — body `{ brand_name, brand_email, products: [...] }` →
  `{ ok: true, ref }` on success; `{ ok: false, error }` with an honest
  status code otherwise (400 validation, 502 GitHub read/commit failure,
  500 if submissions.json exists but is corrupt — needs manual repair).
  Product objects are stored exactly as sent (passthrough), which is how
  Sprint 85's `front_delete_url`/`back_delete_url` fields flow through.
- Anything else → 404. CORS: production origins only; no auth gate by
  design — it matches submit-products.html's "keep honest people out"
  model (the page's client-side allowlist is the only gate).
- UTF-8 note: the source deliberately uses
  `decodeURIComponent(escape(atob(...)))` / `btoa(unescape(encodeURIComponent(...)))`
  — plain `atob()` double-encodes non-ASCII and has corrupted files twice
  before. Do not "simplify" it.

## RUNBOOK FOUND #2 — ANSWERED by this source

The worker sends **no email of any kind** and has no mechanism that
detects a submission's status flip (its own header says so: statuses are
moved by hand-editing submissions.json on GitHub). The go-live
confirmation email is therefore a purely manual step — the first-brand
checklist's step 13 ("send it yourself") is the real and only mechanism.

## Secrets and variables (names only — never values, never in this repo)

- `GITHUB_TOKEN` (secret) — fine-grained PAT scoped to ONLY this repo,
  Contents: Read & Write. Set per-worker even if the same value is used
  by mirr-brand-setup-worker.
- Plain vars (defaults exist in code): `GITHUB_OWNER`, `GITHUB_REPO`,
  `GITHUB_BRANCH`.

## Redeploy

Dashboard-managed deployment (no wrangler.toml yet). Paste `worker.js`
into the dashboard's Edit code view and deploy, or create a minimal
`wrangler.toml` IN THIS FOLDER and run `wrangler deploy` from here.
`wrangler secret put GITHUB_TOKEN` sets the secret separately.

**Standing rule (July 2026 incident, DISASTER-RECOVERY.md §4):** wrangler
config lives INSIDE this subfolder only — never at the repo root.
