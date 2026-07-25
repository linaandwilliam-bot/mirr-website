#!/usr/bin/env node
// promote-submission.mjs — promote a submissions.json entry into brands.json.
//
//   node scripts/promote-submission.mjs <submission-ref>            (dry run)
//   node scripts/promote-submission.mjs <submission-ref> --write    (apply)
//   node scripts/promote-submission.mjs <submission-ref> --force    (allow overwriting an existing product)
//
// Maps each submitted product's flat-lay dimensions (dim-*-cm) into the
// Sprint 50 fit-engine format so real garment dims reach the fit score.
// NEVER writes without --write: the default run prints the proposed
// brands.json diff and exits. submissions.json is never modified — it is
// Worker-managed; flip the submission's status to "live" by hand, per
// convention (see CLAUDE.md). Zero dependencies, no network.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const ref = args.find((a) => !a.startsWith('--'));
const WRITE = flags.has('--write');
const FORCE = flags.has('--force');

const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
const notes = [];
const note = (msg) => notes.push(msg);

if (!ref) die('usage: node scripts/promote-submission.mjs <submission-ref> [--write] [--force]');
for (const f of flags) if (f !== '--write' && f !== '--force') die(`unknown flag ${f}`);

// ── Load inputs ──
let submissions, brandsText, brands;
try { submissions = JSON.parse(readFileSync(join(root, 'submissions.json'), 'utf8')); }
catch (e) { die(`submissions.json: ${e.message}`); }
try { brandsText = readFileSync(join(root, 'brands.json'), 'utf8'); brands = JSON.parse(brandsText); }
catch (e) { die(`brands.json: ${e.message}`); }
if (!Array.isArray(submissions)) die('submissions.json: expected an array');

const sub = submissions.find((s) => s && s.ref === ref);
if (!sub) die(`no submission with ref "${ref}" (${submissions.length} submission(s) present)`);
if (!sub.brand_name) die(`submission ${ref} has no brand_name`);
if (!Array.isArray(sub.products) || sub.products.length === 0) die(`submission ${ref} has no products`);
if (String(sub.status).toLowerCase() === 'live') {
  note(`submission ${ref} is already marked live — promoting anyway (products may already exist in brands.json)`);
}

// ── Mapping helpers ──
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const VALID_SAMPLE = ['XS', 'S', 'M', 'L', 'XL'];
const TRYON_CAT = { TOPS: 'upperbody', OUTERWEAR: 'upperbody', BOTTOMS: 'lowerbody' };
const DIM_MAP = { dim_chest_cm: 'chest', dim_waist_cm: 'waist', dim_length_cm: 'length', dim_inseam_cm: 'inseam' };

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const initialsOf = (s) => String(s).trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

