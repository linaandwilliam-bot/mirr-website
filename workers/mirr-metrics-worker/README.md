# mirr-metrics-worker

> **SOURCE NOT YET IMPORTED.** The source for this worker exists as a zip
> delivered in William's other Claude (browser) chat — extract it into this
> folder (`src/index.js` + `wrangler.toml`). A search of Downloads,
> Documents and Desktop on this machine (2026-08-12) found no local copy.
> Do not reconstruct the code — import the delivered source.

**What it does:** counts anonymous demo events per brand and serves the
counts back to the brand dashboard. Payloads carry no PII by design —
event name, brand slug, product index, timestamp only (see the beacon
comment in brand-demo.html).

## Endpoints (client-side contract the site already speaks)

- `POST /` — body `{ event, brand, product, at }` where event is
  `tryon-completed` or `buy-clicked` (site sends fire-and-forget,
  silent-fail; example-store buy clicks are deliberately not sent).
- `GET /counts?brand=<slug>` — `{ tryons, buys, demos, samples }`.
  dashboard.html needs numeric `tryons` for the try-on card and BOTH
  numeric `tryons` and `buys` for the LIVE ACTIVITY panel; `demos` and
  `samples` arrive but are not yet displayed.

The site is dormant-safe in both directions: failing beacons and count
fetches are the expected state until this worker answers.

## Secrets (names only — never values, never in this repo)

- Unknown until the source is imported — likely a KV/D1 binding rather
  than a secret. Record binding/secret NAMES here on import.

## Deploy

Once source + `wrangler.toml` are imported into THIS folder:

```
cd workers/mirr-metrics-worker && wrangler deploy
```

**Standing rule (July 2026 incident, DISASTER-RECOVERY.md §4):** wrangler
config lives INSIDE this subfolder only — never at the repo root.
