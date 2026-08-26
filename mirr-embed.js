/*! Mirr embed — Phase-1 PROTOTYPE (Sprint 101). NOT a shipped product: no
 * retailer can install this today and it is deliberately unlinked from the
 * public site. It exists to show the model: one script tag, a "Try it on"
 * button under the price, the full Mirr try-on in an overlay — the shopper
 * never leaves the retailer's page.
 *
 * Prototype contract — mark any element with:
 *   data-mirr-product="<product-name-slug>"   (required; e.g. "forest-compression-tee")
 *   data-mirr-brand="<brand-slug>"            (optional; defaults to apex-active)
 *   data-mirr-size="<size>"                   (optional; preselects a stocked size)
 * The button renders immediately after that element.
 * TODO(Sprint 101): product ids are name-slugs because no stable product-id
 * registry exists yet (SKU? Mirr-assigned id?) — open question for Phase 2.
 *
 * Boundaries: everything lives in this IIFE and two shadow roots. Nothing is
 * written to the host page's globals, styles cannot leak in either direction,
 * and every entry point is wrapped so nothing ever throws into the host
 * page's console.
 */
(function () {
  'use strict';
  // Resolve Mirr's origin from this script's own src, so the same tag works
  // pasted into a page on any host. Falls back to same-origin paths.
  var BASE = '';
  try { BASE = new URL(document.currentScript.src, location.href).origin; } catch (e) {}

  var overlayHost = null, iframe = null, closeBtn = null, lastTrigger = null;
  var prevOverflow = '';

  function safe(fn) {
    return function () { try { return fn.apply(this, arguments); } catch (e) { /* never the host's problem */ } };
  }

  var BTN_CSS =
    ':host{all:initial;display:block;margin-top:10px}' +
    'button{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px;' +
    'background:#fff;border:1px solid #7BAEC8;border-radius:4px;cursor:pointer;' +
    "font-family:'DM Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px;" +
    'letter-spacing:.08em;color:#48738C}' +
    'button:hover{background:#F2F7FA}button:focus-visible{outline:2px solid #7BAEC8;outline-offset:2px}' +
    '.flip{display:inline-block;transform:scaleX(-1);color:#7BAEC8}';

  var OV_CSS =
    ':host{all:initial}' +
    '.ov{position:fixed;inset:0;z-index:2147483000;display:none}.ov.open{display:block}' +
    '.bk{position:absolute;inset:0;background:rgba(26,32,38,.62)}' +
    '.dl{position:absolute;inset:16px;background:#FDFCFA;border-radius:8px;overflow:hidden;' +
    'display:flex;flex-direction:column;font-family:ui-monospace,Menlo,Consolas,monospace}' +
    '@media(max-width:700px){.dl{inset:0;border-radius:0}}' +
    '.hd{display:flex;align-items:center;justify-content:space-between;gap:12px;' +
    'padding:6px 8px 6px 16px;border-bottom:1px solid rgba(0,0,0,.08)}' +
    '.tt{font-size:11px;letter-spacing:.1em;color:#48738C}' +
    '.x{min-width:44px;min-height:44px;border:none;background:none;cursor:pointer;font-size:20px;' +
    'color:#5A6570;border-radius:4px}.x:hover{background:rgba(123,174,200,.12)}' +
    '.x:focus-visible{outline:2px solid #7BAEC8;outline-offset:-2px}' +
    'iframe{flex:1;width:100%;border:0}';

  function buildOverlay() {
    overlayHost = document.createElement('div');
    var sh = overlayHost.attachShadow({ mode: 'open' });
    sh.innerHTML =
      '<style>' + OV_CSS + '</style>' +
      '<div class="ov" role="dialog" aria-modal="true" aria-label="Mirr virtual try-on (prototype)">' +
      '<div class="bk" part="backdrop"></div><div class="dl">' +
      '<div class="hd"><span class="tt">MIRR — VIRTUAL TRY-ON (PROTOTYPE)</span>' +
      '<button class="x" type="button" aria-label="Close try-on">×</button></div>' +
      '<iframe title="Mirr virtual try-on"></iframe>' +
      // Focus sentinel: Tab out of the iframe's last element lands here and
      // is sent back to the close button, so focus cycles inside the overlay
      // instead of escaping to the host page.
      '<div class="s" tabindex="0"></div>' +
      '</div></div>';
    iframe = sh.querySelector('iframe');
    closeBtn = sh.querySelector('.x');
    closeBtn.addEventListener('click', safe(close));
    sh.querySelector('.bk').addEventListener('click', safe(close));
    sh.querySelector('.s').addEventListener('focus', safe(function () { closeBtn.focus(); }));
    document.body.appendChild(overlayHost);
  }

  function isOpen() { return !!(overlayHost && overlayHost.shadowRoot.querySelector('.ov.open')); }

  // Primary focus trap: while the overlay is open the rest of the host page
  // is inert (unfocusable, unclickable), so focus physically cannot escape.
  // Only elements WE made inert are restored — anything the host page had
  // inert already stays that way. The sentinel + shift-Tab wrap below remain
  // as the fallback for browsers without inert support.
  function setInert(on) {
    try {
      if (!('inert' in HTMLElement.prototype)) return;
      var kids = document.body.children;
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k === overlayHost) continue;
        if (on) {
          if (!k.inert) { k.inert = true; k.setAttribute('data-mirr-inert', ''); }
        } else if (k.hasAttribute('data-mirr-inert')) {
          k.inert = false; k.removeAttribute('data-mirr-inert');
        }
      }
    } catch (e) { /* trap falls back to the sentinels */ }
  }

  function open(ds, trigger) {
    if (!overlayHost) buildOverlay();
    lastTrigger = trigger;
    var q = 'embed=1&product=' + encodeURIComponent(ds.mirrProduct || '');
    if (ds.mirrBrand) q += '&brand=' + encodeURIComponent(ds.mirrBrand);
    if (ds.mirrSize) q += '&size=' + encodeURIComponent(ds.mirrSize);
    iframe.src = BASE + '/brand-demo?' + q;
    overlayHost.shadowRoot.querySelector('.ov').classList.add('open');
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setInert(true);
    closeBtn.focus();
  }

  function close() {
    if (!isOpen()) return;
    overlayHost.shadowRoot.querySelector('.ov').classList.remove('open');
    iframe.src = 'about:blank'; // stop the demo (polling, timers) with the overlay
    setInert(false);
    document.body.style.overflow = prevOverflow;
    if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
    lastTrigger = null;
  }

  // Escape with focus on the overlay's own chrome; Escape pressed INSIDE the
  // iframe can't reach this listener, so the embedded page posts
  // {type:'mirr-embed:close'} up instead (see brand-demo's embed mode).
  document.addEventListener('keydown', safe(function (e) {
    if (e.key === 'Escape' && isOpen()) close();
    // Trap: shift-Tab off the close button (the overlay's first tab stop)
    // wraps to the iframe rather than escaping into the host page.
    if (e.key === 'Tab' && e.shiftKey && isOpen()) {
      var active = overlayHost.shadowRoot.activeElement;
      if (active === closeBtn) { e.preventDefault(); iframe.focus(); }
    }
  }), true);
  window.addEventListener('message', safe(function (ev) {
    if (isOpen() && iframe && ev.source === iframe.contentWindow &&
        ev.data && ev.data.type === 'mirr-embed:close') close();
  }));

  function inject(el) {
    var host = document.createElement('span');
    var sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML =
      '<style>' + BTN_CSS + '</style>' +
      '<button type="button" aria-label="Try it on with Mirr (prototype)">' +
      '👗 TRY IT ON&nbsp;·&nbsp;MIR<span class="flip">R</span></button>';
    sh.querySelector('button').addEventListener('click', safe(function (e) {
      open(el.dataset, e.currentTarget);
    }));
    el.insertAdjacentElement('afterend', host);
  }

  var init = safe(function () {
    var marks = document.querySelectorAll('[data-mirr-product]');
    for (var i = 0; i < marks.length; i++) inject(marks[i]);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
