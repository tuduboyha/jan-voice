/**
 * Jan Voice — admin/reports.html: pending report queue.
 */
(async function () {
    'use strict';

    const ctx = await window.jv.initAdminPage('reports');
    if (!ctx) return;
    const supabase = window.jv.supabase;

    async function dismiss(reportId, type, contentId) {
        await supabase.from('reports').update({ status: 'dismissed' }).eq('id', reportId);
        if (type === 'comment') await supabase.from('comments').update({ is_reported: false }).eq('id', contentId);
        if (type === 'reply') await supabase.from('replies').update({ is_reported: false }).eq('id', contentId);
        window.jv.showToast('Report dismissed.', 'success');
        render();
    }

    async function deleteContent(reportId, type, contentId) {
        if (!window.jv.confirmAction('Permanently delete this reported content?')) return;
        if (type === 'issue') await supabase.from('issues').delete().eq('id', contentId);
        else if (type === 'comment') await supabase.from('comments').delete().eq('id', contentId);
        else if (type === 'reply') await supabase.from('replies').delete().eq('id', contentId);
        await supabase.from('reports').update({ status: 'reviewed' }).eq('id', reportId);
        window.jv.showToast('Reported content removed and report resolved.', 'success');
        render();
    }

    async function loadPreviews(reports) {
        const byType = { issue: [], comment: [], reply: [] };
        reports.forEach((r) => byType[r.reportable_type].push(r.reportable_id));

        const previews = {};

        if (byType.issue.length) {
            const { data } = await supabase.from('issues').select('id, title, slug').in('id', byType.issue);
            (data || []).forEach((i) => { previews['issue:' + i.id] = { text: i.title, slug: i.slug }; });
        }
        if (byType.comment.length) {
            const { data } = await supabase.from('comments').select('id, body, issues(slug)').in('id', byType.comment);
            (data || []).forEach((c) => { previews['comment:' + c.id] = { text: c.body, slug: c.issues?.slug }; });
        }
        if (byType.reply.length) {
            const { data } = await supabase.from('replies').select('id, body, comments(issues(slug))').in('id', byType.reply);
            (data || []).forEach((r) => { previews['reply:' + r.id] = { text: r.body, slug: r.comments?.issues?.slug }; });
        }

        return previews;
    }

    async function render() {
        document.getElementById('adminPageHeading').textContent = 'Community Reports';

        const { data: reports } = await supabase
            .from('reports')
            .select('*, profiles(username)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(100);

        const content = document.getElementById('adminContent');

        if (!reports || !reports.length) {
            content.innerHTML = '<div class="glass-card admin-panel-card"><p class="empty-state">No pending reports. The community is behaving. 🎉</p></div>';
            return;
        }

        const previews = await loadPreviews(reports);

        content.innerHTML = `
            <div class="glass-card admin-panel-card">
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead><tr><th>Type</th><th>Content Preview</th><th>Reported By</th><th>Reason</th><th>Reported</th><th>Actions</th></tr></thead>
                        <tbody>
                            ${reports.map((r) => {
                                const preview = previews[r.reportable_type + ':' + r.reportable_id];
                                return `
                                <tr>
                                    <td><span class="status-badge status-pending">${r.reportable_type[0].toUpperCase() + r.reportable_type.slice(1)}</span></td>
                                    <td class="report-preview">${preview
                                        ? `<a href="../issue.html?slug=${encodeURIComponent(preview.slug)}" target="_blank">${window.jv.escapeHtml(preview.text.slice(0, 120))}</a>`
                                        : '<em>Content no longer exists.</em>'}</td>
                                    <td>@${window.jv.escapeHtml(r.profiles?.username || 'unknown')}</td>
                                    <td>${window.jv.escapeHtml(r.reason)}</td>
                                    <td>${window.jv.timeAgo(r.created_at)}</td>
                                    <td class="admin-actions">
                                        <button class="btn btn-outline btn-sm" data-action="dismiss" data-id="${r.id}" data-type="${r.reportable_type}" data-content="${r.reportable_id}">Dismiss</button>
                                        ${preview ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}" data-type="${r.reportable_type}" data-content="${r.reportable_id}">Delete Content</button>` : ''}
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        content.querySelectorAll('[data-action="dismiss"]').forEach((btn) => {
            btn.addEventListener('click', () => dismiss(btn.getAttribute('data-id'), btn.getAttribute('data-type'), btn.getAttribute('data-content')));
        });
        content.querySelectorAll('[data-action="delete"]').forEach((btn) => {
            btn.addEventListener('click', () => deleteContent(btn.getAttribute('data-id'), btn.getAttribute('data-type'), btn.getAttribute('data-content')));
        });
    }

    document.addEventListener('partialsLoaded', render, { once: true });
})();
