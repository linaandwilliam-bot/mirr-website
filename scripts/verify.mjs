#!/usr/bin/env node
// verify.mjs — companion to check-links.mjs. Codifies the site's structural
// invariants so any session can check them in one command:
//
//   node scripts/verify.mjs
//
// Exits non-zero with a list of failures. Zero dependencies, no network.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

if (failures.length > 0) {
  console.error(`✗ ${failures.length} verification failure(s):\n`);
  for (const m of failures) console.error(`  ${m}`);
  process.exit(1);
}
console.log(`✓ All structural checks pass across ${htmlFiles.length} HTML file(s).`);
