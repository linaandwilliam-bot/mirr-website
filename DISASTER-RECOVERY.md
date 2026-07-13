# DISASTER-RECOVERY.md

Reference documentation for trymirr.com's hosting and the Cloudflare Workers around it.
Not linked from any page. No secrets in this file — secret **names** only, never values.

## 1. Hosting model — GitHub Pages is the host, nothing else

The site is plain static HTML served by **GitHub Pages** from this repo's `main` branch
(root). `CNAME` pins the deployment to `www.trymirr.com`. There is no build step: a push
to `main` is live within ~1 minute. Cloudflare Workers exist around the site (§2) but
**must never serve the site itself**.

### Healthy state
- Repo → Settings → Pages shows the latest build green, source `main` / root.
- A change pushed to `main` is visible on https://www.trymirr.com within ~2 minutes.
- The live HTML matches the repo. Quick probe (the same technique that diagnosed the
  July 2026 incident, §4): commit a harmless marker (an HTML comment) to `main`, wait
  2 minutes, then `curl -s https://www.trymirr.com | grep <marker>`. Found = Pages is
  the active host. Remove the marker afterwards.

### Broken state looks like
- The live site is **stale**: pushes to `main` succeed and Pages builds go green, but
  the served content never changes. This is the signature of something else (a
  Cloudflare Worker) having captured the domain.
- Encoding corruption (mojibake — `â€™`-style characters) on the live site while the
  repo's files are clean UTF-8 — seen when a stale Worker copy served old assets.
- A Cloudflare-branded error page (Error 1xxx) instead of GitHub's 404 page.

## 2. Cloudflare Workers inventory

These live in the Cloudflare account (linaandwilliam), **outside this repo**. Code for
them is not in this repo; only client-side calls to them are.

| Worker | Called from | Purpose | Secrets required (names only) |
|---|---|---|---|
| `mirr-tryon-worker.linaandwilliam.workers.dev` | brand-demo.html | Proxies try-on jobs to PixelAPI (`POST /` submit, `GET /status` poll) | Its PixelAPI credentials (API key) |
| `mirr-brand-setup-worker.linaandwilliam.workers.dev` | new-brand.html (internal tool) | Commits new brand allowlist entries to submit-products.html on GitHub | `ADMIN_KEY` (shared admin key; also kept in the operator's browser localStorage as `mirr_admin_key`), `GITHUB_TOKEN` (repo write) |
| `mirr-catalog-worker.linaandwilliam.workers.dev` | submit-products.html (`POST /submit`) | Registers product submissions | Not documented here — check the Worker's own config |

If a Worker is down: brand-demo's try-on falls back to a side-by-side preview (site
otherwise fine); new-brand's GitHub auto-commit fails with a manual-fallback snippet
shown; submit-products shows its error screen with a retry.

## 3. What CLAUDE.md and the check scripts assume

- **No build step, no staging** — `main` is production. All tooling assumes files are
  served exactly as committed, from the repo root, with extensionless URLs
  (`/about` → `about.html`) courtesy of GitHub Pages.
- `node scripts/check-links.mjs` — every internal href/src must resolve to a real file.
- `node scripts/verify.mjs` — structural invariants (tokens/nav/beacon per page,
  brands.json + founding-count.json validity, try-on flow anchors, BRAND_ALLOWLIST
  structure, commitment-consistency, inline-JS syntax). Both run before every push.
- Neither script knows anything about DNS or Workers — they validate the repo, not the
  hosting. A green check run says nothing about whether Pages is actually serving.

## 4. "If the site looks broken" checklist

1. **GitHub Pages build status** — repo → Settings → Pages (or the `pages-build-
   deployment` workflow run). Red build: fix the reported file. Green build but stale
   site: continue.
2. **Run the marker probe** (§1). Marker absent from the live site = GitHub Pages is
   not the active host — almost certainly a Cloudflare Worker or proxy has captured
   the domain. Continue.
3. **DNS records** — in the domain's DNS (Cloudflare dashboard), `www` should point at
   GitHub Pages (`<owner>.github.io` CNAME). Check no Worker **route** or **custom
   domain** is attached to `trymirr.com`/`www.trymirr.com` under Workers & Pages.
4. **Worker deployment status** — in Workers & Pages, look for any Worker named
   `mirr-website` (the autoconfig artifact, below) or any Worker with a route on the
   apex/www. Delete the route (or the Worker) so requests fall through to Pages.
5. The three Workers in §2 are **API endpoints only** — they should never have routes
   on trymirr.com itself.

### Worked example — the July 2026 Cloudflare autoconfig incident

Reconstructed from git history (commits `22518d3`, `ef74f5e`, `0dd26c6`):

- A Cloudflare Workers integration auto-deployed **the entire site as a Worker** named
  `mirr-website` (static assets from `.`). That Worker — not GitHub Pages — became what
  visitors received, and it served a **stale copy with corrupted encoding** (mojibake),
  while pushes to `main` built green on Pages and changed nothing live.
- Diagnosis used the marker probe: a temporary entry was committed to
  submit-products.html's allowlist and checked against the live site — its absence
  proved Pages wasn't the active host ("old Worker still live", commit `22518d3`,
  7 July 2026).
- On 10 July 2026 Cloudflare's `cloudflare-workers-and-pages[bot]` pushed two branches
  — **`cloudflare/workers-autoconfig`** and **`cloudflare/workers-autoconfig-2`** —
  each adding a `wrangler.jsonc` that registers this repo as that Worker. They were
  pushed to the remote and have since been deleted. If they, or anything similar, ever
  reappear: **never merge them** — merging would re-create the incident. (Their
  commits remain findable in local clones as `ef74f5e`/`0dd26c6`.)
- Recovery was: remove the `mirr-website` Worker (or its domain binding) in the
  Cloudflare dashboard so the domain fell through to GitHub Pages again, then repair
  the encoding damage on the affected page.

**Standing rule:** if Cloudflare ever offers to "connect" or "deploy" this repo,
decline. GitHub Pages is the host; Cloudflare is for the API Workers and analytics
only.
