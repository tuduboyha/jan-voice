/**
 * Jan Voice — search.html: free-text + filters, and an instant
 * suggestions dropdown (issues/categories/users/tags).
 */
(function () {
    'use strict';

    const supabase = window.jv.supabase;
    const params = new URLSearchParams(window.location.search);
    const perPage = 12;

    const term = params.get('q') || '';
    const tag = params.get('tag') || '';
    const categoryId = params.get('category') || '';
    const location = params.get('location') || '';
    const sort = params.get('sort') || 'latest';
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));

    document.getElementById('searchInput').value = term;
    document.getElementById('locationInput').value = location;
    document.getElementById('sortSelect').value = sort;

    async function loadCategoryOptions() {
        const { data } = await supabase.from('issue_categories').select('id, name').eq('is_active', true).order('name');
        const select = document.getElementById('categorySelect');
        (data || []).forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            if (String(c.id) === categoryId) opt.selected = true;
            select.appendChild(opt);
        });
    }

    async function runSearch() {
        if (tag) {
            document.getElementById('tagHint').hidden = false;
            document.getElementById('tagHint').innerHTML = `Showing issues tagged <strong>#${window.jv.escapeHtml(tag)}</strong> — <a href="search.html">clear</a>`;

            const { data: tagRows } = await supabase.from('issue_tags').select('issue_id').eq('tag', tag);
            const ids = (tagRows || []).map((r) => r.issue_id);
            if (!ids.length) return renderResults([]);

            const { data } = await supabase
                .from('issues')
                .select('*, profiles(username, avatar_url), issue_categories(name, slug)')
                .eq('status', 'approved')
                .in('id', ids)
                .order('created_at', { ascending: false });
            return renderResults(data || [], false);
        }

        const table = sort === 'most_discussed' ? 'issues_with_comment_count' : 'issues';
        let query = supabase
            .from(table)
            .select('*, profiles(username, avatar_url), issue_categories(name, slug)')
            .eq('status', 'approved');

        if (term) {
            query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%,description.ilike.%${term}%`);
        }
        if (categoryId) query = query.eq('category_id', categoryId);
        if (location) query = query.ilike('location', `%${location}%`);

        const orderMap = {
            latest: ['created_at', false],
            oldest: ['created_at', true],
            trending: ['views', false],
            most_discussed: ['comment_count', false],
            most_supported: ['support_count', false],
            most_opposed: ['oppose_count', false],
        };
        const [col, asc] = orderMap[sort] || orderMap.latest;
        query = query.order(col, { ascending: asc });

        const from = (page - 1) * perPage;
        query = query.range(from, from + perPage - 1);

        const { data } = await query;
        renderResults(data || [], true);
    }

    async function renderResults(issues, paginate) {
        if (!issues.length) {
            document.getElementById('emptyState').hidden = false;
            return;
        }
        await window.jv.renderIssueGrid('#issueGrid', issues);

        if (paginate) {
            const qs = new URLSearchParams({ q: term, category: categoryId, location, sort }).toString();
            let html = '';
            if (page > 1) html += `<a class="btn btn-outline btn-sm" href="search.html?${qs}&page=${page - 1}">← Previous</a>`;
            if (issues.length === perPage) html += `<a class="btn btn-outline btn-sm" href="search.html?${qs}&page=${page + 1}">Next →</a>`;
            document.getElementById('pagination').innerHTML = html;
        }
    }

    // ---------------- instant suggestions ----------------
    const input = document.getElementById('searchInput');
    const suggestions = document.getElementById('searchSuggestions');
    let debounceTimer = null;

    function section(title, items, toHtml) {
        if (!items.length) return '';
        return `<div class="suggest-section"><h5>${title}</h5>${items.map(toHtml).join('')}</div>`;
    }

    async function loadSuggestions(q) {
        const [{ data: issues }, { data: categories }, { data: users }, { data: tagRows }] = await Promise.all([
            supabase.from('issues').select('title, slug').eq('status', 'approved').ilike('title', `%${q}%`).limit(5),
            supabase.from('issue_categories').select('name, slug').eq('is_active', true).ilike('name', `%${q}%`).limit(5),
            supabase.from('profiles').select('username').ilike('username', `%${q}%`).limit(5),
            supabase.from('issue_tags').select('tag').ilike('tag', `%${q}%`).limit(5),
        ]);

        const uniqueTags = [...new Set((tagRows || []).map((t) => t.tag))];

        const parts = [
            section('Issues', issues || [], (i) => `<a href="issue.html?slug=${encodeURIComponent(i.slug)}">${window.jv.escapeHtml(i.title)}</a>`),
            section('Categories', categories || [], (c) => `<a href="category.html?slug=${encodeURIComponent(c.slug)}">${window.jv.escapeHtml(c.name)}</a>`),
            section('Users', users || [], (u) => `<a href="profile.html?u=${encodeURIComponent(u.username)}">@${window.jv.escapeHtml(u.username)}</a>`),
            section('Tags', uniqueTags, (t) => `<a href="search.html?tag=${encodeURIComponent(t)}">#${window.jv.escapeHtml(t)}</a>`),
        ].join('');

        suggestions.innerHTML = parts || '<p class="suggest-empty">No matches yet.</p>';
        suggestions.hidden = false;
    }

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (q.length < 2) { suggestions.hidden = true; return; }
        debounceTimer = setTimeout(() => loadSuggestions(q), 250);
    });

    document.addEventListener('click', (e) => {
        if (!suggestions.contains(e.target) && e.target !== input) suggestions.hidden = true;
    });

    document.getElementById('searchForm').addEventListener('submit', (e) => {
        e.preventDefault();
        window.location.href = 'search.html?q=' + encodeURIComponent(input.value.trim());
    });

    document.getElementById('filterForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const qs = new URLSearchParams({
            q: term,
            category: document.getElementById('categorySelect').value,
            location: document.getElementById('locationInput').value,
            sort: document.getElementById('sortSelect').value,
        }).toString();
        window.location.href = 'search.html?' + qs;
    });

    loadCategoryOptions();
    runSearch();
})();
