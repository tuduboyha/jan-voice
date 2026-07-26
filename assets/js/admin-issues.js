/**
 * Jan Voice — admin/issues.html: approve/reject/feature/delete.
 */
(async function () {
    'use strict';

    const ctx = await window.jv.initAdminPage('issues');
    if (!ctx) return;
    const supabase = window.jv.supabase;

    const params = new URLSearchParams(window.location.search);
    let status = params.get('status') || '';
    let categoryId = params.get('category') || '';
    let search = params.get('search') || '';
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const perPage = 20;

    async function loadCategoryOptions(select) {
        const { data } = await supabase.from('issue_categories').select('id, name').order('name');
        (data || []).forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            if (String(c.id) === categoryId) opt.selected = true;
            select.appendChild(opt);
        });
    }

    async function loadIssues() {
        let query = supabase
            .from('issues')
            .select('*, profiles(username), issue_categories(name)', { count: 'exact' });
        if (status) query = query.eq('status', status);
        if (categoryId) query = query.eq('category_id', categoryId);
        if (search) query = query.ilike('title', `%${search}%`);
        query = query.order('created_at', { ascending: false }).range((page - 1) * perPage, page * perPage - 1);

        const { data, count } = await query;
        return { issues: data || [], total: count || 0 };
    }

    async function approve(id) {
        await supabase.from('issues').update({ status: 'approved' }).eq('id', id);
        window.jv.showToast('Issue approved.', 'success');
        render();
    }
    async function reject(id) {
        await supabase.from('issues').update({ status: 'rejected' }).eq('id', id);
        window.jv.showToast('Issue rejected.', 'success');
        render();
    }
    async function toggleFeatured(id, current) {
        await supabase.from('issues').update({ is_featured: !current }).eq('id', id);
        render();
    }
    async function remove(id) {
        if (!window.jv.confirmAction('Permanently delete this issue and all its comments/opinions?')) return;
        await supabase.from('issues').delete().eq('id', id);
        window.jv.showToast('Issue deleted permanently.', 'success');
        render();
    }

    async function render() {
        document.getElementById('adminPageHeading').textContent = 'Manage Issues';
        const { issues, total } = await loadIssues();

        const content = document.getElementById('adminContent');
        content.innerHTML = `
            <form class="admin-filter-bar" id="filterForm">
                <input type="text" name="search" id="searchInput" value="${window.jv.escapeHtml(search)}" placeholder="Search by title...">
                <select name="status" id="statusSelect">
                    <option value="">All Statuses</option>
                    <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="approved" ${status === 'approved' ? 'selected' : ''}>Approved</option>
                    <option value="rejected" ${status === 'rejected' ? 'selected' : ''}>Rejected</option>
                </select>
                <select name="category" id="categorySelect"><option value="">All Categories</option></select>
                <button type="submit" class="btn btn-outline btn-sm">Filter</button>
            </form>
            <div class="glass-card admin-panel-card">
                ${issues.length ? `
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Status</th><th>Support/Oppose</th><th>Submitted</th><th>Actions</th></tr></thead>
                        <tbody>
                            ${issues.map((i) => `
                                <tr>
                                    <td><a href="../issue.html?slug=${encodeURIComponent(i.slug)}" target="_blank">${window.jv.escapeHtml(i.title)}</a>${i.is_featured ? ' ⭐' : ''}</td>
                                    <td>${i.is_anonymous ? 'Anonymous' : window.jv.escapeHtml(i.profiles?.username || '—')}</td>
                                    <td>${window.jv.escapeHtml(i.issue_categories?.name || '—')}</td>
                                    <td><span class="status-badge status-${i.status}">${i.status[0].toUpperCase() + i.status.slice(1)}</span></td>
                                    <td>🟢 ${i.support_count} / 🔴 ${i.oppose_count}</td>
                                    <td>${window.jv.timeAgo(i.created_at)}</td>
                                    <td class="admin-actions">
                                        ${i.status !== 'approved' ? `<button class="btn btn-success btn-sm" data-action="approve" data-id="${i.id}">Approve</button>` : ''}
                                        ${i.status !== 'rejected' ? `<button class="btn btn-outline btn-sm" data-action="reject" data-id="${i.id}">Reject</button>` : ''}
                                        <button class="btn btn-outline btn-sm" data-action="feature" data-id="${i.id}" data-current="${i.is_featured}">${i.is_featured ? 'Unfeature' : 'Feature'}</button>
                                        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${i.id}">Delete</button>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="pagination">
                    ${page > 1 ? `<a class="btn btn-outline btn-sm" href="?status=${status}&category=${categoryId}&search=${encodeURIComponent(search)}&page=${page - 1}">← Previous</a>` : ''}
                    ${page * perPage < total ? `<a class="btn btn-outline btn-sm" href="?status=${status}&category=${categoryId}&search=${encodeURIComponent(search)}&page=${page + 1}">Next →</a>` : ''}
                </div>` : '<p class="empty-state">No issues match these filters.</p>'}
            </div>
        `;

        await loadCategoryOptions(document.getElementById('categorySelect'));
        document.getElementById('statusSelect').value = status;

        document.getElementById('filterForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const qs = new URLSearchParams({
                status: document.getElementById('statusSelect').value,
                category: document.getElementById('categorySelect').value,
                search: document.getElementById('searchInput').value,
            }).toString();
            window.location.href = '?' + qs;
        });

        content.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = Number(btn.getAttribute('data-id'));
                const action = btn.getAttribute('data-action');
                if (action === 'approve') approve(id);
                else if (action === 'reject') reject(id);
                else if (action === 'feature') toggleFeatured(id, btn.getAttribute('data-current') === 'true');
                else if (action === 'delete') remove(id);
            });
        });
    }

    document.addEventListener('partialsLoaded', render, { once: true });
})();
