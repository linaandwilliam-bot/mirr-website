#!/usr/bin/env node
// fit-engine.test.mjs — the fit engine's regression suite (Sprint 78).
// Runs with bare `node scripts/fit-engine.test.mjs`, zero dependencies.
//
// STRUCTURAL RULE (learned the hard way in Sprint 50, when assertions
// appended after process.exit() never ran): every assertion in this file
// executes BEFORE the summary; the summary line and process.exit() are the
// LAST statements and nothing may ever be added after them.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { computeFit, recommendSize, scoreCirc, scoreLength, gradeDims, FIT_EASE, SIZE_STEPS, GRADE } = require('../fit-engine.js');

let passed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { passed++; } else { failures.push(msg); }
}
function eq(actual, expected, msg) {
  assert(actual === expected, msg + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

// ── Fixtures: the live catalogue's dims products + a style-length top ──
const TEE = { fit: 'compression', sample_size: 'M', tryon_cat: 'upperbody', dims: { chest: 47, waist: 44, length: 71 } };
const SHORTS = { fit: 'fitted', sample_size: 'M', tryon_cat: 'lowerbody', dims: { waist: 40, hips: 52, inseam: 18 } };
const JACKET = { fit: 'relaxed', sample_size: 'M', tryon_cat: 'upperbody', dims: { chest: 58, waist: 56, length: 74 } };
const BRA = { fit: 'compression', sample_size: 'M', tryon_cat: 'upperbody', dims: { chest: 38, length: 33 } };
const DEMO = { height: 178, chest: 96, waist: 82, hips: 100, inseam: 81 };
const LARGE = { height: 190, chest: 112, waist: 98, hips: 112, inseam: 88 };
const SMALL = { height: 160, chest: 84, waist: 66, hips: 90, inseam: 74 };

// ── 1. API surface ──
eq(typeof computeFit, 'function', 'computeFit exported');
eq(typeof recommendSize, 'function', 'recommendSize exported');
eq(typeof scoreCirc, 'function', 'scoreCirc exported');
eq(typeof scoreLength, 'function', 'scoreLength exported');
eq(typeof gradeDims, 'function', 'gradeDims exported');
eq(typeof FIT_EASE, 'object', 'FIT_EASE exported');
assert(Array.isArray(SIZE_STEPS) && SIZE_STEPS.join(',') === 'XS,S,M,L,XL', 'SIZE_STEPS is XS..XL');
eq(typeof GRADE, 'object', 'GRADE exported');
eq(FIT_EASE.compression.min, -8, 'compression band min');
eq(FIT_EASE.compression.max, 0, 'compression band max');
eq(FIT_EASE.fitted.min, 2, 'fitted band min');
eq(FIT_EASE.fitted.max, 8, 'fitted band max');
eq(FIT_EASE.regular.min, 6, 'regular band min');
eq(FIT_EASE.regular.max, 14, 'regular band max');
eq(FIT_EASE.relaxed.min, 12, 'relaxed band min');
eq(FIT_EASE.relaxed.max, 24, 'relaxed band max');

// ── 2. scoreCirc band math (ease = flat*2 − body; in-band = 97;
//       tight slope 3.5, loose slope 2, floor 40) ──
// compression [-8, 0] against body 100
eq(scoreCirc(46, 100, 'compression'), 97, 'compression: ease at min edge (-8)');
eq(scoreCirc(50, 100, 'compression'), 97, 'compression: ease at max edge (0)');
eq(scoreCirc(48, 100, 'compression'), 97, 'compression: ease mid-band (-4)');
eq(scoreCirc(45, 100, 'compression'), 90, 'compression: 2cm too tight (97-7)');
eq(scoreCirc(44, 100, 'compression'), 83, 'compression: 4cm too tight (97-14)');
eq(scoreCirc(51, 100, 'compression'), 93, 'compression: 2cm too loose (97-4)');
eq(scoreCirc(53, 100, 'compression'), 85, 'compression: 6cm too loose (97-12)');
// fitted [2, 8] against body 80
eq(scoreCirc(41, 80, 'fitted'), 97, 'fitted: ease at min edge (2)');
eq(scoreCirc(44, 80, 'fitted'), 97, 'fitted: ease at max edge (8)');
eq(scoreCirc(40, 80, 'fitted'), 90, 'fitted: 2cm too tight');
eq(scoreCirc(38, 80, 'fitted'), 76, 'fitted: 6cm too tight (97-21)');
eq(scoreCirc(46, 80, 'fitted'), 89, 'fitted: 4cm too loose');
// regular [6, 14] against body 90
eq(scoreCirc(48, 90, 'regular'), 97, 'regular: ease at min edge (6)');
eq(scoreCirc(52, 90, 'regular'), 97, 'regular: ease at max edge (14)');
eq(scoreCirc(47, 90, 'regular'), 90, 'regular: 2cm too tight');
eq(scoreCirc(54, 90, 'regular'), 89, 'regular: 4cm too loose (18-14=4 -> 97-8)');
eq(scoreCirc(53, 90, 'regular'), 93, 'regular: 2cm too loose (16-14=2 -> 93)');
// relaxed [12, 24] against body 96
eq(scoreCirc(54, 96, 'relaxed'), 97, 'relaxed: ease at min edge (12)');
eq(scoreCirc(60, 96, 'relaxed'), 97, 'relaxed: ease at max edge (24)');
eq(scoreCirc(62, 96, 'relaxed'), 89, 'relaxed: 4cm too loose (28-24 -> 97-8)');
// unknown fit falls back to the regular band
eq(scoreCirc(48, 90, 'bogus'), scoreCirc(48, 90, 'regular'), 'unknown fit uses regular band');
eq(scoreCirc(48, 90, undefined), scoreCirc(48, 90, 'regular'), 'undefined fit uses regular band');
// floor clamps at 40, never below
eq(scoreCirc(20, 120, 'compression'), 40, 'extreme tight clamps to 40');
eq(scoreCirc(120, 60, 'compression'), 40, 'extreme loose clamps to 40');
assert(scoreCirc(10, 200, 'fitted') >= 40, 'tight floor is hard');
assert(scoreCirc(200, 10, 'relaxed') >= 40, 'loose floor is hard');

// ── 3. scoreLength (ideal 0.40h tops / 0.45h bottoms, 5cm grace,
//       style-length null thresholds 55/60, floor 40) ──
eq(scoreLength(54.9, 180, 'length'), null, 'top under 55cm is style length (null)');
eq(scoreLength(33, 180, 'length'), null, 'bra-length 33cm is null');
assert(scoreLength(55, 180, 'length') !== null, 'top at exactly 55cm IS scored');
eq(scoreLength(59, 180, 'inseam'), null, 'inseam under 60cm is style length (null)');
eq(scoreLength(18, 178, 'inseam'), null, 'shorts inseam 18cm is null');
assert(scoreLength(60, 180, 'inseam') !== null, 'inseam at exactly 60cm IS scored');
// height 180: top ideal 72, inseam ideal 81
eq(scoreLength(72, 180, 'length'), 97, 'top at exact ideal');
eq(scoreLength(77, 180, 'length'), 97, 'top at +5 grace edge');
eq(scoreLength(67, 180, 'length'), 97, 'top at -5 grace edge');
eq(scoreLength(78, 180, 'length'), 95, 'top 1cm past grace (97-2)');
eq(scoreLength(66, 180, 'length'), 95, 'top 1cm short of grace');
eq(scoreLength(82, 180, 'length'), 87, 'top 5cm past grace (97-10)');
eq(scoreLength(81, 180, 'inseam'), 97, 'inseam at exact ideal');
eq(scoreLength(86, 180, 'inseam'), 97, 'inseam at +5 grace edge');
eq(scoreLength(87, 180, 'inseam'), 95, 'inseam 1cm past grace');
eq(scoreLength(150, 180, 'length'), 40, 'absurd length clamps to 40');

// ── 4. gradeDims (chest/waist/hips 2cm, length 1.5, inseam 0.5 per step) ──
const g0 = gradeDims(TEE.dims, 0);
eq(g0.chest, 47, 'grade 0 steps: chest identity');
eq(g0.waist, 44, 'grade 0 steps: waist identity');
eq(g0.length, 71, 'grade 0 steps: length identity');
const g1 = gradeDims(TEE.dims, 1);
eq(g1.chest, 49, 'grade +1: chest +2');
eq(g1.waist, 46, 'grade +1: waist +2');
eq(g1.length, 72.5, 'grade +1: length +1.5');
const g2 = gradeDims(SHORTS.dims, -2);
eq(g2.waist, 36, 'grade -2: waist -4');
eq(g2.hips, 48, 'grade -2: hips -4');
eq(g2.inseam, 17, 'grade -2: inseam -1');
const gu = gradeDims({ chest: 50, mystery: 10 }, 3);
eq(gu.chest, 56, 'grade +3: chest +6');
eq(gu.mystery, 10, 'unknown dim key grades by 0');
eq(gradeDims(JACKET.dims, 2).chest, 62, 'jacket +2 steps chest 62');
eq(gradeDims(JACKET.dims, 2).length, 77, 'jacket +2 steps length 77');

// ── 5. computeFit: the demo user against the live catalogue —
//       exact per-dimension scores and overalls, verified in production ──
function fitCase(product, size, expScores, expOverall, label) {
  const r = computeFit(product, DEMO, size);
  for (const k of Object.keys(expScores)) {
    eq(r.scores[k], expScores[k], label + ' @' + size + ' ' + k);
  }
  eq(Object.keys(r.scores).sort().join(','), Object.keys(expScores).sort().join(','), label + ' @' + size + ' scored dims set');
  eq(r.overall, expOverall, label + ' @' + size + ' overall');
}
// Compression Tee (upperbody, no hips dim; length scores as "inseam" key)
fitCase(TEE, 'XS', { chest: 90, waist: 97, inseam: 97 }, 95, 'tee');
fitCase(TEE, 'S',  { chest: 97, waist: 93, inseam: 97 }, 96, 'tee');
fitCase(TEE, 'M',  { chest: 97, waist: 85, inseam: 97 }, 93, 'tee');
fitCase(TEE, 'L',  { chest: 93, waist: 77, inseam: 97 }, 89, 'tee');
fitCase(TEE, 'XL', { chest: 85, waist: 69, inseam: 97 }, 84, 'tee');
// Training Shorts (lowerbody: never chest; 18cm inseam never length-scored)
fitCase(SHORTS, 'XS', { waist: 55, hips: 76 }, 66, 'shorts');
fitCase(SHORTS, 'S',  { waist: 69, hips: 90 }, 80, 'shorts');
fitCase(SHORTS, 'M',  { waist: 83, hips: 97 }, 90, 'shorts');
fitCase(SHORTS, 'L',  { waist: 97, hips: 97 }, 97, 'shorts');
fitCase(SHORTS, 'XL', { waist: 97, hips: 89 }, 93, 'shorts');
// Zip-Up Jacket (relaxed)
fitCase(JACKET, 'XS', { chest: 97, waist: 97, inseam: 97 }, 97, 'jacket');
fitCase(JACKET, 'S',  { chest: 97, waist: 93, inseam: 97 }, 96, 'jacket');
fitCase(JACKET, 'M',  { chest: 97, waist: 85, inseam: 97 }, 93, 'jacket');
fitCase(JACKET, 'L',  { chest: 97, waist: 77, inseam: 97 }, 90, 'jacket');
fitCase(JACKET, 'XL', { chest: 89, waist: 69, inseam: 95 }, 84, 'jacket');

// ── 6. Category rules ──
for (const s of SIZE_STEPS) {
  assert(!('chest' in computeFit(SHORTS, DEMO, s).scores), 'bottoms never score chest @' + s);
  assert(!('inseam' in computeFit(SHORTS, DEMO, s).scores), 'shorts 18cm inseam never length-scored @' + s);
}
const braFit = computeFit(BRA, DEMO, 'M');
assert(!('inseam' in braFit.scores), 'bra 33cm length is not scored (style length)');
assert('chest' in braFit.scores, 'bra chest IS scored');
assert(!('waist' in braFit.scores) && !('hips' in braFit.scores), 'bra scores only the dims it has');
const noDims = computeFit({ fit: 'regular', sample_size: 'M', tryon_cat: 'upperbody', dims: {} }, DEMO, 'M');
eq(noDims.overall, 0, 'no scorable dims -> overall 0');
eq(Object.keys(noDims.scores).length, 0, 'no scorable dims -> empty scores');

// ── 7. recommendSize: known outcomes + the Sprint 50 regression ──
const recTee = recommendSize(TEE, DEMO);
eq(recTee.size, 'M', 'tee/demo recommends M (near-tie resolves toward sample)');
eq(recTee.overall, 93, 'tee/demo recommendation overall');
const recShorts = recommendSize(SHORTS, DEMO);
eq(recShorts.size, 'L', 'shorts/demo recommends L (clear winner outside window)');
eq(recShorts.overall, 97, 'shorts/demo recommendation overall');
const recJacket = recommendSize(JACKET, DEMO);
assert(recJacket.size !== 'XS', 'SPRINT 50 REGRESSION: relaxed jacket must NOT recommend XS for the demo user');
eq(recJacket.size, 'S', 'jacket/demo resolves the XS/S near-tie toward the sample cut (S)');
eq(recJacket.overall, 96, 'jacket/demo recommendation overall');
const recTeeLarge = recommendSize(TEE, LARGE);
eq(recTeeLarge.size, 'XL', 'tee/large frame recommends XL (strong winner not blunted by window)');
eq(recTeeLarge.overall, 95, 'tee/large frame overall');
const recTeeSmall = recommendSize(TEE, SMALL);
eq(recTeeSmall.size, 'XS', 'tee/small frame recommends XS');
eq(recTeeSmall.overall, 86, 'tee/small frame overall');
assert(recommendSize(TEE, DEMO).overall === computeFit(TEE, DEMO, recommendSize(TEE, DEMO).size).overall,
  'recommendation overall equals computeFit of the recommended size');

// ── 8. Clamp sweep: every score in [40, 99] across products × sizes × bodies ──
const PRODUCTS = { tee: TEE, shorts: SHORTS, jacket: JACKET, bra: BRA };
const BODIES = { demo: DEMO, large: LARGE, small: SMALL };
for (const pn of Object.keys(PRODUCTS)) {
  for (const bn of Object.keys(BODIES)) {
    for (const s of SIZE_STEPS) {
      const r = computeFit(PRODUCTS[pn], BODIES[bn], s);
      const vals = Object.keys(r.scores).map((k) => r.scores[k]);
      assert(vals.every((v) => v >= 40 && v <= 99), 'dim scores in [40,99]: ' + pn + '/' + bn + '/' + s + ' got ' + JSON.stringify(r.scores));
      assert(r.overall >= 40 && r.overall <= 99, 'overall in [40,99]: ' + pn + '/' + bn + '/' + s + ' got ' + r.overall);
    }
  }
}

// ── 9. Determinism: same inputs, identical output objects ──
for (const pn of Object.keys(PRODUCTS)) {
  assert(JSON.stringify(computeFit(PRODUCTS[pn], DEMO, 'M')) === JSON.stringify(computeFit(PRODUCTS[pn], DEMO, 'M')),
    'computeFit deterministic: ' + pn);
  assert(JSON.stringify(recommendSize(PRODUCTS[pn], DEMO)) === JSON.stringify(recommendSize(PRODUCTS[pn], DEMO)),
    'recommendSize deterministic: ' + pn);
}
// Inputs are never mutated
const dimsBefore = JSON.stringify(TEE.dims);
const mcmBefore = JSON.stringify(DEMO);
computeFit(TEE, DEMO, 'XL');
recommendSize(TEE, DEMO);
eq(JSON.stringify(TEE.dims), dimsBefore, 'product dims not mutated');
eq(JSON.stringify(DEMO), mcmBefore, 'measurements not mutated');

// ── 10. recommendSize allowed-sizes parameter (Sprint 84) ──
// (a) Regression lock: with the parameter OMITTED, outputs are exactly what
// the engine returned before the parameter existed — recorded 2026-08-19
// from the pre-change engine for the three demo products × three bodies.
const LOCKED = [
  [TEE, DEMO, 'M', 93], [TEE, LARGE, 'XL', 95], [TEE, SMALL, 'XS', 86],
  [SHORTS, DEMO, 'L', 97], [SHORTS, LARGE, 'XL', 73], [SHORTS, SMALL, 'XS', 97],
  [JACKET, DEMO, 'S', 96], [JACKET, LARGE, 'XL', 97], [JACKET, SMALL, 'XS', 86],
];
for (let li = 0; li < LOCKED.length; li++) {
  const [p, m, sz, ov] = LOCKED[li];
  const r = recommendSize(p, m);
  eq(r.size, sz, 'S84 regression lock #' + li + ' size unchanged with param omitted');
  eq(r.overall, ov, 'S84 regression lock #' + li + ' overall unchanged with param omitted');
}
// (b) Constrained pool: never recommends outside the allowed set, for any
// product × body combination.
for (const pn of Object.keys(PRODUCTS)) {
  for (const bn of Object.keys(BODIES)) {
    const r = recommendSize(PRODUCTS[pn], BODIES[bn], ['M', 'L']);
    assert(r.size === 'M' || r.size === 'L', 'allowed [M,L] returns only M or L: ' + pn + '/' + bn + ' got ' + r.size);
    assert(r.overall === computeFit(PRODUCTS[pn], BODIES[bn], r.size).overall,
      'constrained recommendation overall equals computeFit of that size: ' + pn + '/' + bn);
  }
}
// The rehearsal case that motivated this sprint: a small frame constrained
// to [M,L] must get M (the closer stocked size), never XS.
eq(recommendSize(TEE, SMALL, ['M', 'L']).size, 'M', 'S84: small frame constrained to [M,L] gets M, not XS');
// (c) Fallbacks: empty array, garbage, and no-valid-entries all behave
// exactly like the omitted parameter — and never throw.
for (const pn of Object.keys(PRODUCTS)) {
  const base = JSON.stringify(recommendSize(PRODUCTS[pn], DEMO));
  eq(JSON.stringify(recommendSize(PRODUCTS[pn], DEMO, [])), base, 'allowed [] falls back to full range: ' + pn);
  eq(JSON.stringify(recommendSize(PRODUCTS[pn], DEMO, ['ZZZ', 'XXXL'])), base, 'allowed with no valid entries falls back: ' + pn);
  eq(JSON.stringify(recommendSize(PRODUCTS[pn], DEMO, 'garbage')), base, 'non-array string falls back: ' + pn);
  eq(JSON.stringify(recommendSize(PRODUCTS[pn], DEMO, { M: true })), base, 'non-array object falls back: ' + pn);
  eq(JSON.stringify(recommendSize(PRODUCTS[pn], DEMO, null)), base, 'null falls back: ' + pn);
  eq(JSON.stringify(recommendSize(PRODUCTS[pn], DEMO, undefined)), base, 'undefined behaves as omitted: ' + pn);
}
// (d) Pool order follows SIZE_STEPS regardless of input order, mixed
// invalid entries are ignored, and the allowed array is never mutated.
const unordered = ['L', 'ZZZ', 'M'];
const unorderedBefore = JSON.stringify(unordered);
eq(recommendSize(TEE, SMALL, unordered).size, 'M', 'unordered/mixed allowed list still constrains correctly');
eq(JSON.stringify(unordered), unorderedBefore, 'allowed array not mutated');
// (e) Near-tie window still resolves toward the sample cut WITHIN the pool:
// the jacket ties across sizes for the demo body; constrained to [XS,S] it
// must pick S (nearer the M sample), not XS.
eq(recommendSize(JACKET, DEMO, ['XS', 'S']).size, 'S', 'near-tie inside constrained pool resolves toward sample');
// (f) Single-size pool returns that size with its honest (possibly low) score.
const only = recommendSize(SHORTS, LARGE, ['XS']);
eq(only.size, 'XS', 'single-size pool returns that size');
eq(only.overall, computeFit(SHORTS, LARGE, 'XS').overall, 'single-size pool reports its true score');

// ── Summary — ALWAYS the last statements in this file ──
const total = passed + failures.length;
if (failures.length > 0) {
  console.error('✗ fit-engine: ' + failures.length + ' of ' + total + ' assertions FAILED:\n');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log('✓ fit-engine: all ' + total + ' assertions pass.');
process.exit(0);
