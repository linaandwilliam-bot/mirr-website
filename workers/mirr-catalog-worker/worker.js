// mirr-catalog-worker
//
// Receives product-catalog submissions from submit-products.html and commits
// them to submissions.json in the mirr-website repo. This is the authoritative
// pipeline record: submitted → reviewing → live. There is no automated email
// or dashboard yet — William/Lina move a submission through those states by
// hand-editing submissions.json on GitHub, the same way founding-count.json
// and BRAND_ALLOWLIST are hand-maintained elsewhere in this project.
//
// No admin-key gate: any visitor who reaches submit-products.html and passes
// its client-side allowlist check can call this. That matches the existing
// security model for that page (explicitly "keep honest people out" only,
// not real security) and mirrors mirr-tryon-worker, which also has no auth
// token — just CORS locked to the site's own origins.
//
// Required Worker secret:
//   GITHUB_TOKEN — a fine-grained PAT scoped to ONLY the mirr-website repo,
//                  with Contents: Read & Write permission. Each Worker has
//                  its own secrets even on the same Cloudflare account, so
//                  this must be set here even if the same token value is
//                  already used by mirr-brand-setup-worker.
//
// Required Worker variables (plain vars, not secrets):
//   GITHUB_OWNER = 'linaandwilliam-bot'
//   GITHUB_REPO  = 'mirr-website'
//   GITHUB_BRANCH = 'main'

const ALLOWED_ORIGINS = ['https://www.trymirr.com', 'https://trymirr.com'];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// Short, human-readable reference the brand can quote in support emails.
// Not cryptographically unique — collision risk is negligible at this scale
// and a clash would just overwrite an entry, visible immediately on review.
function makeRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return 'MIRR-' + stamp + '-' + rand;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/submit') {
      return json({ ok: false, error: 'Not found' }, 404, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: 'Invalid JSON body' }, 400, origin);
    }

    const brandName = (body.brand_name || '').trim();
    const brandEmail = (body.brand_email || '').trim().toLowerCase();
    const products = Array.isArray(body.products) ? body.products : null;

    if (!brandName || !brandEmail || !products || products.length === 0) {
      return json({ ok: false, error: 'brand_name, brand_email, and at least one product are required' }, 400, origin);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brandEmail)) {
      return json({ ok: false, error: 'brand_email is not a valid address' }, 400, origin);
    }

    const owner = env.GITHUB_OWNER || 'linaandwilliam-bot';
    const repo = env.GITHUB_REPO || 'mirr-website';
    const branch = env.GITHUB_BRANCH || 'main';
    const path = 'submissions.json';

    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const ghHeaders = {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mirr-catalog-worker',
    };

    const ref = makeRef();
    const newEntry = {
      ref,
      brand_name: brandName,
      brand_email: brandEmail,
      status: 'submitted', // submitted -> reviewing -> live (hand-edited on GitHub)
      submitted_at: new Date().toISOString(),
      products,
    };

    try {
      // 1. Fetch the current file, if it exists. A 404 here means this is
      //    the very first submission ever — that's expected, not an error.
      const getResp = await fetch(`${apiBase}?ref=${branch}`, { headers: ghHeaders });

      let submissions = [];
      let sha = undefined;

      if (getResp.status === 404) {
        // First submission — file will be created fresh below.
      } else if (!getResp.ok) {
        const errText = await getResp.text();
        return json({ ok: false, error: `Could not read submissions.json (${getResp.status}): ${errText.slice(0, 200)}` }, 502, origin);
      } else {
        const fileData = await getResp.json();
        sha = fileData.sha;
        // UTF-8 FIX: see mirr-brand-setup-worker for why plain atob() is
        // wrong here — it double-encodes non-ASCII characters (product
        // descriptions are exactly the kind of free-text field where this
        // bites). decodeURIComponent(escape(...)) reinterprets the Latin-1
        // decode as UTF-8 bytes correctly.
        const currentContent = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));
        try {
          submissions = JSON.parse(currentContent);
          if (!Array.isArray(submissions)) submissions = [];
        } catch (e) {
          return json({ ok: false, error: 'submissions.json exists but is not valid JSON — needs manual repair before new submissions can be accepted' }, 500, origin);
        }
      }

      submissions.push(newEntry);

      const updatedContent = JSON.stringify(submissions, null, 2);
      const commitMessage = `New product submission: ${brandName} (${products.length} product${products.length === 1 ? '' : 's'}) — ${ref}`;

      const putBody = {
        message: commitMessage,
        // Mirrors the encode side of the UTF-8 fix above.
        content: btoa(unescape(encodeURIComponent(updatedContent))),
        branch,
      };
      if (sha) putBody.sha = sha;

      const putResp = await fetch(apiBase, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
      });

      if (!putResp.ok) {
        const errText = await putResp.text();
        return json({ ok: false, error: `GitHub commit failed (${putResp.status}): ${errText.slice(0, 200)}` }, 502, origin);
      }

      return json({ ok: true, ref }, 200, origin);

    } catch (e) {
      return json({ ok: false, error: 'Unexpected error: ' + (e.message || String(e)) }, 500, origin);
    }
  },
};
