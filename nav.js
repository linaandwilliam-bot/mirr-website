// nav.js — single source of truth for Mirr site navigation.
// To rename a link, add a page, or update the CTA: edit this file only.
// All pages pull from here automatically.
//
// Usage in HTML: replace <nav>…</nav> with:
//   <div id="nav"></div>                          ← back nav (default)
//   <div id="nav" data-variant="home"></div>      ← full marketing nav
// Immediately followed by: <script src="/nav.js"></script>
//
// The <script> tag has no async/defer, so it executes synchronously during
// HTML parsing — the nav is already in the DOM before the first paint.

(function () {
  'use strict';

  var LOGO = '<a href="/" class="logo"><span class="logo-word">MIR<span class="logo-flip">R</span></span></a>';

  var NAVS = {

    // ── Back nav ─────────────────────────────────────────────────────────────────────
    // Pages: about, contact, privacy, terms, 404, submit-products, list-your-brand
    back: [
      '<nav>',
      '  <div class="nav-inner">',
      '    ' + LOGO,
      '    <a href="/" class="nav-back">← Go back</a>',
      '  </div>',
      '</nav>'
    ].join('\n'),

    // ── Home nav ─────────────────────────────────────────────────────────────────────
    // Page: index.html only.
    // Note: #nav-mobile-panel and toggleMobileNav() live in index.html
    // because they reference page-specific markup outside the <nav> element.
    home: [
      '<nav>',
      '  <div class="nav-inner">',
      '    ' + LOGO,
      '    <div class="nav-mid">',
      '      <a href="#how" class="nav-link">How it works</a>',
      '      <a href="#brands" class="nav-link">For brands</a>',
      '      <a href="#fitting" class="nav-link">Fitting room</a>',
      '      <a href="#faq" class="nav-link">FAQ</a>',
      '    </div>',
      '    <div class="nav-end">',
      '      <a href="/brand-demo" class="nav-link">Live demo</a>',
      '      <a href="/submit-products" class="nav-link">Submit products</a>',
      '      <a href="/list-your-brand" style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:.05em;font-weight:300;color:#fff;background:#7BAEC8;text-decoration:none;padding:8px 18px;display:inline-block;transition:background .2s" onmouseover="this.style.background='#A8C5D8'" onmouseout="this.style.background='#7BAEC8'">List your brand</a>',
      '    </div>',
      '    <button class="nav-burger" id="nav-burger" aria-label="Open menu" aria-expanded="false" onclick="toggleMobileNav()">',
      '      <span></span><span></span><span></span>',
      '    </button>',
      '  </div>',
      '</nav>'
    ].join('\n')

  };

  var el = document.getElementById('nav');
  if (!el) return;
  el.outerHTML = NAVS[el.getAttribute('data-variant') || 'back'];

}());
