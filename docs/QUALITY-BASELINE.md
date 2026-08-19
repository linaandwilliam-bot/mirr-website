# QUALITY-BASELINE.md

Recorded performance / accessibility baseline so regressions become visible —
the structural checks (verify.mjs) cannot see scores. Re-run after any sprint
that changes page structure and update this file (rule recorded in CLAUDE.md).

## Method (reproducible)

- **Tool:** Lighthouse 13.4.1 via `npx --yes lighthouse`, headless Chrome
  (`--chrome-flags="--headless=new"`, stable desktop Chrome at
  `C:\Program Files\Google\Chrome\Application\chrome.exe`), default mobile
  emulation and throttling, categories
  `performance,accessibility,best-practices,seo`.
- **Target:** the live site (https://www.trymirr.com), not localhost —
  real hosting, real network. Run each page once; performance wobbles a few
  points between runs, the other three categories are stable.
- **Page weight:** Lighthouse's `total-byte-weight` audit (KiB, transferred).
- Known harmless noise on this machine: chrome-launcher exits 1 with an
  `EPERM … lighthouse.<n>` temp-dir cleanup error AFTER the report is
  written. Ignore the exit code; check the JSON exists.

## Baseline — 2026-08-19 (live site, post-Sprint-81 deploy)

| Page | Perf | A11y | Best practices | SEO | Weight |
|---|---|---|---|---|---|
| index.html | 84 | 100 | 100 | 100 | 394 KiB |
| brand-demo.html | 74 | 96 | 100 | 100 | 352 KiB |
| founding-brands.html | 98 | 100 | 100 | 100 | 133 KiB |

Sprint 81 closed both OPEN accessibility findings from the 2026-08-18
baseline: every page now has a single `<main>` landmark plus a skip link,
and the failing brand-colour combinations were darkened to `--sky-text`
(ratios recorded in the Sprint 81 commit body). Performance moved for the
usual wobble reasons plus lighter render work — not a measured
optimisation; treat 84/74/98 as the new reference, not a claim.

**Remaining OPEN (brand-demo a11y 96 — pre-existing, surfaced once
contrast/landmark noise cleared):**

1. `label-content-name-mismatch` — the four product cards' accessible
   names don't start with their visible text (badge/label spans inside
   the card). Needs a card-markup decision.
2. `link-in-text-block` — the "Powered by Mirr" footer link is
   distinguished from surrounding text by colour alone.

## Before — 2026-08-18 (live site, pre-Sprint-80-fix deploy)

| Page | Perf | A11y | Best practices | SEO | Weight |
|---|---|---|---|---|---|
| index.html | 72 | 88 | 100 | 100 | 394 KiB |
| brand-demo.html | 73 | 90 | 100 | 100 | 352 KiB |
| founding-brands.html | 93 | 94 | 100 | 100 | 133 KiB |

## index.html accessibility findings (score was 88)

**FIXED in Sprint 80** — `label`: the hero fitting-card mockup's five
readonly example inputs had no associated labels; each now carries an
`aria-label` ("Height — example value" …). Verified locally post-fix:
accessibility 94, label audit passing (a11y-only run against the same
build; expect ~94 live after deploy).

**Recorded OPEN at the time — both fixed in Sprint 81 (see current baseline above):**

1. `color-contrast` — brand-styled elements fail AA contrast: the dark
   announcement band (`.band` and its `em`), the dark hero button
   (`.btn-dark`), and the sky hero stat numbers (`.hero-stat-num`). These
   are brand-colour choices (sky-on-dark / sky-on-page); changing them is a
   design call, not a mechanical fix. Note: Sprint 8's AA pass covered the
   tokens; these hero/band combinations postdate or escaped it.
2. `landmark-one-main` — index.html has no `<main>` landmark. Adding one
   wraps most of the page and touches structure/selectors; do it
   deliberately, then re-run this baseline. brand-demo and founding-brands
   share the same gap (their a11y scores absorb it at 90/94).

## Performance notes (recorded, not in scope to fix)

- index (72) and brand-demo (73) are held down mostly by render-blocking
  Google Fonts CSS and the hero/product Unsplash images (external, not
  size-attributed beyond Sprint 49's work). founding-brands (93) is the
  lightest page and shows what the others can reach.
