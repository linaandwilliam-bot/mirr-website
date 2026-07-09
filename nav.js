// nav.js — single source of truth for Mirr site navigation.
// To rename a link, add a page, or update the CTA: edit this file only.
// All pages pull from here automatically.
//
// Usage in HTML: replace <nav>…</nav> with:
//   <div id="nav"></div>                         ← back nav (default)
//   <div id="nav" data-variant="home"></div>     ← full marketing nav
// Immediately followed by: <script src="/nav.js"></script>

(function () {
  'use strict';

  var LOGO = '<a href="/" class="logo"><span class="logo-word">MIR<span class="logo-flip">R</span></span></a>';

  // CTA button styles — injected once into <head> so no duplicate CSS across pages.
  var CTA_CSS = '.nav-cta{font-family:Inter,sans-serif;font-size:12px;letter-spacing:.05em;font-weight:300;color:#fff;background:#7BAEC8;text-decoration:none;padding:8px 18px;display:inline-block;transition:background .2s}.nav-cta:hover{background:#A8C5D8}';

  var NAVS = {

    // Back nav — about, contact, privacy, terms, 404, submit-products, list-your-brand
    back: '<nav><div class="nav-inner">' + LOGO + '<a href="/" class="nav-back">← Go back</a></div></nav>',

    // Home nav — index.html only.
    // #nav-mobile-panel and toggleMobileNav() stay in index.html.
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

  function injectNav() {
    var el = document.getElementById('nav');
    if (!el) return;
    if (!document.getElementById('nav-js-styles')) {
      var st = document.createElement('style');
      st.id = 'nav-js-styles';
      st.textContent = CTA_CSS;
      document.head.appendChild(st);
    }
    var html = NAVS[el.getAttribute('data-variant') || 'back'];
    el.insertAdjacentHTML('afterend', html);
    el.parentNode.removeChild(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }

}());
