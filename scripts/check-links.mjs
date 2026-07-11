#!/usr/bin/env node
// check-links.mjs — verify every internal href/src in the repo's HTML pages
// points at a file that actually exists. Zero dependencies, no network calls.
//
// Usage: node scripts/check-links.mjs   (run from anywhere; paths resolve
// relative to the repo root, one directory above this script)
//
// GitHub Pages serves extensionless URLs, so /about resolves to about.html —
// this checker accepts either an exact file match or <target>.html.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const htmlFiles = readdirSync(root).filter((f) => f.endsWith('.html'));

// href="..." / src="..." with either quote style
const ATTR_RE = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // http:, https:, mailto:, tel:, data:, javascript:, //host

function isInternal(url) {
  if (!url) return false;
  if (url.startsWith('#')) return false;
  if (EXTERNAL_RE.test(url)) return false;
  if (url.includes('${')) return false; // JS template literal placeholder, not a real path
  if (/[\s'"]/.test(url)) return false; // JS string concatenation inside inline scripts
  return true;
}

function targetExists(url) {
  // Strip query string and fragment
  const path = url.split(/[?#]/)[0];
  if (path === '' || path === '/') return true; // site root → index.html, always present
  const rel = path.startsWith('/') ? path.slice(1) : path;
  const abs = join(root, rel);
  if (existsSync(abs)) return true;
  // GitHub Pages extensionless URL: /about → about.html
  if (!/\.[a-z0-9]+$/i.test(rel) && existsSync(abs + '.html')) return true;
  return false;
}

const broken = [];

for (const file of htmlFiles) {
  const html = readFileSync(join(root, file), 'utf8');
  for (const m of html.matchAll(ATTR_RE)) {
    const url = m[1] ?? m[2];
    if (isInternal(url) && !targetExists(url)) {
      broken.push({ file, url });
    }
  }
}

if (broken.length > 0) {
  console.error(`✗ ${broken.length} broken internal reference(s):\n`);
  for (const { file, url } of broken) {
    console.error(`  ${file} → ${url}`);
  }
  process.exit(1);
}

console.log(`✓ All internal references in ${htmlFiles.length} HTML file(s) resolve.`);
