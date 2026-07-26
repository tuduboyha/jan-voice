/**
 * Jan Voice — shared issue-card rendering, used by index/category/search/
 * dashboard/profile pages. Mirrors the old views/partials/issue-card.php.
 */
window.jv = window.jv || {};

(function (jv) {
    'use strict';

    const prefix = window.JV_PATH_PREFIX || '';

    /**
     * Batch-fetches comment counts for a list of issue ids in one query
     * (avoids N+1 requests when rendering a grid of cards).
     */
    jv.commentCountsFor = async function (issueIds) {
        if (!issueIds.length) return {};
        const { data } = await jv.supabase
            .from('comments')
            .select('issue_id')
            .in('issue_id', issueIds);
        const counts = {};
        (data || []).forEach((row) => {
            counts[row.issue_id] = (counts[row.issue_id] || 0) + 1;
        });
        return counts;
    };

    jv.bookmarkIdsForCurrentUser = async function () {
        const session = await jv.getSession();
        if (!session) return new Set();
        const { data } = await jv.supabase
            .from('bookmarks')
            .select('issue_id')
            .eq('user_id', session.user.id);
        return new Set((data || []).map((r) => r.issue_id));
    };

    jv.renderIssueCard = function (issue, { commentCount = 0, isBookmarked = false } = {}) {
        const total = (issue.support_count || 0) + (issue.oppose_count || 0);
        const supportPct = total > 0 ? Math.round((issue.support_count / total) * 100) : 50;
        const authorLabel = issue.is_anonymous ? 'Anonymous' : jv.escapeHtml(issue.profiles?.username || 'Unknown');
        const categoryName = issue.issue_categories?.name;

        return `
        <article class="issue-card glass-card">
            <a href="${prefix}issue.html?slug=${encodeURIComponent(issue.slug)}" class="issue-card-image-link">
                <img class="issue-card-image" src="${jv.coverUrl(issue.cover_image)}" alt="${jv.escapeHtml(issue.title)}" loading="lazy">
                ${categoryName ? `<span class="badge badge-category">${jv.escapeHtml(categoryName)}</span>` : ''}
            </a>
            <div class="issue-card-body">
                <h3 class="issue-card-title">
                    <a href="${prefix}issue.html?slug=${encodeURIComponent(issue.slug)}">${jv.escapeHtml(issue.title)}</a>
                </h3>
                <p class="issue-card-summary">${jv.escapeHtml(issue.summary)}</p>
                <div class="issue-card-meta">
                    <span>${authorLabel}</span>
                    <span>&middot;</span>
                    <span>${jv.timeAgo(issue.created_at)}</span>
                    <span>&middot;</span>
                    <span>${issue.views || 0} views</span>
                </div>
                <div class="mini-vote-bar"><div class="mini-vote-fill" style="width: ${supportPct}%"></div></div>
                <div class="issue-card-stats">
                    <span class="stat-support">🟢 ${issue.support_count || 0}</span>
                    <span class="stat-oppose">🔴 ${issue.oppose_count || 0}</span>
                    <span class="stat-comments">💬 ${commentCount}</span>
                </div>
                <div class="issue-card-actions">
                    <a href="${prefix}issue.html?slug=${encodeURIComponent(issue.slug)}" class="btn btn-outline btn-sm">Read More</a>
                    <button type="button" class="icon-btn bookmark-btn${isBookmarked ? ' bookmarked' : ''}" data-issue-id="${issue.id}" aria-label="Bookmark">${isBookmarked ? '🔖' : '🏷️'}</button>
                    <button type="button" class="icon-btn share-btn" data-url="${window.location.origin}${prefix}issue.html?slug=${encodeURIComponent(issue.slug)}" aria-label="Share">🔗</button>
                </div>
            </div>
        </article>`;
    };

    /**
     * Renders a full grid of cards into `container` (a DOM element or
     * selector string), given an array of issue rows.
     */
    jv.renderIssueGrid = async function (container, issues) {
        const el = typeof container === 'string' ? document.querySelector(container) : container;
        if (!el) return;
        if (!issues.length) {
            el.innerHTML = '';
            return;
        }
        const ids = issues.map((i) => i.id);
        const [counts, bookmarked] = await Promise.all([jv.commentCountsFor(ids), jv.bookmarkIdsForCurrentUser()]);
        el.innerHTML = issues
            .map((issue) => jv.renderIssueCard(issue, { commentCount: counts[issue.id] || 0, isBookmarked: bookmarked.has(issue.id) }))
            .join('');
    };

    // Event delegation for bookmark/report buttons on any page that
    // renders issue cards (register once per page load).
    document.addEventListener('click', async (e) => {
        const bookmarkBtn = e.target.closest('.bookmark-btn');
        if (bookmarkBtn) {
            const session = await jv.getSession();
            if (!session) {
                jv.showToast('Please log in to bookmark issues.', 'error');
                setTimeout(() => { window.location.href = prefix + 'login.html'; }, 1200);
                return;
            }
            const issueId = Number(bookmarkBtn.getAttribute('data-issue-id'));
            const { data: existing } = await jv.supabase
                .from('bookmarks').select('id').eq('user_id', session.user.id).eq('issue_id', issueId).maybeSingle();

            if (existing) {
                await jv.supabase.from('bookmarks').delete().eq('id', existing.id);
                bookmarkBtn.classList.remove('bookmarked');
                bookmarkBtn.textContent = bookmarkBtn.textContent.trim().length > 2 ? '🏷️ Bookmark' : '🏷️';
                jv.showToast('Bookmark removed.', 'success');
            } else {
                await jv.supabase.from('bookmarks').insert({ user_id: session.user.id, issue_id: issueId });
                bookmarkBtn.classList.add('bookmarked');
                bookmarkBtn.textContent = bookmarkBtn.textContent.trim().length > 2 ? '🔖 Bookmarked' : '🔖';
                jv.showToast('Issue bookmarked!', 'success');
            }
        }
    });
})(window.jv);
