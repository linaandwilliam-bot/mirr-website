# RUNBOOK — brand onboarding, go-live, rollback, outages

Operational runbook for taking a brand from "yes" to live on trymirr.com, written
against the code as it exists today. Repo-internal; not linked from any page.
No secrets, no access codes, no real brand emails in this file — secret **names**
only (the same rule as DISASTER-RECOVERY.md, which covers hosting incidents).

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
   as `mirr_admin_key`; a 401 clears it and re-prompts). The worker commits the
   entry into `BRAND_ALLOWLIST` in submit-products.html on `main`. **Wait 1–2
   minutes for Pages to redeploy before the brand tries the code.**
   - If the worker call fails, the tool shows a manual-fallback snippet: paste
     that exact line into `BRAND_ALLOWLIST` yourself and click "I'VE ADDED IT
     MANUALLY". This is the *only* sanctioned hand edit of the allowlist.
6. **SEND THIS EMAIL** (unlocked only after step 5). Note the plumbing:
   Formspree cannot email arbitrary addresses, so this delivers the welcome
   email to **our own inbox (hello@trymirr.com)** — you then forward it to the
   brand, or use "OPEN IN MY MAIL APP" to send it directly. The email contains
   the /submit-products link, their code, dims/photo requirements, and the
   dashboard links.
7. Also send the brand **`/how-to-measure#garments`** — the measuring +
   photo-standards guide. (The generated welcome email predates the guide and
   does not include this link yet — see FOUND WHILE DOCUMENTING.)

---

## 2. A SUBMISSION ARRIVES

What happens without you: the brand passes the submit-products gate (email +
code checked client-side against `BRAND_ALLOWLIST` — a "keep honest people
out" gate, not security), fills in products, passes the photo pre-flight
(hard fails: wrong type / >10MB / under 800×1000px / aspect beyond 3:1; soft
warnings for dark or cluttered backgrounds), confirms the photo-standards
checkboxes, and submits. The page then:

1. Uploads photos to **IMGBB** (inline key — same not-real-security model).
2. POSTs `{brand_name, brand_email, products}` to
   **`mirr-catalog-worker` `/submit`** — the authoritative pipeline record.
   The worker **commits the submission into `submissions.json` on `main`**
   (a real commit; this is why you pull before hand edits) and returns a
   reference (`ref`), which the brand sees on their success screen. If this
   call fails the brand gets an honest error screen with retry — the
   submission did NOT enter the pipeline.
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

## FOUND WHILE DOCUMENTING (not fixed in this sprint)

1. **Welcome email doesn't link the measuring guide.** new-brand.html's
   generated email predates Sprint 67's /how-to-measure and still explains
   dims/photos inline without linking `#garments` — §1 step 7 papers over
   this manually. Fix: add the link to the email template.
2. **The go-live confirmation email is promised but its trigger is
   unverifiable from this repo.** submit-products.html tells brands "We'll
   email you to confirm when each product is available", and a code comment
   says the catalog worker sends it when a submission is marked live — but
   the status flip is a manual GitHub edit, and whether the worker actually
   detects that flip (webhook? poll?) can't be confirmed from client code.
   Verify in the worker; if no mechanism exists, the promise is unbacked and
   either the worker or the copy must change.
3. **Nothing guards `buy_url` before go-live.** promote-submission writes
   `buy_url: null` and verify.mjs doesn't require it, so a brand can ship
   with a BUY button that only shows a toast. The runbook makes it a manual
   gate (§3 step 2); a verify.mjs warning for live brands with null buy_urls
   would make it structural.
4. **`founding-count.json` can drift from reality.** It's hand-maintained
   and verify.mjs only checks `filled <= total` — nothing ties `filled` to
   the actual number of founding-tier brands in brands.json.
