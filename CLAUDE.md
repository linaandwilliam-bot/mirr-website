# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static HTML site for Mirr, an Australian virtual try-on marketplace at trymirr.com. Plain HTML/CSS/JS — no build step, no bundler, no package.json, no framework. Deployed via GitHub Pages directly from `main` (root).

## Commands

There is no build, lint, or test tooling in this repo. Workflow is:

- **Preview locally before committing** — open the HTML file(s) directly in a browser, or serve the directory (e.g. `python -m http.server`) since some pages fetch local JSON (`founding-count.json`) and `fetch()` can behave differently under `file://`.
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

### brand-demo.html: try-on flow calls the mirr-tryon-worker
The live demo flow in `brand-demo.html` posts to a Cloudflare Worker at `https://mirr-tryon-worker.linaandwilliam.workers.dev`:
1. `POST /` with `{ person_image_b64, garment_url, category }` → returns `{ job_id }` (~5s).
2. Poll `GET /status?job=<job_id>` every 3s (up to 60 polls / 180s) until `status === 'completed'`, then read `result_url` or `result_b64`.

The worker itself lives outside this repo — this file only contains the client-side calling code.

### submit-products.html: BRAND_ALLOWLIST is machine-managed — never hand-edit
The `BRAND_ALLOWLIST` object (client-side email→access-code gate) is maintained by a Cloudflare Worker, not by hand. Do not manually add/remove/edit entries in that block. This gate is explicitly a "keep honest people out" check (codes are visible in the served JS), not real security — the plan is to move validation into the Catalog Worker (`mirr-catalog-worker.linaandwilliam.workers.dev`) once prioritized. Submission itself posts to Formspree and IMGBB (keys are inline in this page, consistent with the "not real security" model above).

### Custom domain
`CNAME` pins the Pages deployment to `www.trymirr.com`; `sitemap.xml` and `robots.txt` reference the same host — keep them in sync if the domain or route list changes.
