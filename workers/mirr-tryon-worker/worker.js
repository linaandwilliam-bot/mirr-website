/**
 * Mirr Virtual Try-On Worker v10
 * mirr-tryon-worker.linaandwilliam.workers.dev
 *
 * POST /          → fetch+convert garment to b64 (cached in KV), submit to
 *                   PixelAPI, return job_id
 * GET  /status    → single poll of PixelAPI job, return status + result
 * GET  /ping      → health check
 *
 * v10 changes:
 *  - PIXEL_KEY and IMGBB_KEY moved out of source code into Worker secrets
 *    (env.PIXEL_KEY / env.IMGBB_KEY). See setup steps provided separately.
 *    Note: IMGBB_KEY is not currently referenced by any code path below —
 *    it's kept as a secret binding in case imgbb upload logic is added back.
 *  - Garment image base64 is now cached in KV (env.GARMENT_CACHE) instead of
 *    being re-fetched and re-encoded from scratch on every single try-on
 *    request. Garment photos don't change between requests, so this removes
 *    a real, repeated chunk of latency from every "Mirror it" click.
 */

const PIXEL_BASE = 'https://api.pixelapi.dev/v1/virtual-tryon';
const GARMENT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const ALLOWED_ORIGINS = ['https://www.trymirr.com', 'https://trymirr.com'];
function CORS(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
  'Access-Control-Allow-Origin':  allow,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS(origin) });
}

/**
 * Returns the base64-encoded garment image, using the KV cache when
 * available. On a cache miss, fetches the image, encodes it, stores it
 * in KV for next time, and returns it.
 */
async function getGarmentB64(garmentUrl, env) {
  const cacheKey = `garment:${garmentUrl}`;

  if (env.GARMENT_CACHE) {
    try {
      const cached = await env.GARMENT_CACHE.get(cacheKey);
      if (cached) {
        console.log('Garment cache hit:', garmentUrl);
        return cached;
      }
    } catch (e) {
      // KV read failure shouldn't break the request — fall through to a fresh fetch
      console.log('KV read error (continuing without cache):', e.message);
    }
  }

  console.log('Garment cache miss, fetching:', garmentUrl);
  const gRes = await fetch(garmentUrl, { redirect: 'follow' });
  if (!gRes.ok) throw new Error(`Garment fetch ${gRes.status}`);
  const buf = await gRes.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // Use btoa with chunking to avoid stack overflow on large images
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  const garmentB64 = btoa(binary);
  console.log('Garment b64 length:', garmentB64.length);

  if (env.GARMENT_CACHE) {
    try {
      await env.GARMENT_CACHE.put(cacheKey, garmentB64, {
        expirationTtl: GARMENT_CACHE_TTL_SECONDS,
      });
    } catch (e) {
      // Failing to write the cache is not fatal — the request can still proceed
      console.log('KV write error (continuing):', e.message);
    }
  }

  return garmentB64;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    // Request-size guard — reject clearly oversized requests before parsing.
    // Cloudflare's platform cap is not an app-level limit; this fails fast.
    const _cl = request.headers.get('content-length');
    if (_cl && parseInt(_cl, 10) > 15 * 1024 * 1024) {
      return json({ ok: false, error: 'Request too large (max 15MB).' }, 413);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS(origin) });
    }

    const url = new URL(request.url);

    // ── HEALTH CHECK ──
    if (url.pathname === '/ping') {
      return json({ status: 'ok', version: 11 });
    }

    // ── STATUS POLL ── GET /status?job=JOB_ID
    if (url.pathname === '/status') {
      const jobId = url.searchParams.get('job');
      if (!jobId) return json({ error: 'job param required' }, 400);

      try {
        const r = await fetch(`${PIXEL_BASE}/jobs/${jobId}`, {
          headers: { 'Authorization': `Bearer ${env.PIXEL_KEY}` },
        });
        const d = await r.json();
        console.log('Status:', jobId, d.status);

        if (d.status === 'completed') {
          console.log('Result keys:', Object.keys(d).join(', '));
          return json({
            status: 'completed',
            result_url: d.output_url || d.result_image_url || null,
            result_b64: d.result_image_b64 || null,
          });
        }
        return json({ status: d.status || 'processing' });
      } catch (e) {
        return json({ error: 'status check failed', detail: e.message }, 502);
      }
    }

    // ── SUBMIT ── POST /
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body;
    try { body = await request.json(); }
    catch (e) { return json({ error: 'Invalid JSON' }, 400); }

    const { person_image_b64, garment_url, category = 'upperbody' } = body;

    if (!person_image_b64) return json({ error: 'person_image_b64 required' }, 400);
    if (!garment_url)      return json({ error: 'garment_url required' }, 400);

    // 1. Strip data: prefix from person photo
    const personB64 = person_image_b64.includes(',')
      ? person_image_b64.split(',')[1]
      : person_image_b64;

    console.log('Person b64 length:', personB64.length);
    // Category allowlist — category is brand-controlled data (from
    // brands.json's tryon_cat field) forwarded to PixelAPI; do not pass
    // it through unvalidated.
    if (!['upperbody', 'lowerbody'].includes(category)) {
      return json({ ok: false, error: 'Invalid category.' }, 400);
    }
    // person_image_b64 size cap — the client checks dimensions but not
    // byte size, so an oversized photo can otherwise reach PixelAPI
    // unbounded. Base64 inflates ~4/3 over raw bytes.
    if (personB64.length > 15 * 1024 * 1024) {
      return json({ ok: false, error: 'Photo is too large (max ~11MB image).' }, 413);
    }

    // 2. Get garment image as base64 — cached after the first request per garment
    let garmentB64;
    try {
      garmentB64 = await getGarmentB64(garment_url, env);
    } catch (e) {
      return json({ error: 'Garment fetch failed', detail: e.message }, 502);
    }

    // 3. Submit to PixelAPI
    try {
      const payload = {
        person_image: personB64,
        garment_image: garmentB64,
        category: category,
        n_steps: 20,
        guidance_scale: 2.5,
      };

      console.log('Submitting to PixelAPI, category:', category);

      const subRes = await fetch(PIXEL_BASE, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.PIXEL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const subText = await subRes.text();
      console.log('PixelAPI response:', subRes.status, subText.slice(0, 200));

      if (!subRes.ok) {
        return json({
          error: 'PixelAPI submit failed',
          status: subRes.status,
          detail: subText,
        }, 502);
      }

      const subData = JSON.parse(subText);
      console.log('Job created:', subData.job_id, '| Credits:', subData.credits_used);

      return json({
        success: true,
        job_id: subData.job_id,
        credits_used: subData.credits_used,
      });

    } catch (e) {
      return json({ error: 'PixelAPI error', detail: e.message }, 502);
    }
  },
};
