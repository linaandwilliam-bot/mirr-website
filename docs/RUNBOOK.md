# RUNBOOK — brand onboarding, go-live, rollback, outages

Operational runbook for taking a brand from "yes" to live on trymirr.com, written
against the code as it exists today. Repo-internal; not linked from any page.
No secrets, no access codes, no real brand emails in this file — secret **names**
only (the same rule as DISASTER-RECOVERY.md, which covers hosting incidents).

**Rehearsed end to end 2026-08-19 (Sprint 83)** with a fixture brand: every step
below was executed once for real (including a live catalog-worker submission,
promotion, and render checks). Timings in the checklist are measured, not guessed.

---

## FIRST-BRAND CHECKLIST — the exact sequence with a real brand on the phone

Total hands-on time excluding the brand's own form-filling: ~15 minutes.

1. **Before the call:** have the ADMIN_KEY at hand (it's the secret set on
   mirr-brand-setup-worker — Cloudflare never shows secret values again, so it
   must come from your password store; if it's lost, use the manual fallback in
   §1 step 5 or set a new secret on the worker). `git pull` your clone.
2. Open `/new-brand`. Fill brand name, contact email, tier. Tick the three
   verification checks (ABN, web presence, Stripe-KYC acknowledgment) — GENERATE
   stays disabled until all three.
3. GENERATE CODE + EMAIL. Then ADD TO GITHUB (enter ADMIN_KEY when prompted;
   a 401 means wrong key — it re-prompts). If the worker call fails, paste the
   shown one-line snippet into `BRAND_ALLOWLIST` in submit-products.html
   yourself, push, and click "I'VE ADDED IT MANUALLY".
4. **Wait for the deploy, then PROVE the code works before sending it:**
   ~60–90 s after the commit, open trymirr.com/submit-products yourself and
   enter the brand's email + code. Seeing the product form = safe to send.
   (Measured: entry live and gate passing in under 2 minutes.)
5. SEND THIS EMAIL (delivers to hello@trymirr.com — forward it), or use
   "OPEN IN MY MAIL APP". The email includes the measuring-guide links and the
   3-business-day promise. Tell the brand on the phone: photos (≥800×1000 px,
   flat-lay, light background), a **short description per product** (required),
   dims of the smallest stocked size, prices, sizes.
6. The brand submits. **This only works on trymirr.com** — the catalog worker's
   CORS rejects every other origin, so never try to test a submission from
   localhost. Success shows a `MIRR-…` reference and the submission lands as a
   commit on `main` within seconds (measured: ~7 s click-to-commit).
7. `git pull`, open `/submissions-review`, check photos + dims against
   `/how-to-measure#photos`. Flip status to `reviewing` (hand edit, push).
