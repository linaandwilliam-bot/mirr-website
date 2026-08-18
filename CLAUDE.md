# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static HTML site for Mirr, an Australian virtual try-on marketplace at trymirr.com. Plain HTML/CSS/JS — no build step, no bundler, no package.json, no framework. Deployed via GitHub Pages directly from `main` (root).

## Commands

There is no build, lint, or test tooling in this repo. Workflow is:

- **Preview locally before committing** — open the HTML file(s) directly in a browser, or serve the directory (e.g. `python -m http.server`) since some pages fetch local JSON (`founding-count.json`) and `fetch()` can behave differently under `file://`.
- **Check links before every push** — run `node scripts/check-links.mjs`; it verifies every internal href/src in the HTML pages resolves to a real file and exits non-zero listing anything broken.
- **Test the fit engine before every push** — run `node scripts/fit-engine.test.mjs`; the full pre-push sequence is `node scripts/check-links.mjs && node scripts/verify.mjs && node scripts/fit-engine.test.mjs`.
- **Re-run the quality baseline after any sprint that changes page structure** — Lighthouse per the method in `docs/QUALITY-BASELINE.md`, and update that doc.
- **Verify structure before every push** — run `node scripts/verify.mjs`; it checks the site's structural invariants (design tokens defined, nav variants present, brands.json/founding-count.json valid, tokens.css + analytics beacon on every page, brand-demo's try-on flow anchors, BRAND_ALLOWLIST structure, commitment-consistency of business-day promises, JS syntax of every inline script block, and the schema shape of brands.json — name/valid tier/products — and submissions.json — ref/brand fields/valid status/products) and exits non-zero listing failures.
- **Deploy** — push to `main`; GitHub Pages publishes within ~1 minute. There is no staging environment, so pushing to `main` is effectively a live deploy.

## Architecture

### Navigation is centralized in nav.js — never hand-edit nav markup in pages
Every page includes `<div id="nav" data-variant="...">` followed by `<script src="/nav.js"></script>`. `nav.js` injects the actual `<nav>` HTML at runtime and replaces the placeholder div. There are two variants:
- `back` (default) — logo + "← Go back" link. Used on about, contact, privacy, terms, 404, submit-products, list-your-brand.
- `home` — full marketing nav with anchor links and CTAs. Used only on `index.html`.

To change any nav link, label, or CTA, edit `nav.js` only — do not add nav markup inline in a page.

### No shared stylesheet — each page owns its own `<style>` block
There's no shared CSS file; every HTML page duplicates its own `:root` design tokens and styles inline. The design system (consistent across pages, but copy-pasted, not linked) is:
- Fonts: **Playfair Display** (headings/serif accents, often italic for taglines), **Inter** (body/UI), **DM Mono** (logo wordmark, small mono labels) — loaded from Google Fonts.
- Accent color: `--sky: #7BAEC8` (hover state `--sky-lt: #A8C5D8`).
- When changing design tokens or typography, check whether the change needs to be replicated across multiple pages' inline `<style>` blocks, since there's no single source of truth.

### founding-count.json drives the founding-brands spot tracker
`founding-brands.html` fetches `/founding-count.json` (`{ filled, total }`) at runtime with `cache: 'no-store'` and renders slot progress, a progress bar, and copy ("N founding spots left at the 8% rate...") from it. Falls back to a safe default (0 filled) if the fetch fails. To update the live counter, edit `founding-count.json`; no code change is needed.

### fit-engine.js is the single source of truth for fit math
`/fit-engine.js` holds the fit engine — `FIT_EASE`, `SIZE_STEPS`, `GRADE`, `scoreCirc`, `scoreLength`, `gradeDims`, `computeFit`, `recommendSize` — as browser globals with a dual-context `module.exports` for Node. brand-demo.html loads it via `<script src="/fit-engine.js">`; the math is duplicated nowhere and must never be re-inlined (verify.mjs enforces both). Any change to it must keep `node scripts/fit-engine.test.mjs` green.

### brand-demo.html: try-on flow calls the mirr-tryon-worker
The live demo flow in `brand-demo.html` posts to a Cloudflare Worker at `https://mirr-tryon-worker.linaandwilliam.workers.dev`:
1. `POST /` with `{ person_image_b64, garment_url, category }` → returns `{ job_id }` (~5s).
2. Poll `GET /status?job=<job_id>` every 3s (up to 60 polls / 180s) until `status === 'completed'`, then read `result_url` or `result_b64`.

The worker itself lives outside this repo — this file only contains the client-side calling code.

### submit-products.html: BRAND_ALLOWLIST and submissions.json are machine-managed — never hand-edit
The `BRAND_ALLOWLIST` object (client-side email→access-code gate) is maintained by a Cloudflare Worker, not by hand. Do not manually add/remove/edit entries in that block. This gate is explicitly a "keep honest people out" check (codes are visible in the served JS), not real security. Submission photos post to IMGBB and a courtesy notification goes to Formspree (keys are inline in this page, consistent with the "not real security" model above).

The authoritative submission pipeline is the deployed Catalog Worker (`mirr-catalog-worker.linaandwilliam.workers.dev`): submit-products.html POSTs to its `/submit` endpoint, which commits the submission into `submissions.json` in this repo. `submissions.json` is Worker-managed data — do not hand-edit its structure, same rule as BRAND_ALLOWLIST.

**Caution for verification work:** do not casually POST real test data to the Worker's `/submit` during checks — every successful call creates a real commit on `main` that needs manual cleanup. Prefer probing with invalid/malformed payloads, which correctly fail validation without writing anything. If a full end-to-end write test is genuinely needed, clean up the resulting `submissions.json` entry in the same session.

### Promoting a submission into brands.json
`node scripts/promote-submission.mjs <submission-ref>` scaffolds/updates the brand's entry in `brands.json` from a `submissions.json` entry, mapping submitted flat-lay dims into the fit-engine format (`dims`/`sample_size`; `fit` is left for human judgment). The default run is a dry run that prints the proposed diff and review notes — add `--write` to apply, `--force` to overwrite an existing product. It validates against the same schema rules `verify.mjs` enforces and refuses to write anything invalid. It never touches `submissions.json` — flip the submission's status to `live` by hand (a permitted manual edit of Worker-managed data, per the review-page convention). Review the printed notes before going live: `buy_url` is always missing from submissions, and submitted dims measure the smallest stocked size while `sample_size` is set to the range's middle.

### Custom domain
`CNAME` pins the Pages deployment to `www.trymirr.com`; `sitemap.xml` and `robots.txt` reference the same host — keep them in sync if the domain or route list changes.