function mapProduct(p, i) {
  const label = `product ${i + 1} ("${p.name || 'unnamed'}")`;
  if (!p.name) die(`${label}: submission product has no name`);

  const catRaw = String(p.category || '').toUpperCase();
  let tryonCat = TRYON_CAT[catRaw];
  if (!tryonCat) {
    tryonCat = 'upperbody';
    note(`${label}: category "${p.category || '(none)'}" has no tryon_cat mapping — defaulted to upperbody, review before going live`);
  }

  const dims = {};
  for (const [from, to] of Object.entries(DIM_MAP)) {
    const v = Number(p[from]);
    if (Number.isFinite(v) && v > 0) dims[to] = v;
  }
  if (Object.keys(dims).length === 0) {
    note(`${label}: no garment dimensions submitted — the fit panel's legacy path needs a scores object; add dims (or scores) before going live`);
  }

  const sizes = String(p.sizes_in_stock || '').split(',').map((s) => s.trim().toUpperCase())
    .filter((s) => SIZE_ORDER.includes(s))
    .sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
  let sampleSize;
  if (sizes.length > 0) {
    sampleSize = sizes[Math.floor((sizes.length - 1) / 2)];
    if (!VALID_SAMPLE.includes(sampleSize)) {
      note(`${label}: size-range middle ${sampleSize} is outside the fit engine's XS–XL — clamped to XL`);
      sampleSize = 'XL';
    }
    // Submitted dims measure the SMALLEST stocked size (the submit form
    // labels them that way); the engine reads dims as sample_size's dims.
    if (Object.keys(dims).length > 0 && sizes[0] !== sampleSize) {
      note(`${label}: submitted dims measure the smallest stocked size (${sizes[0]}) but sample_size is set to the range middle (${sampleSize}) per promotion convention — re-measure or adjust one of them before going live`);
    }
  } else {
    note(`${label}: no recognisable size range submitted — sample_size omitted (fit engine defaults to M)`);
  }

  const priceNum = Number(p.price);
  const price = Number.isFinite(priceNum) ? '$' + priceNum.toFixed(2) : null;
  if (!price) die(`${label}: price "${p.price}" is not a number`);

  if (!p.front_photo) note(`${label}: no front photo URL in the submission — image left empty, add one before going live`);
  note(`${label}: no buy_url exists in submissions — the Buy button needs one before going live`);

  const out = {
    cat: catRaw || 'OTHER',
    name: p.name,
    buy_url: null,
    price,
    old: null,
    desc: p.description || '',
    tryon_cat: tryonCat,
    badge: null,
    badge_class: null,
    image: p.front_photo || '',
  };
  if (Object.keys(dims).length > 0) out.dims = dims;
  if (sampleSize) out.sample_size = sampleSize;
  // fit is deliberately left unset (engine defaults to regular) — whether a
  // garment is compression/fitted/relaxed is a human judgment call.
  if (p.sku) out.sku = p.sku;
  return out;
}

// ── Build the proposed brands.json ──
const slug = slugify(sub.brand_name);
if (!slug) die(`could not derive a slug from brand_name "${sub.brand_name}"`);
const proposed = JSON.parse(brandsText); // fresh copy to mutate
const isNewBrand = !proposed[slug];

if (isNewBrand) {
  proposed[slug] = {
    name: sub.brand_name,
    tier: 'standard',
    verified: false,
    initials: initialsOf(sub.brand_name),
    location: '',
    products_count: 0,
    tryons_count: 0,
    description: '',
    tags: [],
    products: [],
  };
  note(`new brand "${sub.brand_name}" scaffolded at slug "${slug}" — review before going live: tier (standard by default), location, description, tags, store_url; verified stays false until checked`);
} else {
  note(`updating existing brand "${proposed[slug].name}" (slug "${slug}") — brand fields untouched, only products change`);
}

const brand = proposed[slug];
const mapped = sub.products.map(mapProduct);
const clashes = [];
for (const mp of mapped) {
  const idx = brand.products.findIndex((ep) => ep && String(ep.name).toLowerCase() === mp.name.toLowerCase());
  if (idx >= 0) {
    if (!FORCE) { clashes.push(mp.name); continue; }
    note(`overwrote existing product "${brand.products[idx].name}" (--force)`);
    brand.products[idx] = mp;
  } else {
    brand.products.push(mp);
  }
}
if (clashes.length > 0) {
  die(`refusing to overwrite existing product(s) without --force: ${clashes.map((n) => `"${n}"`).join(', ')}`);
}
brand.products_count = brand.products.length;

