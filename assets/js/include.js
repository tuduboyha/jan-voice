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
        document.dispatchEvent(new CustomEvent('partialsLoaded'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', includeAll);
    } else {
        includeAll();
    }
})();
