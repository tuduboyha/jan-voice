/**
 * Jan Voice — shared admin chrome: guard, topbar, nav highlighting,
 * pending-report badge, logout, and a confirm() helper for
 * destructive actions.
 */
window.jv = window.jv || {};

window.jv.initAdminPage = async function (pageKey) {
    const session = await window.jv.requireAdmin();
    if (!session) return null;

    const profile = await window.jv.getProfile(session.user.id);

    document.addEventListener('partialsLoaded', async () => {
        document.getElementById('adminTopbarAvatar').src = window.jv.avatarUrl(profile?.avatar_url);
        document.getElementById('adminTopbarUsername').textContent = profile?.username || '';

        document.querySelectorAll('[data-admin-page]').forEach((a) => {
            a.classList.toggle('active', a.getAttribute('data-admin-page') === pageKey);
        });

        document.getElementById('adminLogoutLink').addEventListener('click', async (e) => {
            e.preventDefault();
            await window.jv.supabase.auth.signOut();
            window.location.href = '../index.html';
        });

        const { count } = await window.jv.supabase
            .from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending');
        if (count) {
            const badge = document.getElementById('adminReportBadge');
            badge.hidden = false;
            badge.textContent = count;
        }
    }, { once: true });

    return { session, profile };
};

window.jv.confirmAction = function (message) {
    return window.confirm(message);
};
