// mirr-metrics-worker — anonymous event counts for Mirr.
//
// Contract (already shipped in the site — do NOT change without a site sprint):
//   POST /                       {event, brand, product, at}  <- brand-demo sendMetric()
//   GET  /counts?brand=<slug>    -> {tryons, buys, demos, samples}  <- dashboard.html
//   GET  /stats                  (X-Admin-Key required) -> full daily breakdown
//
// Privacy: stores ONLY aggregate counters keyed by brand/event/day.
// No IPs, no user agents, no measurements, no photos, no emails. The beacon
// payload is anonymous by design (Sprint 58) and this worker keeps it that
// way - "at" and "product" are accepted but only the UTC day is kept.
//
// Storage: Cloudflare D1 (binding DB, database mirr-metrics), table:
//   CREATE TABLE IF NOT EXISTS counts (brand TEXT NOT NULL, event TEXT NOT NULL,
//     day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
//     PRIMARY KEY (brand, event, day));
// D1 rather than a Durable Object because the Cloudflare dashboard can create
// and bind D1 without a wrangler migration; the upsert below is atomic.

const ALLOWED_ORIGINS = new Set([
  'https://www.trymirr.com',
  'https://trymirr.com',
]);

const ALLOWED_EVENTS = new Set([
  'demo-started',
  'tryon-completed',
  'tryon-failed',
  'buy-clicked',
  'sample-viewed',
]);

const BRAND_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

function cors(origin) {
  const o = ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.trymirr.com';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}),
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = cors(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const adminOk = env.ADMIN_KEY &&
      request.headers.get('X-Admin-Key') === env.ADMIN_KEY;

    // ── Ingest ──
    if (request.method === 'POST' && url.pathname === '/') {
      // Browser beacons must come from the site; the admin key opens a side
      // door for verification/testing without an Origin header.
      if (!ALLOWED_ORIGINS.has(origin) && !adminOk) {
        return json({ error: 'origin not allowed' }, 403, corsHeaders);
      }
      let body;
      try {
        const raw = await request.text();
        if (raw.length > 512) throw new Error('too large');
        body = JSON.parse(raw);
      } catch (e) {
        return json({ error: 'bad payload' }, 400, corsHeaders);
      }
      const event = String(body.event || '');
      const brand = String(body.brand || '');
      if (!ALLOWED_EVENTS.has(event)) return json({ error: 'unknown event' }, 400, corsHeaders);
      if (!BRAND_RE.test(brand)) return json({ error: 'bad brand' }, 400, corsHeaders);

      const day = new Date().toISOString().slice(0, 10);
      await env.DB.prepare(
        'INSERT INTO counts (brand, event, day, n) VALUES (?, ?, ?, 1) ' +
        'ON CONFLICT(brand, event, day) DO UPDATE SET n = n + 1'
      ).bind(brand, event, day).run();

      return json({ ok: true }, 200, corsHeaders);
    }

    // ── Dashboard read (public aggregate) ──
    if (request.method === 'GET' && url.pathname === '/counts') {
      const brand = url.searchParams.get('brand') || '';
      if (!BRAND_RE.test(brand)) return json({ error: 'bad brand' }, 400, corsHeaders);
      const { results } = await env.DB.prepare(
        'SELECT event, SUM(n) AS total FROM counts WHERE brand = ? GROUP BY event'
      ).bind(brand).all();
      const by = {};
      for (const r of (results || [])) by[r.event] = Number(r.total) || 0;
      return json({
        tryons: by['tryon-completed'] || 0,
        buys: by['buy-clicked'] || 0,
        demos: by['demo-started'] || 0,
        samples: by['sample-viewed'] || 0,
      }, 200, Object.assign({ 'Cache-Control': 'public, max-age=60' }, corsHeaders));
    }

    // ── Founder read (everything, admin key required) ──
    if (request.method === 'GET' && url.pathname === '/stats') {
      if (!adminOk) return json({ error: 'admin key required' }, 401, corsHeaders);
      const { results } = await env.DB.prepare(
        'SELECT brand, event, day, n FROM counts ORDER BY day DESC, brand, event'
      ).all();
      const totals = {};
      for (const r of (results || [])) {
        totals[r.brand] = totals[r.brand] || {};
        totals[r.brand][r.event] = (totals[r.brand][r.event] || 0) + r.n;
      }
      return json({ totals, daily: results || [] }, 200, corsHeaders);
    }

    return json({ ok: true, service: 'mirr-metrics-worker' }, 200, corsHeaders);
  },
};
