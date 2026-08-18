# mirr-brand-setup-worker

> **SOURCE NOT YET IMPORTED — copy it from the Cloudflare dashboard**
> (Workers & Pages → mirr-brand-setup-worker → edit code → copy into
> `src/index.js` here). Until then this folder documents the deployed
> worker's contract so the gap is visible rather than forgotten. Do not
> reconstruct the code from memory — copy the deployed source verbatim.

**What it does:** commits new brand allowlist entries into
submit-products.html's `BRAND_ALLOWLIST` on GitHub, driven by the internal
new-brand.html tool during onboarding (docs/RUNBOOK.md §1).

## Endpoints (client-verified contract)

- `POST /` — headers `X-Admin-Key: <admin key>`, body
  `{ email, code, brandName }` → `{ ok: true, message }` on success;
  `401` on a wrong/rotated admin key (the tool then forgets its cached key
  and re-prompts); other failures surface the tool's manual-fallback
  snippet flow.

## Secrets (names only — never values, never in this repo)

- `ADMIN_KEY` — shared admin key; the operator's browser caches it in
  localStorage as `mirr_admin_key`.
- `GITHUB_TOKEN` — repo write access (commits submit-products.html).

(Names documented in DISASTER-RECOVERY.md §2.)

## Deploy

Once source + `wrangler.toml` are imported into THIS folder:

```
cd workers/mirr-brand-setup-worker && wrangler deploy
```

**Standing rule (July 2026 incident, DISASTER-RECOVERY.md §4):** wrangler
config lives INSIDE this subfolder only — never at the repo root.