8. `node scripts/promote-submission.mjs <ref>` (dry run) — read the review
   notes. Then `--write`. (Measured: instant; the printed diff is the whole
   file both ways — scan for the `rehearsal`/brand slug block, see FOUND #7.)
9. Fill the human fields in brands.json: `location`, `description`, `tags`,
   `store_url`, per-product `buy_url` (get real product URLs from the brand —
   verify.mjs warns until they exist), `fit` (judgment call, §3 step 5),
   `tier` if founding, `verified: true` only if §1 checks are truly done, and
   resolve the sample-size note (re-measure middle size or set `sample_size`
   to the smallest stocked size).
10. Flip the submission's status to `live`. If founding: `founding-count.json`
    `filled` +1.
11. `node scripts/check-links.mjs && node scripts/verify.mjs` — green AND
    zero warnings. Push.
12. §4 verify on the live site: storefront header (no EXAMPLE STORE badge, no
    empty rating), MEASURED ✓ badges, size chart matches dims at sample size,
    BUY opens the real product page with `utm_source=mirr`, dashboard payout %
    matches tier, `/brands` lists the brand.
13. Email the brand that they're live (the promised confirmation email — its
    automated trigger is still unverified, FOUND #2, so send it yourself).

House rules that apply everywhere below:

- **Machine-managed, never hand-edit:** `BRAND_ALLOWLIST` (in submit-products.html)
  and the *structure* of `submissions.json`. Two sanctioned exceptions:
  the manual-fallback flow new-brand.html itself offers for the allowlist, and
  flipping a submission's `status` field by hand.
- **Human-managed:** `brands.json`, `founding-count.json` — but always run
  `node scripts/verify.mjs` after editing; it enforces their schemas.
- **Push = deploy.** GitHub Pages serves `main` directly; every push is live in
  ~1 minute. `git pull` before any hand edit — the catalog worker commits to
  `main` too, and a stale clone will hit a push rejection (fetch-first).

---

## 1. ONBOARD A BRAND

Brand has agreed (via the list-your-brand form or directly). You need their
brand name and contact email.

1. Open **`/new-brand`** (internal tool, noindex, not in nav).
2. Fill brand name, contact email, tier (Founding 8% / Standard 12%; optional
   Premium placement at 15%).
3. Tick all three verification checks — the GENERATE button stays disabled
   until you do, deliberately:
   - ABN or local business registration verified (Australian brands:
     abr.business.gov.au).
   - Website/social presence confirmed real and active.
   - Acknowledge Stripe Connect KYC will verify banking before any payout.
4. **GENERATE CODE + EMAIL** — produces the access code (brand-name prefix +
   dash + 4 characters, e.g. `APEXACTI-7K2M`; the submit-products gate enforces
   `LETTERS-XXXX` shape) and the welcome-email preview.
5. **ADD TO GITHUB** — POSTs `{email, code, brandName}` to
   `mirr-brand-setup-worker` with the admin key (`X-Admin-Key`; the worker's
   `ADMIN_KEY` secret — prompted once, then kept in your browser's localStorage
   as `mirr_admin_key`; a 401 clears it and re-prompts). Cloudflare cannot show
   you a secret's value after it's set, so the key must come from your own
   password store — if it's lost, either use the manual fallback below or set a
   new `ADMIN_KEY` on the worker. (Rehearsal-verified: the worker is deployed
   and 401s bad keys.) The worker commits the
   entry into `BRAND_ALLOWLIST` in submit-products.html on `main`. **Wait 1–2
   minutes for Pages to redeploy, then prove the code works by passing the
   submit-products gate yourself before the brand tries it** (measured
   2026-08-19: entry live in under 2 minutes).
   - If the worker call fails, the tool shows a manual-fallback snippet: paste
     that exact line into `BRAND_ALLOWLIST` yourself and click "I'VE ADDED IT
     MANUALLY". This is the *only* sanctioned hand edit of the allowlist.
6. **SEND THIS EMAIL** (unlocked only after step 5). Note the plumbing:
   Formspree cannot email arbitrary addresses, so this delivers the welcome
   email to **our own inbox (hello@trymirr.com)** — you then forward it to the
   brand, or use "OPEN IN MY MAIL APP" to send it directly. The email contains
   the /submit-products link, their code, dims/photo requirements, and the
   dashboard links.
7. The generated welcome email links **`/how-to-measure#garments`** and
   `#photos` (added in Sprint 71) and lists what to prepare, including the
   required short description per product (added in Sprint 83).

---

## 2. A SUBMISSION ARRIVES

What happens without you: the brand passes the submit-products gate (email +
code checked client-side against `BRAND_ALLOWLIST` — a "keep honest people
out" gate, not security), fills in products (name, category, price, and a
short **description** are required per product — validation blocks submission
without them), passes the photo pre-flight
(hard fails: wrong type / >10MB / under 800×1000px / aspect beyond 3:1; soft
warnings for dark or cluttered backgrounds), confirms the photo-standards
checkboxes, and submits. **The submission only works from trymirr.com — the
catalog worker's CORS policy rejects every other origin (rehearsal-verified),
so localhost tests always fail at the final step, after photos have already
uploaded.** The page then:

1. Uploads photos to **IMGBB** (inline key — same not-real-security model).
2. POSTs `{brand_name, brand_email, products}` to
   **`mirr-catalog-worker` `/submit`** — the authoritative pipeline record.
   The worker **commits the submission into `submissions.json` on `main`**
   (a real commit; this is why you pull before hand edits) and returns a
   reference (`ref`), which the brand sees on their success screen. Measured
   2026-08-19: click-to-success ~7 s, with the commit on `main` in the same
   window. If this
   call fails the brand gets an honest error screen with retry — the
   submission did NOT enter the pipeline. Note the photos DID already reach
   IMGBB in that case, and a retry uploads them again. Since Sprint 85 every
   successful submission records per-photo deletion links
   (`front_delete_url` / `back_delete_url` on each product in
   submissions.json — opening the link in a browser deletes that image;
   nothing deletes automatically). Images stranded by a FAILED attempt
   still lose their links and need the IMGBB dashboard (FOUND #6).
3. Fires a **courtesy Formspree notification** to the inbox with the full
   product JSON — non-blocking, informational only; `submissions.json` is the
   source of truth.

Your steps:

1. Open **`/submissions-review`** (internal, noindex, read-only). Newest
   first, `submitted` grouped to the top. Expand each product: fields, dims,
   photos.
2. Statuses mean: **`submitted`** = new, untouched; **`reviewing`** = a human
   is on it; **`live`** = promoted into brands.json and visible to shoppers.
3. The **only** permitted manual edit of `submissions.json` is flipping
   `status` (edit the file on GitHub or locally, push). Flip to `reviewing`
   when you start. Never edit any other field or the array structure.
4. Review against `/how-to-measure#photos` standards. If photos or dims are
   unusable, email the brand (reply to the courtesy notification) — there is
   no in-product rejection flow.

---

## 3. GO LIVE

1. `git pull` (worker commits land on `main`).
2. **Dry run first — it never writes:**
   `node scripts/promote-submission.mjs <ref>`
   Read the printed diff and the review notes. The two notes that always
   matter:
   - **`buy_url` is always missing** — submissions don't collect it. The BUY
     button falls back to the brand's `store_url`, or shows "Store link not
     available yet" if neither exists. Get real product URLs from the brand
     and fill `buy_url` per product in brands.json **before** announcing.
   - **Dims measure the smallest stocked size, but `sample_size` is set to
     the range's middle.** The fit engine reads dims as the sample size's
     measurements, so scores shift by the grading offset between the two.
     Fix one side before going live: either get the middle size re-measured,
     or set `sample_size` to the smallest stocked size.
3. Apply: `node scripts/promote-submission.mjs <ref> --write`
   (`--force` only if deliberately overwriting an existing product of the
   same name). The script validates against verify.mjs's schema rules and
   refuses to write anything invalid.
4. Complete the human fields in `brands.json` (the scaffold leaves them
   honest-but-empty): `location`, `description`, `tags`, `store_url`,
   `buy_url` per product, `tier` if founding, and `verified: true` only once
   the §1 checks are truly done.
5. **Fit band is a human judgment call** — the script leaves `fit` unset
   (engine defaults to `regular`). Rule of thumb: `compression` = meant to
   hug with negative ease (compression activewear, swim), `fitted` = cut
   close to the body (tailored shirts, slim fits), `regular` = standard cut
   (the default — when unsure, leave unset), `relaxed` = oversized/boxy by
   design.
6. Flip the submission's `status` to `live` by hand (§2 rule). The
   submit-products success copy promises a confirmation email at this point —
   the client code says the catalog worker triggers it when a submission is
   marked live; that mechanism lives in the worker (see FOUND WHILE
   DOCUMENTING and verify it fires).
7. If a **founding** brand: update `founding-count.json` (`filled` +1;
   verify.mjs enforces `filled <= total`).
8. `node scripts/check-links.mjs && node scripts/verify.mjs` — both green.
9. Push. Live in ~1 minute.

---

## 4. VERIFY LIVE (after every go-live)

On https://www.trymirr.com (not localhost):

1. `/brand-demo?brand=<slug>` — header (name, initials, location, tags)
   renders; every product card appears; **MEASURED ✓** badge on every product
   that has dims (and on none that don't).
2. Open a dims product: SIZE CHART values match the submitted dims at the
   sample size; run the fit panel with default measurements — scores plausible
   (no 40s across the board, no impossible 97s on everything).
3. **BUY** opens the brand's real product page in a new tab with
   `utm_source=mirr&utm_medium=tryonresult` appended.
4. `/dashboard?brand=<slug>` — products listed LIVE, payout % matches tier.
5. `/brands` directory shows the brand.
6. If founding: founding-brands.html spot counter reflects the new
   `founding-count.json`.

---

## 5. ROLLBACK (pull a product or brand back out)

1. `git pull` first, always.
2. **One product:** delete its object from the brand's `products` array in
   `brands.json` and set `products_count` to the new array length (verify.mjs
   fails on mismatch). A live brand must keep ≥1 product with name + price —
   if this was the last product, remove the whole brand instead.
3. **Whole brand:** delete the brand's key from `brands.json`. If founding,
   decrement `founding-count.json`'s `filled`.
4. **Revoke submission access too?** The allowlist entry is worker-managed —
   ask the brand-setup worker path to remove it, or as a last resort use the
   same manual-fallback convention as §1 step 5 (delete their one line).
5. Do NOT touch `submissions.json` beyond (optionally) flipping the
   submission's status back to `reviewing` — the historical record stays.
6. Run both check scripts, push. `?brand=<slug>` URLs fall back to
   apex-active by design, so dead links degrade safely; no sitemap change
   (brand storefronts are query params, not pages).

---

## 6. OUTAGES

**PixelAPI (try-on) down** — shoppers still get a working page: the demo
falls back honestly to a side-by-side preview ("⚠ Try-on unavailable right
now. Showing side-by-side preview."), photo-specific rejections keep their
specific messages, and fit scores still work fully (they're computed
client-side from measurements + dims, no API involved). **Nothing to do
code-side.** It's a comms decision only: whether to tell brands/shoppers, and
whether to pause any announcement that drives try-on traffic.

**Worker endpoints and their secrets (names only)** — full table in
DISASTER-RECOVERY.md §2:

- `mirr-tryon-worker` — PixelAPI credentials.
- `mirr-brand-setup-worker` — `ADMIN_KEY`, `GITHUB_TOKEN`.
- `mirr-catalog-worker` — see the worker's own config.
- `mirr-metrics-worker` — not yet deployed; site beacons/counters are
  dormant-safe by design (failing metrics fetches are the expected state, not
  a bug).

**Site itself down or stale** — that's a hosting incident, not an onboarding
one: follow DISASTER-RECOVERY.md §4 (Pages build status → marker probe → DNS
→ rogue Worker routes). Standing rule from the July 2026 incident: never let
Cloudflare "connect" or auto-deploy this repo.

---

## FOUND WHILE DOCUMENTING

Fixed since first recorded: **#1** (welcome email now links the measuring
guide — Sprint 71), **#3** (verify.mjs warns on live brands with null
buy_url — Sprint 71), **#4** (verify.mjs warns on founding-count drift,
excluding `example: true` brands — Sprint 71). Fixed by the Sprint 83
rehearsal itself: the unconditional EXAMPLE STORE badge and the empty
RATING stat on brand-demo headers, and the welcome email's prep list
missing the required per-product description.

Still open:

2. **The go-live confirmation email is promised but its trigger is
   unverifiable from this repo.** submit-products.html tells brands "We'll
   email you to confirm when each product is available", and a code comment
   says the catalog worker sends it when a submission is marked live — but
   the status flip is a manual GitHub edit, and whether the worker actually
   detects that flip (webhook? poll?) can't be confirmed from client code.
   Until verified in the worker, SEND THE GO-LIVE EMAIL YOURSELF
   (first-brand checklist step 13).
5. ~~Stocked sizes are collected, then dropped.~~ **FIXED in Sprint 84:**
   promote-submission now carries `sizes_in_stock` into brands.json as a
   `sizes` array (XS–XL only; larger sizes are dropped with a review note),
   the detail page's size row and the fit-across-sizes strip render only
   stocked sizes, and recommendSize takes an allowed-sizes pool — the
   recommendation names the best AVAILABLE size with its consequence, and
   says so plainly when no stocked size fits closely. Products without a
   `sizes` array (the example store) behave exactly as before.
6. **IMGBB uploads are unmanaged.** (Sprint 83 rehearsal; PARTIALLY FIXED
   in Sprint 85.) Successful submissions now record a deletion link per
   photo — `front_delete_url` / `back_delete_url` on each product in
   submissions.json; opening the link in a browser deletes that image, and
   nothing deletes automatically (deliberate — deletion tooling is a later
   decision). Still open: a FAILED attempt's uploads lose their links when
   the brand leaves the page (retry re-uploads), so those orphans still
   need the IMGBB account dashboard. Whether the catalog worker passes the
   new fields through into submissions.json is passthrough-by-observation
   (the S83 submission mirrored the payload exactly) — confirm on the next
   real submission. The 2026-08-19 rehearsal's four fixture images (all
   watermarked "REHEARSAL FIXTURE — NOT A REAL PRODUCT") predate the fix —
   delete them from the dashboard when convenient.
7. **promote-submission's dry-run "diff" prints the entire brands.json
   twice** (before and after) instead of just the touched brand — with the
   example brand's inline base64 SVGs that's hundreds of unreadable lines.
   Scope the printed diff to the promoted brand's block.
8. **`/submissions-review` and status flips assume repo access.** Flipping
   status is "edit the file on GitHub or locally, push" — fine for us, but
   the rehearsal confirms there is no tooling guard against typos in the
   status value (verify.mjs does validate status against the allowed set,
   so run it after every flip).
