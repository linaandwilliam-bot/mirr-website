// error-report.js — shared last-resort client error reporter (Sprint 28/29).
// One report per unique error message per page session; no PII, no stack
// scraping. A cheap safety net, not an error-monitoring platform.
// Pages include this before their own inline scripts and call
// reportClientError(message, source, line).

(function () {
  'use strict';

  var _reportedErrors = new Set();

  window.reportClientError = function (message, source, line) {
    try {
      var key = String(message || '').slice(0, 200);
      if (!key || _reportedErrors.has(key)) return;
      _reportedErrors.add(key);
      var page = (window.location.pathname.replace(/^\//, '').replace(/\.html$/, '') || 'index');
      var brand = new URLSearchParams(window.location.search).get('brand') || '';
      fetch('https://formspree.io/f/xvznvrdo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          type: 'client-error-report',
          message: key,
          source: (source || 'unknown') + (line ? ':' + line : ''),
          brand: brand,
          page: page,
          timestamp: new Date().toISOString(),
          _subject: 'Client error on ' + page + ' — ' + key.slice(0, 60),
        }),
      }).catch(function () { /* the reporter must never itself throw */ });
    } catch (e) { /* ditto */ }
  };
}());
