/**
 * Jan Voice — dashboard.html: tabbed user dashboard.
 */
(async function () {
    'use strict';

    const supabase = window.jv.supabase;
    const session = await window.jv.requireLogin();
    if (!session) return;

    const profile = await window.jv.getProfile(session.user.id);
    document.getElementById('dashAvatar').src = window.jv.avatarUrl(profile?.avatar_url);
    document.getElementById('dashUsername').textContent = profile?.username || '';
    document.getElementById('dashEmail').textContent = session.user.email;

    document.getElementById('dashLogoutLink').addEventListener('click', async (e) => {
        e.preventDefault();
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    });

    const content = document.getElementById('dashboardContent');
    const validTabs = ['my-issues', 'my-opinions', 'bookmarks', 'notifications', 'settings', 'security'];

    function currentTab() {
        const t = new URLSearchParams(window.location.search).get('tab');
        return validTabs.includes(t) ? t : 'my-issues';
    }

    function setActiveNav(tab) {
        document.querySelectorAll('.dashboard-nav a[data-tab]').forEach((a) => {
            a.classList.toggle('active', a.getAttribute('data-tab') === tab);
        });
    }

    document.querySelectorAll('.dashboard-nav a[data-tab]').forEach((a) => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = a.getAttribute('data-tab');
            history.pushState(null, '', '?tab=' + tab);
            renderTab(tab);
        });
    });

    async function renderTab(tab) {
        setActiveNav(tab);
        content.innerHTML = '<p>Loading...</p>';

        if (tab === 'my-issues') return renderMyIssues();
        if (tab === 'my-opinions') return renderMyOpinions();
        if (tab === 'bookmarks') return renderBookmarks();
        if (tab === 'notifications') return renderNotifications();
        if (tab === 'settings') return renderSettings();
        if (tab === 'security') return renderSecurity();
    }

    async function renderMyIssues() {
        const { data } = await supabase
            .from('issues').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });

        if (!data || !data.length) {
            content.innerHTML = '<h2>My Issues</h2><p class="empty-state">You haven\'t raised any issues yet. <a href="create-issue.html">Raise your first issue.</a></p>';
            return;
        }

        content.innerHTML = '<h2>My Issues</h2><div class="dash-list">' + data.map((issue) => `
            <div class="dash-row glass-card">
                <div>
                    <a href="issue.html?slug=${encodeURIComponent(issue.slug)}" class="dash-row-title">${window.jv.escapeHtml(issue.title)}</a>
                    <div class="dash-row-meta">
                        <span class="status-badge status-${issue.status}">${issue.status[0].toUpperCase() + issue.status.slice(1)}</span>
                        <span>${window.jv.timeAgo(issue.created_at)}</span>
                        <span class="icon-label">${window.jv.iconHtml('eye')} ${issue.views}</span>
                        <span class="icon-label">${window.jv.iconHtml('dot', 'jv-icon-support')} ${issue.support_count}</span>
                        <span class="icon-label">${window.jv.iconHtml('dot', 'jv-icon-oppose')} ${issue.oppose_count}</span>
                    </div>
                </div>
            </div>`).join('') + '</div>';
    }

    async function renderMyOpinions() {
        const { data } = await supabase
            .from('opinions')
            .select('side, created_at, issues(title, slug)')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        if (!data || !data.length) {
            content.innerHTML = '<h2>My Opinions</h2><p class="empty-state">You haven\'t taken a side on any issue yet. <a href="search.html">Explore issues to weigh in.</a></p>';
            return;
        }

        content.innerHTML = '<h2>My Opinions</h2><div class="dash-list">' + data.map((op) => `
            <div class="dash-row glass-card">
                <div>
                    <a href="issue.html?slug=${encodeURIComponent(op.issues.slug)}" class="dash-row-title">${window.jv.escapeHtml(op.issues.title)}</a>
                    <div class="dash-row-meta">
                        <span class="badge badge-${op.side} icon-label">${op.side === 'support' ? window.jv.iconHtml('dot', 'jv-icon-support') + ' Support' : window.jv.iconHtml('dot', 'jv-icon-oppose') + ' Oppose'}</span>
                        <span>${window.jv.timeAgo(op.created_at)}</span>
                    </div>
                </div>
            </div>`).join('') + '</div>';
    }

    async function renderBookmarks() {
        const { data } = await supabase
            .from('bookmarks')
            .select('issues(*, profiles(username, avatar_url), issue_categories(name, slug))')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        const issues = (data || []).map((b) => b.issues).filter(Boolean);
        content.innerHTML = '<h2>Bookmarked Issues</h2><div class="issue-grid" id="bookmarksGrid"></div>' +
            (issues.length ? '' : `<p class="empty-state icon-label">No bookmarks yet. Tap the ${window.jv.iconHtml('bookmark-filled')} icon on any issue to save it here.</p>`);
        if (issues.length) await window.jv.renderIssueGrid('#bookmarksGrid', issues);
    }

    async function renderNotifications() {
        const { data } = await supabase
            .from('notifications').select('*').eq('user_id', session.user.id)
            .order('created_at', { ascending: false }).limit(50);

        content.innerHTML = `
            <div class="section-head"><h2>Notifications</h2><button type="button" class="notif-mark-all" id="dashMarkAllRead">Mark all read</button></div>
            <div class="dash-list" id="dashNotifList"></div>
            <p class="empty-state" id="notifEmpty" hidden>You have no notifications yet.</p>
        `;

        if (!data || !data.length) {
            document.getElementById('notifEmpty').hidden = false;
            return;
        }

        document.getElementById('dashNotifList').innerHTML = data.map((n) => `
            <a href="${n.link ? n.link.replace(/^\//, '') : '#'}" class="dash-row glass-card notif-row ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
                <span>${window.jv.escapeHtml(n.message)}</span>
                <span class="dash-row-meta">${window.jv.timeAgo(n.created_at)}</span>
            </a>
        `).join('');

        document.getElementById('dashNotifList').addEventListener('click', (e) => {
            const row = e.target.closest('.notif-row');
            if (!row) return;
            row.classList.remove('unread');
            supabase.from('notifications').update({ is_read: true }).eq('id', row.getAttribute('data-id'));
        });

        document.getElementById('dashMarkAllRead').addEventListener('click', async () => {
            await supabase.from('notifications').update({ is_read: true }).eq('user_id', session.user.id).eq('is_read', false);
            document.querySelectorAll('.notif-row.unread').forEach((el) => el.classList.remove('unread'));
            window.jv.showToast('All notifications marked as read.', 'success');
        });
    }

    function renderSettings() {
        content.innerHTML = `
            <h2>Profile Settings</h2>
            <div class="glass-card form-card">
                <form class="stacked-form" id="settingsForm">
                    <label>Bio
                        <textarea name="bio" rows="3" maxlength="500" placeholder="Tell the community about yourself">${window.jv.escapeHtml(profile?.bio || '')}</textarea>
                    </label>
                    <label>Location
                        <input type="text" name="location" value="${window.jv.escapeHtml(profile?.location || '')}" placeholder="e.g. Mumbai, India">
                    </label>
                    <label>Avatar
                        <input type="file" name="avatar" accept="image/jpeg,image/png,image/webp">
                    </label>
                    <div class="form-actions"><button type="submit" class="btn btn-gradient">Save Changes</button></div>
                </form>
            </div>
        `;

        document.getElementById('settingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const bio = form.bio.value.trim();
            const location = form.location.value.trim();
            const file = form.avatar.files[0];
            const btn = form.querySelector('button');
            btn.disabled = true;

            let avatarUrl = profile?.avatar_url;
            if (file) {
                const ext = file.name.split('.').pop();
                const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
                const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file);
                if (uploadError) {
                    window.jv.showToast('Avatar upload failed: ' + uploadError.message, 'error');
                    btn.disabled = false;
                    return;
                }
                avatarUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
            }

            const { error } = await supabase.from('profiles').update({ bio, location, avatar_url: avatarUrl }).eq('id', session.user.id);
            btn.disabled = false;

            if (error) { window.jv.showToast(error.message, 'error'); return; }
            profile.bio = bio; profile.location = location; profile.avatar_url = avatarUrl;
            document.getElementById('dashAvatar').src = window.jv.avatarUrl(avatarUrl);
            window.jv.showToast('Profile updated successfully.', 'success');
        });
    }

    function renderSecurity() {
        content.innerHTML = `
            <h2>Security</h2>
            <div class="glass-card form-card">
                <form class="stacked-form" id="securityForm">
                    <label>Current Password
                        <input type="password" name="current_password" required>
                    </label>
                    <label>New Password
                        <input type="password" name="new_password" required minlength="8">
                    </label>
                    <label>Confirm New Password
                        <input type="password" name="confirm_password" required minlength="8">
                    </label>
                    <div class="form-actions"><button type="submit" class="btn btn-gradient">Update Password</button></div>
                </form>
            </div>
        `;

        document.getElementById('securityForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const current = form.current_password.value;
            const newPass = form.new_password.value;
            const confirm = form.confirm_password.value;

            if (newPass !== confirm || newPass.length < 8) {
                window.jv.showToast('New passwords must match and be at least 8 characters.', 'error');
                return;
            }

            const btn = form.querySelector('button');
            btn.disabled = true;

            const { error: verifyError } = await supabase.auth.signInWithPassword({ email: session.user.email, password: current });
            if (verifyError) {
                window.jv.showToast('Current password is incorrect.', 'error');
                btn.disabled = false;
                return;
            }

            const { error } = await supabase.auth.updateUser({ password: newPass });
            btn.disabled = false;

            if (error) { window.jv.showToast(error.message, 'error'); return; }
            window.jv.showToast('Password updated successfully.', 'success');
            form.reset();
        });
    }

    renderTab(currentTab());
})();
