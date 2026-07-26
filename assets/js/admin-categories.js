/**
 * Jan Voice — admin/categories.html: add/edit/hide/delete categories.
 */
(async function () {
    'use strict';

    const ctx = await window.jv.initAdminPage('categories');
    if (!ctx) return;
    const supabase = window.jv.supabase;

    function slugify(text) {
        return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    async function createCategory(name, icon, description) {
        const { error } = await supabase.from('issue_categories').insert({ name, slug: slugify(name), icon: icon || null, description: description || null });
        window.jv.showToast(error ? error.message : 'Category created.', error ? 'error' : 'success');
        render();
    }

    async function updateCategory(id, name, description) {
        const { error } = await supabase.from('issue_categories').update({ name, description }).eq('id', id);
        window.jv.showToast(error ? error.message : 'Category updated.', error ? 'error' : 'success');
        render();
    }

    async function toggleActive(id, current) {
        await supabase.from('issue_categories').update({ is_active: !current }).eq('id', id);
        render();
    }

    async function remove(id) {
        if (!window.jv.confirmAction('Delete this category? Issues in it will become uncategorized.')) return;
        const { error } = await supabase.from('issue_categories').delete().eq('id', id);
        window.jv.showToast(error ? error.message : 'Category deleted.', error ? 'error' : 'success');
        render();
    }

    async function render() {
        document.getElementById('adminPageHeading').textContent = 'Manage Categories';

        const { data: categories } = await supabase.from('issue_categories').select('*').order('name');
        const { data: issueCats } = await supabase.from('issues').select('category_id').eq('status', 'approved');
        const counts = {};
        (issueCats || []).forEach((r) => { if (r.category_id) counts[r.category_id] = (counts[r.category_id] || 0) + 1; });

        const content = document.getElementById('adminContent');
        content.innerHTML = `
            <div class="glass-card admin-panel-card">
                <h2>Add New Category</h2>
                <form class="stacked-form" id="createForm">
                    <div class="form-row">
                        <label>Name <input type="text" name="name" required minlength="2" maxlength="100" placeholder="e.g. Sports"></label>
                        <label>Icon keyword <input type="text" name="icon" maxlength="50" placeholder="e.g. football"></label>
                    </div>
                    <label>Description <input type="text" name="description" maxlength="255" placeholder="Short description shown on category pages"></label>
                    <div class="form-actions"><button type="submit" class="btn btn-gradient btn-sm">Add Category</button></div>
                </form>
            </div>
            <div class="glass-card admin-panel-card">
                <h2>All Categories</h2>
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead><tr><th>Name</th><th>Slug</th><th>Description</th><th>Issues</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>
                            ${(categories || []).map((c) => `
                                <tr>
                                    <td><input type="text" class="admin-inline-input name-input" data-id="${c.id}" value="${window.jv.escapeHtml(c.name)}"></td>
                                    <td>${window.jv.escapeHtml(c.slug)}</td>
                                    <td><input type="text" class="admin-inline-input desc-input" data-id="${c.id}" value="${window.jv.escapeHtml(c.description || '')}"></td>
                                    <td>${counts[c.id] || 0}</td>
                                    <td><span class="status-badge ${c.is_active ? 'status-approved' : 'status-rejected'}">${c.is_active ? 'Active' : 'Hidden'}</span></td>
                                    <td class="admin-actions">
                                        <button class="btn btn-outline btn-sm" data-action="save" data-id="${c.id}">Save</button>
                                        <button class="btn btn-outline btn-sm" data-action="toggle" data-id="${c.id}" data-current="${c.is_active}">${c.is_active ? 'Hide' : 'Show'}</button>
                                        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${c.id}">Delete</button>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('createForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target;
            createCategory(form.name.value.trim(), form.icon.value.trim(), form.description.value.trim());
        });

        content.querySelectorAll('[data-action="save"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const name = content.querySelector(`.name-input[data-id="${id}"]`).value.trim();
                const description = content.querySelector(`.desc-input[data-id="${id}"]`).value.trim();
                updateCategory(id, name, description);
            });
        });
        content.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
            btn.addEventListener('click', () => toggleActive(btn.getAttribute('data-id'), btn.getAttribute('data-current') === 'true'));
        });
        content.querySelectorAll('[data-action="delete"]').forEach((btn) => {
            btn.addEventListener('click', () => remove(btn.getAttribute('data-id')));
        });
    }

    window.jv.onPartialsLoaded(render);
})();
