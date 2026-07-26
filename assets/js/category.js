/**
 * Jan Voice — category.html: issues filtered by category, paginated.
 */
(async function () {
    'use strict';

    const supabase = window.jv.supabase;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug') || '';
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const perPage = 12;

    if (!slug) {
        document.getElementById('categoryTitle').textContent = 'Category not found';
        return;
    }

    const { data: category } = await supabase
        .from('issue_categories')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

    if (!category) {
        document.getElementById('categoryTitle').textContent = 'Category not found';
        return;
    }

    document.getElementById('categoryBadge').textContent = category.name;
    document.getElementById('categoryTitle').textContent = category.name + ' Issues';
    document.getElementById('categoryDescription').textContent = category.description || '';
    window.jv.setPageMeta({
        title: category.name + ' Issues — Jan Voice',
        description: category.description || `Explore issues related to ${category.name} on Jan Voice.`,
    });

    const from = (page - 1) * perPage;
    const { data: issues } = await supabase
        .from('issues')
        .select('*, profiles(username, avatar_url), issue_categories(name, slug)')
        .eq('status', 'approved')
        .eq('category_id', category.id)
        .order('created_at', { ascending: false })
        .range(from, from + perPage - 1);

    const list = issues || [];
    if (!list.length) {
        document.getElementById('emptyState').hidden = false;
    } else {
        await window.jv.renderIssueGrid('#issueGrid', list);
    }

    const pagination = document.getElementById('pagination');
    let html = '';
    if (page > 1) html += `<a class="btn btn-outline btn-sm icon-label" href="category.html?slug=${slug}&page=${page - 1}">${window.jv.iconHtml('chevron-left')} Previous</a>`;
    if (list.length === perPage) html += `<a class="btn btn-outline btn-sm icon-label" href="category.html?slug=${slug}&page=${page + 1}">Next ${window.jv.iconHtml('chevron-right')}</a>`;
    pagination.innerHTML = html;
})();
