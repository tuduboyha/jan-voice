/**
 * Jan Voice — admin/index.html: site analytics dashboard.
 */
(async function () {
    'use strict';

    const ctx = await window.jv.initAdminPage('dashboard');
    if (!ctx) return;
    const supabase = window.jv.supabase;

    const [
        { count: totalUsers },
        { count: approvedCount },
        { count: pendingCount },
        { count: rejectedCount },
        { count: totalOpinions },
        { count: totalComments },
        { count: pendingReports },
    ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('issues').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('issues').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('issues').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
        supabase.from('opinions').select('id', { count: 'exact', head: true }),
        supabase.from('comments').select('id', { count: 'exact', head: true }),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    const { data: recentPending } = await supabase
        .from('issues')
        .select('title, slug, is_anonymous, created_at, profiles(username), issue_categories(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

    window.jv.onPartialsLoaded(() => {
        document.getElementById('adminPageHeading').textContent = 'Site Analytics';
        document.getElementById('adminContent').innerHTML = `
            <div class="admin-stat-grid">
                <div class="glass-card admin-stat"><strong>${totalUsers || 0}</strong><span>Total Users</span></div>
                <div class="glass-card admin-stat"><strong>${approvedCount || 0}</strong><span>Approved Issues</span></div>
                <div class="glass-card admin-stat"><strong>${pendingCount || 0}</strong><span>Pending Issues</span></div>
                <div class="glass-card admin-stat"><strong>${rejectedCount || 0}</strong><span>Rejected Issues</span></div>
                <div class="glass-card admin-stat"><strong>${totalOpinions || 0}</strong><span>Total Opinions</span></div>
                <div class="glass-card admin-stat"><strong>${totalComments || 0}</strong><span>Total Comments</span></div>
                <div class="glass-card admin-stat admin-stat-alert"><strong>${pendingReports || 0}</strong><span>Pending Reports</span></div>
            </div>
            <div class="glass-card admin-panel-card">
                <div class="section-head"><h2>Issues Awaiting Approval</h2><a href="issues.html?status=pending" class="section-link icon-label">View all ${window.jv.iconHtml('chevron-right')}</a></div>
                ${recentPending && recentPending.length ? `
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Submitted</th><th></th></tr></thead>
                        <tbody>
                            ${recentPending.map((i) => `
                                <tr>
                                    <td><a href="../issue.html?slug=${encodeURIComponent(i.slug)}" target="_blank">${window.jv.escapeHtml(i.title)}</a></td>
                                    <td>${i.is_anonymous ? 'Anonymous' : window.jv.escapeHtml(i.profiles?.username || '—')}</td>
                                    <td>${window.jv.escapeHtml(i.issue_categories?.name || '—')}</td>
                                    <td>${window.jv.timeAgo(i.created_at)}</td>
                                    <td><a href="issues.html?status=pending" class="btn btn-outline btn-sm">Review</a></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>` : '<p class="empty-state">No issues waiting for review.</p>'}
            </div>
        `;
    });
})();
