# DEPENDENCIES — what Mirr stands on, and what happens if it moves

Internal, not linked from any page. Written 2026-08-21 (Sprint 92) so a
vendor surprise is an inconvenience with a pre-decided response, not a
crisis invented under pressure. Sources: this repo's code and docs, the
founders' unit-economics notes (2026-08), and behaviour observed in real
try-on runs. Nothing here is researched vendor marketing.

---

## 1. What we depend on

| Dependency | What breaks without it | Degrades gracefully today? | Replaceable |
|---|---|---|---|
| **PixelAPI** (try-on rendering) | The try-on image — the feature Mirr demos | **Yes** — the demo falls back to an honest side-by-side preview ("Try-on unavailable right now"), and fit scores are untouched (see §3) | **Hard** — output quality is vendor-specific; see §4 |
| **Cloudflare Workers + D1** | Try-on proxying, catalog submissions, allowlist commits, funnel metrics | **Yes** — demo falls back, submit-products shows its honest error + retry, metrics fail silent by design | **Moderate** — all four workers' source is in `/workers/` (Sprint 89); the platform APIs (KV, D1) are Cloudflare-shaped but small |
| **GitHub Pages + the repo** | The site itself; the two workers that commit to the repo | **No** — the site *is* Pages; an outage is DISASTER-RECOVERY.md territory | **Moderate** — plain static files, any host serves them; the repo is also the data store (brands.json, submissions.json) |
| **IMGBB** (brand photo hosting) | Product images for promoted brands | **Partially** — the example store has inline SVG fallbacks; promoted brands' images have none, so cards would show broken images | **Easy** — any image host; per-photo delete links recorded since Sprint 85 |
| **Formspree** (form delivery) | list-your-brand leads, launch-notify signups, courtesy submission notices, error reports | **Yes** — forms show honest error states with a mailto fallback; the catalog worker (not Formspree) is the authoritative submission pipeline | **Easy** — any form endpoint; IDs are inline in pages |
| **Stripe** (payments, from launch) | Nothing today — checkout is not live (pre-launch) | n/a today | **Moderate** — standard PSP; Rewards and payouts are queued behind Stripe Connect webhooks |

---

## 2. PixelAPI in detail — the load-bearing one

An API key with no contract controls quality, price, terms, and uptime
for the feature Mirr demonstrates. Everything below is what a
replacement would have to match.

### Integration surface (from `workers/mirr-tryon-worker/worker.js` — no need to re-read the code)

- **Submit:** `POST https://api.pixelapi.dev/v1/virtual-tryon`, Bearer
  auth, JSON body:
  `{ person_image: <b64>, garment_image: <b64>, category: 'upperbody'|'lowerbody', n_steps: 20, guidance_scale: 2.5 }`
  → `{ job_id, credits_used }`. The worker converts the garment URL to
  base64 itself (cached in KV, 30-day TTL); person photos are capped at
  ~15MB base64.
- **Poll:** `GET https://api.pixelapi.dev/v1/virtual-tryon/jobs/<job_id>`
  → `{ status, output_url | result_image_url | result_image_b64 }`.
  The site polls every 3s, up to 60 times (180s ceiling); observed
  successful runs completed in ~60–90s.
- **Error semantics the UX depends on:** structured rejection codes
  distinguishing person-photo failures from garment failures —
  `person_image_insufficient_framing`, `person_image_not_found`,
  `person_image_social_ui` (screens/UI in frame), the wider
  `person_image_*` family, and `garment_image_insufficient_framing`.
  brand-demo turns each into a specific, honest shopper message.

### Pricing and what a rise does

As recorded in the founders' unit-economics notes (2026-08; kept outside
this repo — figures quoted in the Sprint 92 spec): **1 credit =
US$0.001, a try-on uses ~11–12 credits**, so:

| | Cost per try-on | 100 try-ons | 1,000 try-ons |
|---|---|---|---|
| Today (1×) | ~US$0.011–0.012 | ~US$1.10–1.20 | ~US$11–12 |
| 5× rise | ~US$0.055–0.060 | ~US$5.50–6.00 | ~US$55–60 |
| 10× rise | ~US$0.11–0.12 | ~US$11–12 | ~US$110–120 |

