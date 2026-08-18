# mirr-catalog-worker

> **SOURCE NOT YET IMPORTED — copy it from the Cloudflare dashboard**
> (Workers & Pages → mirr-catalog-worker → edit code → copy into
> `src/index.js` here). Until then this folder documents the deployed
> worker's contract so the gap is visible rather than forgotten. Do not
> reconstruct the code from memory — copy the deployed source verbatim.

**What it does:** the authoritative product-submission pipeline. Receives
submissions from submit-products.html and commits them into
`submissions.json` on this repo's `main` branch (a real commit — which is
why every hand edit in the runbook starts with `git pull`).

## Endpoints (client-verified contract)

- `POST /submit` — body `{ brand_name, brand_email, products: [...] }` →
  `{ ok: true, ref }` on success (ref is shown to the brand as their
  reference number); `{ ok: false, error }` or non-2xx on failure, which
  submit-products surfaces as its honest error screen.

## Open question (docs/RUNBOOK.md, FOUND WHILE DOCUMENTING #2)

A client-side comment claims this worker sends the go-live confirmation
email when a submission's status is flipped to `live` — but the flip is a
manual GitHub edit and no mechanism is verifiable from the site repo.
Confirm (or refute) when importing the source, and update the runbook.

## Secrets (names only — never values, never in this repo)

- A GitHub token with repo write access (commits submissions.json). Exact
  secret name: check the worker's Settings → Variables and record the NAME
  here on import.

## Deploy

Once source + `wrangler.toml` are imported into THIS folder:

```
cd workers/mirr-catalog-worker && wrangler deploy
```

**Standing rule (July 2026 incident, DISASTER-RECOVERY.md §4):** wrangler
config lives INSIDE this subfolder only — never at the repo root.
