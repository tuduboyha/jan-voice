/**
 * Jan Voice — homepage data loading.
 */
(async function () {
    'use strict';

    const supabase = window.jv.supabase;

    async function loadStats() {
        const [{ count: issues }, { count: users }, { count: opinions }, { count: comments }] = await Promise.all([
            supabase.from('issues').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
            supabase.from('profiles').select('id', { count: 'exact', head: true }),
            supabase.from('opinions').select('id', { count: 'exact', head: true }),
            supabase.from('comments').select('id', { count: 'exact', head: true }),
        ]);
        document.getElementById('statIssues').textContent = issues || 0;
        document.getElementById('statUsers').textContent = users || 0;
        document.getElementById('statOpinions').textContent = opinions || 0;
        document.getElementById('statComments').textContent = comments || 0;
    }

    async function loadTrending() {
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data } = await supabase
            .from('issues')
            .select('*, profiles(username, avatar_url), issue_categories(name, slug)')
            .eq('status', 'approved')
            .gte('created_at', since)
            .order('views', { ascending: false })
            .limit(6);

        if (data && data.length) {
            document.getElementById('trendingSection').hidden = false;
            await window.jv.renderIssueGrid('#trendingGrid', data);
        }
    }

    async function loadLatest() {
        const { data } = await supabase
            .from('issues')
            .select('*, profiles(username, avatar_url), issue_categories(name, slug)')
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(8);
        await window.jv.renderIssueGrid('#latestGrid', data || []);
    }

    function miniRow(title, slug, countLabel) {
        return `<a class="mini-issue-row" href="issue.html?slug=${encodeURIComponent(slug)}">
            <span>${window.jv.escapeHtml(title)}</span><span class="mini-count">${countLabel}</span>
        </a>`;
    }

    async function loadMostDiscussed() {
        const { data } = await supabase
            .from('issues_with_comment_count')
            .select('title, slug, comment_count')
            .eq('status', 'approved')
            .order('comment_count', { ascending: false })
            .limit(4);
        document.getElementById('mostDiscussedList').innerHTML =
            (data || []).map((i) => miniRow(i.title, i.slug, i.comment_count)).join('');
    }

    async function loadMostSupported() {
        const { data } = await supabase
            .from('issues')
            .select('title, slug, support_count')
            .eq('status', 'approved')
            .order('support_count', { ascending: false })
            .limit(4);
        document.getElementById('mostSupportedList').innerHTML =
            (data || []).map((i) => miniRow(i.title, i.slug, '🟢 ' + i.support_count)).join('');
    }

    async function loadMostOpposed() {
        const { data } = await supabase
            .from('issues')
            .select('title, slug, oppose_count')
            .eq('status', 'approved')
            .order('oppose_count', { ascending: false })
            .limit(4);
        document.getElementById('mostOpposedList').innerHTML =
            (data || []).map((i) => miniRow(i.title, i.slug, '🔴 ' + i.oppose_count)).join('');
    }

    async function loadCategories() {
        const { data: categories } = await supabase
            .from('issue_categories')
            .select('id, name, slug')
            .eq('is_active', true)
            .order('name');

        const { data: issueCats } = await supabase
            .from('issues')
            .select('category_id')
            .eq('status', 'approved');

        const counts = {};
        (issueCats || []).forEach((r) => { if (r.category_id) counts[r.category_id] = (counts[r.category_id] || 0) + 1; });

        document.getElementById('categoryGrid').innerHTML = (categories || [])
            .map((c) => `<a class="category-chip" href="category.html?slug=${encodeURIComponent(c.slug)}">
                <span class="category-chip-name">${window.jv.escapeHtml(c.name)}</span>
                <span class="category-chip-count">${counts[c.id] || 0}</span>
            </a>`)
            .join('');
    }

    async function loadLeaderboardTeaser() {
        if (!window.jv.weeklyLeaderboard) return;
        const top = await window.jv.weeklyLeaderboard(5);
        if (!top.length) return;

        document.getElementById('leaderboardTeaserSection').hidden = false;
        const medals = ['🥇', '🥈', '🥉'];
        document.getElementById('leaderboardTeaser').innerHTML = top.map((u, i) => `
            <a href="profile.html?u=${encodeURIComponent(u.username)}" class="leaderboard-teaser-item glass-card">
                <span class="leaderboard-rank">${medals[i] || '#' + (i + 1)}</span>
                <img src="${window.jv.avatarUrl(u.avatar_url)}" alt="">
                <strong>@${window.jv.escapeHtml(u.username)}</strong>
                <span class="leaderboard-score">${u.score} pts</span>
            </a>
        `).join('');
    }

    await Promise.all([
        loadStats(),
        loadTrending(),
        loadLatest(),
        loadMostDiscussed(),
        loadMostSupported(),
        loadMostOpposed(),
        loadCategories(),
        loadLeaderboardTeaser(),
    ]);
})();
