/**
 * Jan Voice — client-side partial includes (replaces PHP's require
 * header.php/footer.php, since a static site has no server templating).
 *
 * Usage: <div data-include="partials/header.html"></div>
 * On a page nested one level deep (e.g. admin/issues.html), set
 * window.JV_PATH_PREFIX = '../' before this script runs, and use
 * data-include="../partials/header.html" — root-relative nav links
 * inside the partial (marked with data-root-link) are automatically
 * rewritten with that same prefix.
 */
(function () {
    'use strict';

    const prefix = window.JV_PATH_PREFIX || '';
    window.jv = window.jv || {};
    window.jv._partialsLoaded = false;

    /**
     * Registers `callback` to run once partials are in the DOM. Unlike a
     * plain `document.addEventListener('partialsLoaded', cb)`, this is
     * safe to call from code that has already done some async work (e.g.
     * awaited a Supabase query) before reaching this line — the
     * 'partialsLoaded' event may have already fired and been missed by
     * the time such code registers a listener. This checks a flag first
     * and calls back immediately if the event already happened.
     */
    window.jv.onPartialsLoaded = function (callback) {
        if (window.jv._partialsLoaded) {
            callback();
        } else {
            document.addEventListener('partialsLoaded', callback, { once: true });
        }
    };

    async function includeAll() {
        const nodes = [...document.querySelectorAll('[data-include]')];
        await Promise.all(nodes.map(async (node) => {
            const url = node.getAttribute('data-include');
            try {
                const res = await fetch(url);
                node.innerHTML = await res.text();
                node.querySelectorAll('[data-root-link]').forEach((link) => {
                    link.setAttribute('href', prefix + link.getAttribute('href'));
                });
            } catch (err) {
                console.error('Failed to include ' + url, err);
            }
        }));
        window.jv._partialsLoaded = true;
        document.dispatchEvent(new CustomEvent('partialsLoaded'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', includeAll);
    } else {
        includeAll();
    }
})();
