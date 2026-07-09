// nav.js — single source of truth for Mirr site navigation.
// To rename a link, add a page, or update the CTA: edit this file only.
// All pages pull from here automatically.
//
// Usage in HTML: replace <nav>…</nav> with:
//   <div id="nav"></div>                         ← back nav (default)
//   <div id="nav" data-variant="home"></div>     ← full marketing nav
// Immediately followed by: <script src="/nav.js"></script>
//
// No async/defer on the script tag — it executes synchronously during HTML
// parsing so the nav is in the DOM before the first paint.

(function () {
  'use strict';

  var LOGO = '<a href="/" class="logo"><span class="logo-word">MIR<span class="logo-flip">R</span></span></a>';

  // CTA style in a variable to avoid quote-escaping issues inside strings.
  var CTA_STYLE = [
    'font-family:"Inter",sans-serif',
    'font-size:12px',
    'letter-spacing:.05em',
    'font-weight:300',
    'color:#fff',
    'background:#7BAEC8',
    'text-decoration:none',
    'padding:8px 18px',
    'display:inline-block',
    'transition:background .2s'
  ].join(';');

  var NAVS = {

    // ── Back nav ───────────────────────────────────────────────────────────────────
    // Used by: about, contact, privacy, terms, 404, submit-products, list-your-brand
    back: '<nav><div class="nav-inner">' + LOGO + '<a href="/" class="nav-back">← Go back</a></div></nav>',

    // ── Home nav ───────────────────────────────────────────────────────────────────
    // Used by: index.html only.
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
        '<a href="/list-your-brand" style="' + CTA_STYLE + '"' +
          ' onmouseover="this.style.background='#A8C5D8'"' +
          ' onmouseout="this.style.background='#7BAEC8'">List your brand</a>' +
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
