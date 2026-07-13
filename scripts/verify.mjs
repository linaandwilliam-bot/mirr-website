#!/usr/bin/env node
// verify.mjs — companion to check-links.mjs. Codifies the site's structural
// invariants so any session can check them in one command:
//
//   node scripts/verify.mjs
//
// Exits non-zero with a list of failures. Zero dependencies, no network.

import { readdirSync, readFileSync, existsSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (msg) => failures.push(msg);
const read = (f) => readFileSync(join(root, f), 'utf8');

// ── tokens.css defines the design tokens every page depends on ──
if (!existsSync(join(root, 'tokens.css'))) {
  fail('tokens.css is missing');
} else {
  const tokens = read('tokens.css');
  for (const t of ['--sky', '--ink3', '--ink4', '--sky-text', '--rose-text', '--rose-dark']) {
    if (!new RegExp(`${t}\\s*:`).test(tokens)) fail(`tokens.css: ${t} is not defined`);
  }
}

// ── nav.js defines both nav variants ──
if (!existsSync(join(root, 'nav.js'))) {
  fail('nav.js is missing');
} else {
  const nav = read('nav.js');
  if (!/back:\s*'/.test(nav)) fail('nav.js: back nav variant is not defined');
  if (!/home:\s*'/.test(nav)) fail('nav.js: home nav variant is not defined');
}

// ── brands.json: valid, at least one brand with products ──
try {
  const brands = JSON.parse(read('brands.json'));
  const slugs = Object.keys(brands);
  if (slugs.length === 0) fail('brands.json: no brands defined');
  if (!slugs.some((s) => Array.isArray(brands[s].products) && brands[s].products.length > 0)) {
    fail('brands.json: no brand has any products');
  }
} catch (e) {
  fail(`brands.json: ${e.message}`);
}

// ── founding-count.json: valid, filled <= total ──
try {
  const fc = JSON.parse(read('founding-count.json'));
  if (typeof fc.filled !== 'number' || typeof fc.total !== 'number') {
    fail('founding-count.json: filled/total must be numbers');
  } else if (fc.filled > fc.total) {
    fail(`founding-count.json: filled (${fc.filled}) exceeds total (${fc.total})`);
  }
} catch (e) {
  fail(`founding-count.json: ${e.message}`);
}

// ── Per-page checks ──
const BEACON = 'static.cloudflareinsights.com/beacon.min.js';
// new-brand.html is an internal noindex tool with deliberately no site nav —
// just the INTERNAL TOOL banner.
const NAV_EXEMPT = new Set(['new-brand.html']);

const htmlFiles = readdirSync(root).filter((f) => f.endsWith('.html'));
for (const f of htmlFiles) {
  const html = read(f);

  if (!html.includes('href="/tokens.css"')) fail(`${f}: does not link /tokens.css`);

  const hasNav = html.includes('id="nav"') || html.includes('class="mbar"') || html.includes('<nav');
  if (!hasNav && !NAV_EXEMPT.has(f)) fail(`${f}: no nav found (expected <div id="nav">, .mbar, or <nav>)`);

  const beaconCount = html.split(BEACON).length - 1;
  if (beaconCount !== 1) fail(`${f}: Cloudflare Analytics beacon appears ${beaconCount} times (expected exactly 1)`);
}

// ── brand-demo.html try-on flow regression guard ──
{
  const bd = read('brand-demo.html');
  for (const anchor of ['validatePhoto', 'startLoadingUX', 'stopLoadingUX', 'buildErrorNote', 'person_image_social_ui']) {
    if (!bd.includes(anchor)) fail(`brand-demo.html: try-on flow anchor "${anchor}" is missing`);
  }
}

// ── submit-products.html BRAND_ALLOWLIST anchor: structure intact ──
{
  const sp = read('submit-products.html');
  if (!/const BRAND_ALLOWLIST = \{[\s\S]*?\};/.test(sp)) {
    fail('submit-products.html: BRAND_ALLOWLIST block structure not found (const BRAND_ALLOWLIST = { ... };)');
  }
}

// ── Commitment consistency: business-day promises must agree per class ──
// Guards against the Sprint 18 regression class: a promise changing in some
// places but not others. Every "N business days" mention is classified by
// its surrounding text as either a PAYOUT promise or a SERVICE promise
// (contact response / go-live / account verification, which move together).
// Each class must use a single value site-wide; an unclassifiable mention
// fails so new phrasings get added to the classifier deliberately.
{
  const classify = (ctx) => {
    const c = ctx.toLowerCase();
    if (/payout|transferred to|transfers to/.test(c)) return 'payout';
    if (/in touch|reach out|in contact|live|approval|review|verified|appear/.test(c)) return 'service';
    return null;
  };
  const seen = { payout: new Map(), service: new Map() };
  for (const f of htmlFiles) {
    const html = read(f);
    for (const m of html.matchAll(/(\d+)\s*business days/gi)) {
      const ctx = html.slice(Math.max(0, m.index - 170), m.index + 40);
      const cls = classify(ctx);
      if (!cls) {
        fail(`${f}: unclassifiable "business days" mention — add its context to verify.mjs's classifier: "...${ctx.slice(-70).replace(/\s+/g, ' ').trim()}"`);
        continue;
      }
      const files = seen[cls].get(m[1]) || new Set();
      files.add(f);
      seen[cls].set(m[1], files);
    }
  }
  for (const [cls, map] of Object.entries(seen)) {
    if (map.size > 1) {
      const detail = [...map.entries()].map(([n, fs]) => `"${n} business days" in ${[...fs].join(', ')}`).join(' vs ');
      fail(`${cls} timing promise is inconsistent site-wide: ${detail}`);
    }
  }
}

// ── brands.json ↔ brand-demo consistency ──
{
  let brands = null;
  try { brands = JSON.parse(read('brands.json')); } catch { /* already failed above */ }
  const bd = read('brand-demo.html');
  const ratesMatch = bd.match(/TIER_RATES\s*=\s*\{([^}]*)\}/);
  if (!ratesMatch) {
    fail('brand-demo.html: TIER_RATES map not found');
  } else if (brands) {
    const rates = {};
    for (const m of ratesMatch[1].matchAll(/(\w+)\s*:\s*(\d+)/g)) rates[m[1]] = Number(m[2]);

    for (const [slug, b] of Object.entries(brands)) {
      // products_count must reflect the actual catalogue
      if (typeof b.products_count === 'number' && Array.isArray(b.products) && b.products_count !== b.products.length) {
        fail(`brands.json: ${slug} products_count is ${b.products_count} but products array has ${b.products.length}`);
      }
      // a tier outside TIER_RATES silently falls back to founding in the UI
      if (b.tier && !(b.tier in rates)) {
        fail(`brands.json: ${slug} tier "${b.tier}" is not in brand-demo.html's TIER_RATES (${Object.keys(rates).join('/')})`);
      }
    }

    // every hardcoded payout-share % in page copy must equal 100 - founding rate
    const expectPct = 100 - rates.founding;
    for (const f of htmlFiles) {
      const html = read(f);
      for (const m of html.matchAll(/(\d+)% (?:of every sale|goes directly|transfers to your brand)/g)) {
        if (Number(m[1]) !== expectPct) {
          fail(`${f}: payout share "${m[1]}%" disagrees with 100 - founding rate = ${expectPct}% (TIER_RATES in brand-demo.html)`);
        }
      }
    }
  }
}

// ── Inline <script> blocks must parse: node --check on each extracted block ──
// Catches JS syntax errors (e.g. an unescaped apostrophe breaking a string)
// that would silently kill a page's entire script at runtime. Skips JSON-LD
// blocks and external src= scripts.
{
  const tmp = mkdtempSync(join(tmpdir(), 'mirr-verify-'));
  try {
    for (const f of htmlFiles) {
      const html = read(f);
      let i = 0;
      for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const attrs = m[1];
        if (/\bsrc\s*=/.test(attrs) || /application\/ld\+json/.test(attrs)) continue;
        if (!m[2].trim()) continue;
        i += 1;
        const tmpFile = join(tmp, `${f}.${i}.js`);
        writeFileSync(tmpFile, m[2]);
        const res = spawnSync(process.execPath, ['--check', tmpFile], { encoding: 'utf8' });
        if (res.status !== 0) {
          const errLine = (res.stderr || '').split('\n').find((l) => l.trim()) || 'syntax error';
          fail(`${f}: inline script block ${i} has a JS syntax error — ${errLine.replace(tmp, '').trim()}`);
        }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} verification failure(s):\n`);
  for (const m of failures) console.error(`  ${m}`);
  process.exit(1);
}
console.log(`✓ All structural checks pass across ${htmlFiles.length} HTML file(s).`);
