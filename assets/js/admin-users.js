/**
 * Jan Voice — admin/users.html: search/filter, change role/status.
 */
(async function () {
    'use strict';

    const ctx = await window.jv.initAdminPage('users');
    if (!ctx) return;
    const supabase = window.jv.supabase;
    const myUserId = ctx.session.user.id;

    const params = new URLSearchParams(window.location.search);
    const search = params.get('search') || '';
    const role = params.get('role') || '';
    const status = params.get('status') || '';
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const perPage = 20;

    async function updateRole(id, newRole) {
        if (id === myUserId) { window.jv.showToast('You cannot change your own role.', 'error'); return render(); }
        const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id);
        window.jv.showToast(error ? error.message : 'User role updated.', error ? 'error' : 'success');
        render();
    }

    async function updateStatus(id, newStatus) {
        if (id === myUserId) { window.jv.showToast('You cannot change your own account status.', 'error'); return render(); }
        const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', id);
        window.jv.showToast(error ? error.message : 'User status updated.', error ? 'error' : 'success');
        render();
    }

    async function render() {
        document.getElementById('adminPageHeading').textContent = 'Manage Users';

        const [{ data: users }, { data: total }] = await Promise.all([
            supabase.rpc('admin_list_users', {
                p_search: search, p_role: role, p_status: status,
                p_limit: perPage, p_offset: (page - 1) * perPage,
            }),
            supabase.rpc('admin_count_users', { p_search: search, p_role: role, p_status: status }),
        ]);

        const content = document.getElementById('adminContent');
        content.innerHTML = `
            <form class="admin-filter-bar" id="filterForm">
                <input type="text" name="search" id="searchInput" value="${window.jv.escapeHtml(search)}" placeholder="Search username or email...">
                <select name="role" id="roleSelect">
                    <option value="">All Roles</option>
                    <option value="user" ${role === 'user' ? 'selected' : ''}>User</option>
                    <option value="moderator" ${role === 'moderator' ? 'selected' : ''}>Moderator</option>
                    <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
                <select name="status" id="statusSelect">
                    <option value="">All Statuses</option>
                    <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="suspended" ${status === 'suspended' ? 'selected' : ''}>Suspended</option>
                    <option value="banned" ${status === 'banned' ? 'selected' : ''}>Banned</option>
                </select>
                <button type="submit" class="btn btn-outline btn-sm">Filter</button>
            </form>
            <div class="glass-card admin-panel-card">
                ${users && users.length ? `
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Posts</th><th>Joined</th><th></th></tr></thead>
                        <tbody>
                            ${users.map((u) => `
                                <tr>
                                    <td><a href="../profile.html?u=${encodeURIComponent(u.username)}" target="_blank">@${window.jv.escapeHtml(u.username)}</a></td>
                                    <td>${window.jv.escapeHtml(u.email)}</td>
                                    <td>
                                        <select class="admin-inline-input role-select" data-id="${u.id}" ${u.id === myUserId ? 'disabled' : ''}>
                                            <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                                            <option value="moderator" ${u.role === 'moderator' ? 'selected' : ''}>Moderator</option>
                                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                                        </select>
                                    </td>
                                    <td>
                                        <select class="admin-inline-input status-select" data-id="${u.id}" ${u.id === myUserId ? 'disabled' : ''}>
                                            <option value="active" ${u.status === 'active' ? 'selected' : ''}>Active</option>
                                            <option value="suspended" ${u.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                                            <option value="banned" ${u.status === 'banned' ? 'selected' : ''}>Banned</option>
                                        </select>
                                    </td>
                                    <td>${u.total_posts}</td>
                                    <td>${window.jv.timeAgo(u.created_at)}</td>
                                    <td>${u.id === myUserId ? '<span class="filter-hint">You</span>' : ''}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="pagination">
                    ${page > 1 ? `<a class="btn btn-outline btn-sm" href="?search=${encodeURIComponent(search)}&role=${role}&status=${status}&page=${page - 1}">← Previous</a>` : ''}
                    ${page * perPage < (total || 0) ? `<a class="btn btn-outline btn-sm" href="?search=${encodeURIComponent(search)}&role=${role}&status=${status}&page=${page + 1}">Next →</a>` : ''}
                </div>` : '<p class="empty-state">No users match these filters.</p>'}
            </div>
        `;

        document.getElementById('filterForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const qs = new URLSearchParams({
                search: document.getElementById('searchInput').value,
                role: document.getElementById('roleSelect').value,
                status: document.getElementById('statusSelect').value,
            }).toString();
            window.location.href = '?' + qs;
        });

        content.querySelectorAll('.role-select').forEach((sel) => {
            sel.addEventListener('change', () => updateRole(sel.getAttribute('data-id'), sel.value));
        });
        content.querySelectorAll('.status-select').forEach((sel) => {
            sel.addEventListener('change', () => updateStatus(sel.getAttribute('data-id'), sel.value));
        });
    }

    window.jv.onPartialsLoaded(render);
})();
