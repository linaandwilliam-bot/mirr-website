// mirr-brand-setup-worker
//
// Adds a brand to submit-products.html's BRAND_ALLOWLIST by committing the
// change directly to GitHub. The GitHub token lives only here, as a Worker
// secret (GITHUB_TOKEN) — it is never sent to or visible from the browser.
//
// Deploy this as its own Worker (separate from mirr-catalog-worker and the
// outreach-approval Worker). Called from internal/new-brand.html.
//
// Required Worker secrets:
//   GITHUB_TOKEN — a fine-grained PAT scoped to ONLY the mirr-website repo,
//                  with Contents: Read & Write permission. Nothing else.
//   ADMIN_KEY    — a shared secret every request must present in an
//                  X-Admin-Key header. CORS only restricts browsers; without
//                  this, any script could POST here and write to the repo.
//                  The Worker fails closed (503) if this secret is missing.
//
// Required Worker variables (can be plain vars, not secret):
//   GITHUB_OWNER = 'linaandwilliam-bot'
//   GITHUB_REPO  = 'mirr-website'
//   GITHUB_FILE_PATH = 'submit-products.html'   // adjust if it lives in a subfolder
//   GITHUB_BRANCH = 'main'
//
// CORS: locked to https://www.trymirr.com and https://trymirr.com — this
// Worker should only ever be called from the Mirr site itself, not from
// arbitrary origins.

const ALLOWED_ORIGINS = ['https://www.trymirr.com', 'https://trymirr.com'];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, origin);
    }

    // ── Admin authentication ──
    // CORS only restricts browsers — a direct script or curl request ignores
    // it entirely. This endpoint writes to the GitHub repo, so every request
    // must present the shared ADMIN_KEY. Fails closed if the secret is unset.
    if (!env.ADMIN_KEY || !env.ADMIN_KEY.trim()) {
      return json({ ok: false, error: 'Worker not configured: ADMIN_KEY secret is missing.' }, 503, origin);
    }
    // Trim both sides: secrets pasted from terminal output often carry a
    // trailing newline, which would otherwise make every comparison fail.
    if (!timingSafeEqual((request.headers.get('X-Admin-Key') || '').trim(), env.ADMIN_KEY.trim())) {
      return json({ ok: false, error: 'Unauthorized' }, 401, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: 'Invalid JSON body' }, 400, origin);
    }

    const email = (body.email || '').trim().toLowerCase();
    const code = (body.code || '').trim().toUpperCase();
    const brandName = (body.brandName || '').trim();

    if (!email || !code || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, error: 'Valid email and code are required' }, 400, origin);
    }
    // Codes are alphanumeric + hyphens only — reject anything else before it
    // ever touches a GitHub commit.
    if (!/^[A-Z0-9-]{3,40}$/.test(code)) {
      return json({ ok: false, error: 'Code contains invalid characters' }, 400, origin);
    }

    const owner = env.GITHUB_OWNER || 'linaandwilliam-bot';
    const repo = env.GITHUB_REPO || 'mirr-website';
    const path = env.GITHUB_FILE_PATH || 'submit-products.html';
    const branch = env.GITHUB_BRANCH || 'main';

    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const ghHeaders = {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mirr-brand-setup-worker',
    };

    try {
      // 1. Fetch the current file (content + sha) — GitHub requires the sha
      //    of the version you're editing, to prevent silently clobbering a
      //    concurrent change.
      const getResp = await fetch(`${apiBase}?ref=${branch}`, { headers: ghHeaders });
      if (!getResp.ok) {
        const errText = await getResp.text();
        return json({ ok: false, error: `Could not fetch ${path} from GitHub (${getResp.status}): ${errText.slice(0, 200)}` }, 502, origin);
      }
      const fileData = await getResp.json();
      // UTF-8 FIX: atob() alone decodes to Latin-1, but the file is UTF-8 and
      // we re-encode as UTF-8 on commit — plain atob() double-encodes every
      // non-ASCII character (em-dashes, arrows, ticks → mojibake). This
      // exact bug corrupted submit-products.html twice before being fixed.
      // decodeURIComponent(escape(...)) reinterprets the Latin-1 string as
      // UTF-8 bytes, mirroring the btoa(unescape(encodeURIComponent(...)))
      // used for the commit below. Do not "simplify" this back to atob().
      const currentContent = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));

      // 2. Check the brand isn't already in the allowlist (avoid duplicate
      //    lines if this gets called twice for the same brand).
      const newLine = `  '${email}': '${code}',`;
      if (currentContent.includes(`'${email}':`)) {
        return json({ ok: false, error: `${email} is already in the allowlist. Edit it manually if the code needs to change.` }, 409, origin);
      }

      // 3. Insert the new line right after the BRAND_ALLOWLIST opening brace.
      //    This depends on submit-products.html's current structure:
      //      const BRAND_ALLOWLIST = {
      //        // 'brand@example.com': 'ACCESSCODE',
      //      };
      //    If that structure changes, this anchor string needs updating too.
      const anchor = 'const BRAND_ALLOWLIST = {';
      const anchorIndex = currentContent.indexOf(anchor);
      if (anchorIndex === -1) {
        return json({ ok: false, error: 'Could not find BRAND_ALLOWLIST in submit-products.html — has the file structure changed?' }, 500, origin);
      }
      const insertAt = anchorIndex + anchor.length;
      const updatedContent =
        currentContent.slice(0, insertAt) + '\n' + newLine + currentContent.slice(insertAt);

      // 4. Commit the updated file back to GitHub.
      const commitMessage = `Add brand access: ${brandName || email}`;
      const putResp = await fetch(apiBase, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: commitMessage,
          content: btoa(unescape(encodeURIComponent(updatedContent))),
          sha: fileData.sha,
          branch,
        }),
      });

      if (!putResp.ok) {
        const errText = await putResp.text();
        return json({ ok: false, error: `GitHub commit failed (${putResp.status}): ${errText.slice(0, 200)}` }, 502, origin);
      }

      const putData = await putResp.json();
      return json({
        ok: true,
        commitUrl: putData.commit && putData.commit.html_url,
        message: `Added ${email} to the allowlist. Cloudflare will redeploy automatically — give it a minute before the brand tries their code.`,
      }, 200, origin);

    } catch (e) {
      return json({ ok: false, error: 'Unexpected error: ' + (e.message || String(e)) }, 500, origin);
    }
  },
};

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// Constant-time string comparison — avoids leaking key length/prefix
// information through response timing.
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