Read plainly: at demo scale even 10× is pocket money — the risk is not
the demo, it is marketplace scale, where cost per SALE = cost per try-on
× (try-ons per buy). That ratio is exactly what the Sprint 87/90 metrics
funnel now measures; before launch, read it off /metrics rather than
guessing. Free unlimited try-ons at 10× pricing would need a cap;
pre-decided response in §3.

### Observed behaviour (real runs, 2026-07/08 test sessions)

- Rejects props and non-garment images; wants a spread flat-lay on a
  plain background — the same standard how-to-measure#photos asks of
  brands, which is not a coincidence.
- Folded or dark-textured garment sources fail or artefact; dark→light
  garment swaps artefact.
- Lowerbody composites cleanly.
- Person-photo rejections (screens in frame, insufficient framing) are
  common enough that the site pre-flights photos client-side before
  spending a credit (Sprint 72).

### What it does NOT do — judge any replacement against this too

It renders the garment on the shopper **at its design proportions**; it
does not simulate size-specific fit. That is the FIT REALISM principle
baked into the product: the image owns "how it looks", the fit scores
own "how it fits" (the result page says exactly this: "Rendered at the
garment's design proportions — your fit details are below"). A
replacement that claims size-accurate rendering gets judged against the
same honesty bar, not taken at its word.

---

## 3. Contingency — pre-decided

**The reassuring fact first, because it is the load-bearing one: Mirr's
actual differentiator — dimension-based fit scores — does not depend on
PixelAPI at all.** The engine is `/fit-engine.js`, runs entirely in the
shopper's browser from brand-submitted dims, and keeps working through
any PixelAPI event, as do storefronts, the size charts, and sample mode
(a pre-rendered real result, zero API calls).

| Event | Pre-decided response |
|---|---|
| **Outage, hours** | Nothing code-side (RUNBOOK §6): the demo already falls back to an honest side-by-side preview and specific photo rejections keep their messages. Comms decision only: pause anything that drives try-on traffic that day. |
| **Outage, days** | Point demo CTAs at sample mode (a real result, zero API calls) and say plainly that live try-ons are paused. Pause outreach demos; fit scores, storefronts, and submissions continue untouched. |
| **Price rise ~5×** | Absorb (≤US$0.06/try-on) and keep going; start watching try-ons-per-buy on /metrics. |
| **Price rise ~10×+** | Cap free demo try-ons per session client-side, keep the pre-flight strict (it already blocks credit-wasting photos), and re-run the unit economics against the measured funnel before launch commitments. |
| **Terms change** | Check against privacy.html's disclosures (photos sent to PixelAPI in transit only, no retention beyond the session, never used for anything but the requested render). If new terms break any of those sentences, integration pauses until they can be true again — the privacy policy is not the flexible side. |
| **Shutdown / access loss** | The product stays demonstrable (fit scores + sample mode + storefronts); the demo falls back honestly. Begin §4 evaluation the same week. No emergency rewrite: the whole integration surface is one worker (~220 lines) and is documented above. |

---

## 4. Evaluate an alternative — checklist only (do NOT sign up, contact, or trial anyone)

A candidate is worth a trial only if ALL of these hold:

1. Garment-on-person compositing from a **single** person photo (no
   multi-angle capture, no body scan).
2. Garment input by URL or base64 — our garments are hosted images.
3. Async job + poll (or equivalent) that fits the existing worker shape:
   submit → id, poll → status/result. Completion inside ~3 minutes.
4. Per-call pricing we can compute into cost-per-try-on without a sales
   call.
5. Error responses that distinguish person-photo problems from garment
   problems — the shopper-facing honesty of the demo depends on it.
6. A privacy posture the current policy can keep saying truthfully: no
   retention beyond the render, no training on shopper photos, no
   sharing.
7. Judged against §2's limitation honestly: if it claims size-accurate
   rendering, that claim gets verified, not repeated.

Quality bar: run the same fixture garments the site uses today and
compare against known PixelAPI output (sample-result.jpg is a recorded
real result) before any wider test.
