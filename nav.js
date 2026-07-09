// nav.js — single source of truth for Mirr site navigation.
// To rename a link, add a page, or update the CTA: edit this file only.
// All pages pull from here automatically.
//
// Usage in HTML: replace <nav>…</nav> with:
//   <div id="nav"></div>                         ← back nav (default)
//   <div id="nav" data-variant="home"></div>     ← full marketing nav
// Immediately followed by: <script src="/nav.js"></script>
//
// No async/defer — executes synchronously during HTML parsing so the nav
// is in the DOM before the first paint.

(function () {
  'use strict';

  // Inject CTA button styles once into <head>.
  // Doing this here avoids duplicate CSS across 8 pages, and the hover
  // state works without inline onmouseover/onmouseout handlers.
  if (!document.getElementById('nav-js-styles')) {
    var style = document.createElement('style');
    style.id = 'nav-js-styles';
    style.textContent = '.nav-cta{font-family:Inter,sans-serif;font-size:12px;letter-spacing:.05em;font-weight:300;color:#fff;background:#7BAEC8;text-decoration:none;padding:8px 18px;display:inline-block;transition:background .2s}.nav-cta:hover{background:#A8C5D8}';
    document.head.appendChild(style);
  }

  var LOGO = '<a href="/" class="logo"><span class="logo-word">MIR<span class="logo-flip">R</span></span></a>';

  var NAVS = {

    // Back nav — used by: about, contact, privacy, terms, 404, submit-products, list-your-brand
    back: '<nav><div class="nav-inner">' + LOGO + '<a href="/" class="nav-back">← Go back</a></div></nav>',

    // Home nav — used by: index.html only.
    // #nav-mobile-panel and toggleMobileNav() stay in index.html because they
    // reference page-specific markup outside the <nav> element.
    home: '<nav><div class="nav-inner">' + LOGO +
      '<div class="nav-mid">' +
        '<a href="#how" class="nav-link">How it works</a>' +
        '<a href="#brands" class="nav-link">For brands</a>' +
        '<a href="#fitting" class="nav-link">Fitting room</a>' +
        '<a href="#faq" class="nav-link">FAQ</a>' +
      '</div>' +
      '<div class="nav-end">' +
        '<a href="/brand-demo" class="nav-link">Live demo</a>' +
        '<a href="/submit-products" class="nav-link">Submit products</a>' +
        '<a href="/list-your-brand" class="nav-cta">List your brand</a>' +
      '</div>' +
      '<button class="nav-burger" id="nav-burger" aria-label="Open menu"' +
        ' aria-expanded="false" onclick="toggleMobileNav()">' +
        '<span></span><span></span><span></span>' +
      '</button>' +
    '</div></nav>'

  };

  var el = document.getElementById('nav');
  if (!el) return;
  el.outerHTML = NAVS[el.getAttribute('data-variant') || 'back'];

}());