// ── Validate the proposed output against verify.mjs's schema rules ──
// Same rules as scripts/verify.mjs enforces on brands.json — fail loudly
// here so an invalid file can never be written.
{
  const failures = [];
  const VALID_TIERS = ['founding', 'standard', 'premium'];
  const VALID_DIM_KEYS = ['chest', 'waist', 'hips', 'length', 'inseam'];
  const VALID_FITS = ['compression', 'fitted', 'regular', 'relaxed'];
  for (const [s, b] of Object.entries(proposed)) {
    if (!b.name || typeof b.name !== 'string') failures.push(`"${s}" is missing name`);
    if (!VALID_TIERS.includes(b.tier)) failures.push(`"${s}" tier must be one of ${VALID_TIERS.join('/')}`);
    if (!Array.isArray(b.products) || b.products.length === 0) {
      failures.push(`"${s}" needs a non-empty products array`);
    } else if (!b.products.some((p) => p && p.name && p.price)) {
      failures.push(`"${s}" needs at least one product with both name and price`);
    }
    if (typeof b.products_count === 'number' && Array.isArray(b.products) && b.products_count !== b.products.length) {
      failures.push(`"${s}" products_count ${b.products_count} does not match products array length ${b.products.length}`);
    }
    for (const p of Array.isArray(b.products) ? b.products : []) {
      if (!p) continue;
      const label = `"${s}" product "${p.name || '(unnamed)'}"`;
      if (p.dims != null) {
        if (typeof p.dims !== 'object' || Array.isArray(p.dims)) failures.push(`${label} dims must be an object`);
        else for (const [k, v] of Object.entries(p.dims)) {
          if (!VALID_DIM_KEYS.includes(k)) failures.push(`${label} dims key "${k}" invalid`);
          if (!Number.isFinite(v) || v < 10 || v > 200) failures.push(`${label} dims.${k} must be a finite number between 10 and 200 (got ${JSON.stringify(v)})`);
        }
      }
      if (p.fit != null && !VALID_FITS.includes(p.fit)) failures.push(`${label} fit "${p.fit}" invalid`);
      if (p.sample_size != null && !VALID_SAMPLE.includes(p.sample_size)) failures.push(`${label} sample_size "${p.sample_size}" invalid`);
    }
  }
  if (failures.length > 0) {
    console.error(`✗ proposed brands.json fails schema validation — nothing written:\n`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
}

const proposedText = JSON.stringify(proposed, null, 2) + '\n';

// ── Diff (simple LCS over lines) ──
function diffLines(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  const m = A.length, n = B.length;
  const L = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
    L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const out = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { out.push([' ', A[i]]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { out.push(['-', A[i]]); i++; }
    else { out.push(['+', B[j]]); j++; }
  }
  while (i < m) out.push(['-', A[i++]]);
  while (j < n) out.push(['+', B[j++]]);
  // Collapse long unchanged runs to keep the output readable.
  const lines = [];
  for (let k = 0; k < out.length; k++) {
    const isCtx = out[k][0] === ' ';
    const nearChange = out.slice(Math.max(0, k - 2), k + 3).some((x) => x[0] !== ' ');
    if (!isCtx || nearChange) lines.push(out[k][0] + ' ' + out[k][1]);
    else if (lines[lines.length - 1] !== '  ...') lines.push('  ...');
  }
  return lines.join('\n');
}

// ── Report ──
console.log(`Submission ${ref} — "${sub.brand_name}" (${sub.products.length} product(s), status ${sub.status})`);
console.log(`${isNewBrand ? 'NEW brand' : 'EXISTING brand'} → brands.json slug "${slug}"\n`);
if (notes.length > 0) {
  console.log('Review notes:');
  for (const nte of notes) console.log(`  • ${nte}`);
  console.log('');
}
console.log('Proposed brands.json diff:\n');
console.log(diffLines(brandsText, proposedText));
console.log('');

if (!WRITE) {
  console.log('DRY RUN — nothing written. Re-run with --write to apply.');
  console.log('(submissions.json is never modified — flip its status to "live" by hand once the products are up.)');
  process.exit(0);
}

writeFileSync(join(root, 'brands.json'), proposedText);
console.log(`✓ brands.json written (${Object.keys(proposed).length} brand(s), "${slug}" now has ${brand.products.length} product(s)).`);
console.log('Next: run node scripts/verify.mjs, review the notes above, then flip the submission status to "live" by hand.');
