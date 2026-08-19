// fit-engine.js — Mirr's fit math, the single source of truth (Sprint 78).
// Extracted VERBATIM from brand-demo.html's Sprint 50 engine block; the
// functions and constants below are duplicated nowhere. Loaded as browser
// globals by brand-demo.html (var/function declarations on purpose) and as
// a CommonJS module by scripts/fit-engine.test.mjs, which must pass before
// every push:  node scripts/fit-engine.test.mjs

// ── Sprint 50: real fit engine ─────────────────────────────────────────
// Ease bands (cm of circumference ease = garment circ − body circ).
var FIT_EASE = {
  compression: { min: -8,  max: 0  },
  fitted:      { min: 2,   max: 8  },
  regular:     { min: 6,   max: 14 },
  relaxed:     { min: 12,  max: 24 }
};
var SIZE_STEPS = ['XS', 'S', 'M', 'L', 'XL'];
var GRADE = { chest: 2, waist: 2, hips: 2, length: 1.5, inseam: 0.5 };

function scoreCirc(flatCm, bodyCm, fit) {
  var band = FIT_EASE[fit] || FIT_EASE.regular;
  var ease = flatCm * 2 - bodyCm;
  var off = ease < band.min ? band.min - ease : ease > band.max ? ease - band.max : 0;
  var rate = ease < band.min ? 3.5 : 2; // too tight is worse than too loose
  return Math.max(40, Math.round(97 - off * rate));
}

// Intentionally-short garments (shorts, crop tops, bras) are a style choice,
// not a fit failure — below thresholds length is NOT scored (row shows N/A).
function scoreLength(garmentCm, heightCm, kind) {
  if (kind === 'inseam' ? garmentCm < 60 : garmentCm < 55) return null;
  var ideal = heightCm * (kind === 'inseam' ? 0.45 : 0.40);
  var off = Math.max(0, Math.abs(garmentCm - ideal) - 5);
  return Math.max(40, Math.round(97 - off * 2));
}

function gradeDims(dims, steps) {
  var out = {};
  for (var k in dims) out[k] = dims[k] + (GRADE[k] || 0) * steps;
  return out;
}

function computeFit(product, mcm, sizeLabel) {
  var fit = product.fit || 'regular';
  var sample = product.sample_size || 'M';
  var steps = SIZE_STEPS.indexOf(sizeLabel) - SIZE_STEPS.indexOf(sample);
  var d = gradeDims(product.dims, steps);
  var isBottom = product.tryon_cat === 'lowerbody';
  var s = {}, tot = 0, cnt = 0;
  if (d.chest != null && !isBottom) { s.chest = scoreCirc(d.chest, mcm.chest, fit); }
  if (d.waist != null) { s.waist = scoreCirc(d.waist, mcm.waist, isBottom ? (product.fit || 'fitted') : fit); }
  if (d.hips != null) { s.hips = scoreCirc(d.hips, mcm.hips, fit); }
  var lengthDim = isBottom ? d.inseam : d.length;
  if (lengthDim != null) {
    var ls = scoreLength(lengthDim, mcm.height, isBottom ? 'inseam' : 'length');
    if (ls != null) s.inseam = ls;
  }
  for (var k in s) { tot += s[k]; cnt++; }
  return { scores: s, overall: cnt ? Math.round(tot / cnt) : 0 };
}

// Ties break toward the sample size (a relaxed jacket can tie across XS–L;
// recommending XS when M fits equally well is bad advice).
// allowedSizes (optional, Sprint 84): when a non-empty subset of SIZE_STEPS
// is supplied, only those sizes are evaluated — a brand stocking M/L must
// never have XS recommended. Anything else (omitted, empty array, garbage,
// no valid entries) falls back to the full range; this never throws, and
// with the parameter omitted the behaviour is identical to before.
function recommendSize(product, mcm, allowedSizes) {
  var pool = SIZE_STEPS;
  if (Array.isArray(allowedSizes)) {
    var valid = SIZE_STEPS.filter(function (s) { return allowedSizes.indexOf(s) !== -1; });
    if (valid.length > 0) pool = valid;
  }
  var sampleIdx = SIZE_STEPS.indexOf(product.sample_size || 'M');
  var results = [];
  for (var i = 0; i < pool.length; i++) {
    results.push({ size: pool[i], overall: computeFit(product, mcm, pool[i]).overall, dist: Math.abs(SIZE_STEPS.indexOf(pool[i]) - sampleIdx) });
  }
  var top = 0;
  for (var j = 0; j < results.length; j++) { if (results[j].overall > top) top = results[j].overall; }
  // Near-ties (within 3 points of the best) resolve toward the garment's
  // sample cut — don't send a usual-M shopper to XS over a 2-point model edge.
  var cand = results.filter(function (r) { return r.overall >= top - 3; });
  cand.sort(function (a, b) { return a.dist - b.dist || b.overall - a.overall; });
  return { size: cand[0].size, overall: cand[0].overall };
}
// ── end fit engine ─────────────────────────────────────────────────────

// Dual-context export: browser pages use the globals above; Node tests
// require() this file.
if (typeof module !== 'undefined') module.exports = { computeFit, recommendSize, scoreCirc, scoreLength, gradeDims, FIT_EASE, SIZE_STEPS, GRADE };
