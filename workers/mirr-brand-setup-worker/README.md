# mirr-brand-setup-worker

**Source imported 2026-08-20** — exported verbatim from the Cloudflare
dashboard (Workers & Pages → mirr-brand-setup-worker → Edit code) into
`worker.js`. The repo copy must match the deployment byte-for-byte: never
"tidy" it here. If the dashboard's Edit code view differs from this file,
the dashboard is the source of truth — re-export (DISASTER-RECOVERY.md §2).

**What it does:** commits new brand allowlist entries into
submit-products.html's `BRAND_ALLOWLIST` on GitHub via the contents API,
driven by the internal new-brand.html tool during onboarding
(docs/RUNBOOK.md §1). Inserts one line after the `const BRAND_ALLOWLIST = {`
anchor — if that structure in submit-products.html ever changes, the
worker's anchor string must change with it (the worker fails loudly with
a "has the file structure changed?" error, not silently).

## Endpoints (match the deployed source)

- `POST /` — header `X-Admin-Key` (timing-safe compared, both sides
  trimmed against paste-with-newline mistakes), body
  `{ email, code, brandName }` → `{ ok: true, commitUrl, message }`.
  Failure modes: `503` if the ADMIN_KEY secret is unset (fails closed),
  `401` wrong key (the tool forgets its cached key and re-prompts),
  `409` if the email is already in the allowlist, `400` invalid
  email/code shape (codes must be `[A-Z0-9-]{3,40}`), `502` GitHub
  read/commit failures. CORS: production origins only, but the admin key
  is the real gate — CORS only restricts browsers.
- Same UTF-8 encode/decode convention as mirr-catalog-worker (see that
  README) — do not "simplify" the atob/btoa wrapping.

## Secrets and variables (names only — never values, never in this repo)

- `ADMIN_KEY` (secret) — shared admin key; the operator's browser caches
  it in localStorage as `mirr_admin_key`. Cloudflare never displays a
  secret's value again after it is set — the value must live in the
  founders' password store (first-brand checklist step 1). If lost:
  set a new secret on the worker.
- `GITHUB_TOKEN` (secret) — fine-grained PAT scoped to ONLY this repo,
  Contents: Read & Write.
- Plain vars (defaults exist in code): `GITHUB_OWNER`, `GITHUB_REPO`,
  `GITHUB_FILE_PATH`, `GITHUB_BRANCH`.

## Redeploy

Dashboard-managed deployment (no wrangler.toml yet). Paste `worker.js`
into the dashboard's Edit code view and deploy, or create a minimal
`wrangler.toml` IN THIS FOLDER and run `wrangler deploy` from here.
Secrets are set separately with `wrangler secret put`.

**Standing rule (July 2026 incident, DISASTER-RECOVERY.md §4):** wrangler
config lives INSIDE this subfolder only — never at the repo root.
