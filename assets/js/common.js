/**
 * Jan Voice — shared utilities + nav rendering, loaded on every page
 * after supabase-client.js and include.js.
 */
window.jv = window.jv || {};

(function (jv) {
    'use strict';

    const prefix = window.JV_PATH_PREFIX || '';
    jv.prefix = prefix;

    // ---------------- escaping / formatting ----------------
    jv.escapeHtml = function (str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    };

    jv.timeAgo = function (dateString) {
        const diff = (Date.now() - new Date(dateString).getTime()) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
        if (diff < 31536000) return Math.floor(diff / 2592000) + 'mo ago';
        return Math.floor(diff / 31536000) + 'y ago';
    };

    jv.avatarUrl = function (url) {
        return url || prefix + 'assets/images/default-avatar.png';
    };

    jv.coverUrl = function (url) {
        return url || prefix + 'assets/images/default-cover.png';
    };

    /**
     * Updates <title> and the description/OG/Twitter meta tags after
     * dynamic content loads (e.g. an issue's real title on issue.html).
     * JS-rendered SEO is weaker than server-rendered, but crawlers that
     * execute JS (Googlebot) will still pick this up.
     */
    jv.setPageMeta = function ({ title, description, image, url }) {
        if (title) document.title = title;
        const setMeta = (selector, attr, value) => {
            const el = document.querySelector(selector);
            if (el && value) el.setAttribute(attr, value);
        };
        setMeta('meta[name="description"]', 'content', description);
        setMeta('meta[property="og:title"]', 'content', title);
        setMeta('meta[property="og:description"]', 'content', description);
        setMeta('meta[name="twitter:title"]', 'content', title);
        setMeta('meta[name="twitter:description"]', 'content', description);
        if (image) {
            setMeta('meta[property="og:image"]', 'content', image);
            setMeta('meta[name="twitter:image"]', 'content', image);
        }
        if (url) {
            setMeta('meta[property="og:url"]', 'content', url);
            setMeta('link[rel="canonical"]', 'href', url);
        }
    };

    // ---------------- toasts ----------------
    jv.showToast = function (message, type) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast toast-' + (type || 'success');
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(30px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    };

    // ---------------- auth/session helpers ----------------
    jv.getSession = async function () {
        const { data } = await jv.supabase.auth.getSession();
        return data.session;
    };

    jv.getProfile = async function (userId) {
        const { data } = await jv.supabase.from('profiles').select('*').eq('id', userId).single();
        return data;
    };

    jv.currentProfile = null;

    /**
     * Call from any page that requires a logged-in user. Redirects to
     * login.html (with a return path) if there is no session. RLS is
     * still the real security boundary — this is just UX.
     */
    jv.requireLogin = async function () {
        const session = await jv.getSession();
        if (!session) {
            const returnTo = encodeURIComponent(window.location.pathname.split('/').pop());
            window.location.href = prefix + 'login.html?redirect=' + returnTo;
            return null;
        }
        return session;
    };

    jv.requireAdmin = async function () {
        const session = await jv.requireLogin();
        if (!session) return null;
        const profile = await jv.getProfile(session.user.id);
        if (!profile || profile.role !== 'admin') {
            window.location.href = prefix + 'index.html';
            return null;
        }
        return session;
    };

    // ---------------- nav rendering ----------------
    async function renderCategoriesMenu() {
        const menu = document.getElementById('navCategoryMenu');
        if (!menu) return;
        const { data } = await jv.supabase
            .from('issue_categories')
            .select('name, slug')
            .eq('is_active', true)
            .order('name');
        menu.innerHTML = (data || [])
            .map((c) => `<a href="${prefix}category.html?slug=${encodeURIComponent(c.slug)}">${jv.escapeHtml(c.name)}</a>`)
            .join('');
    }

    async function renderAuthArea() {
        const area = document.getElementById('navAuthArea');
        if (!area) return;

        const session = await jv.getSession();

        if (!session) {
            area.innerHTML = `
                <a href="${prefix}login.html">Login</a>
                <a href="${prefix}register.html" class="btn btn-gradient btn-sm">Sign Up</a>
            `;
            return;
        }

        const profile = await jv.getProfile(session.user.id);
        jv.currentProfile = profile;
        const username = profile ? jv.escapeHtml(profile.username) : '';
        const avatar = jv.avatarUrl(profile?.avatar_url);
        const isAdmin = profile?.role === 'admin';

        const { count: unreadCount } = await jv.supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', session.user.id)
            .eq('is_read', false);

        area.innerHTML = `
            <a href="${prefix}create-issue.html" class="btn btn-gradient btn-sm">+ Post Issue</a>
            <a href="${prefix}dashboard.html">Dashboard</a>
            ${isAdmin ? `<a href="${prefix}admin/index.html">🛠️ Admin</a>` : ''}
            <div class="notif-dropdown" id="notifDropdown">
                <button type="button" class="notif-bell" id="notifBellBtn" aria-label="Notifications">
                    🔔
                    <span class="notif-badge" id="notifBadge" ${unreadCount ? '' : 'hidden'}>${unreadCount || ''}</span>
                </button>
                <div class="nav-dropdown-menu notif-menu" id="notifMenu">
                    <div class="notif-menu-head">
                        <span>Notifications</span>
                        <button type="button" id="notifMarkAllBtn" class="notif-mark-all">Mark all read</button>
                    </div>
                    <div class="notif-list" id="notifList"><p class="notif-empty">Loading...</p></div>
                </div>
            </div>
            <a href="${prefix}profile.html?u=${encodeURIComponent(username)}" class="nav-avatar">
                <img src="${avatar}" alt="${username}">
            </a>
            <button type="button" class="btn btn-outline btn-sm" id="navLogoutBtn">Logout</button>
        `;

        document.getElementById('navLogoutBtn').addEventListener('click', async () => {
            await jv.supabase.auth.signOut();
            window.location.href = prefix + 'index.html';
        });

        wireNotifDropdown(session.user.id);
    }

    function wireNotifDropdown(userId) {
        const bellBtn = document.getElementById('notifBellBtn');
        const menu = document.getElementById('notifMenu');
        const list = document.getElementById('notifList');
        const badge = document.getElementById('notifBadge');
        const markAllBtn = document.getElementById('notifMarkAllBtn');
        if (!bellBtn) return;

        let loaded = false;

        const icons = { reply: '💬', like: '👍', support: '🟢', oppose: '🔴', mention: '📣', system: '🔔' };

        async function load() {
            const { data } = await jv.supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(15);

            if (!data || !data.length) {
                list.innerHTML = '<p class="notif-empty">You have no notifications yet.</p>';
                return;
            }

            list.innerHTML = data.map((n) => `
                <a class="notif-item${n.is_read ? '' : ' unread'}" data-id="${n.id}" href="${n.link ? prefix + n.link.replace(/^\//, '') : '#'}">
                    <span class="notif-icon">${icons[n.type] || '🔔'}</span>
                    <span class="notif-body">
                        <span class="notif-message">${jv.escapeHtml(n.message)}</span>
                        <span class="notif-time">${jv.timeAgo(n.created_at)}</span>
                    </span>
                </a>
            `).join('');
        }

        bellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menu.classList.toggle('open');
            if (isOpen && !loaded) {
                loaded = true;
                load();
            }
        });

        document.addEventListener('click', (e) => {
            if (!document.getElementById('notifDropdown').contains(e.target)) {
                menu.classList.remove('open');
            }
        });

        list.addEventListener('click', async (e) => {
            const item = e.target.closest('.notif-item');
            if (!item) return;
            item.classList.remove('unread');
            await jv.supabase.from('notifications').update({ is_read: true }).eq('id', item.getAttribute('data-id'));
        });

        markAllBtn.addEventListener('click', async () => {
            await jv.supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
            list.querySelectorAll('.notif-item.unread').forEach((el) => el.classList.remove('unread'));
            if (badge) badge.setAttribute('hidden', 'hidden');
            jv.showToast('All notifications marked as read.', 'success');
        });
    }

    function wireChrome() {
        const navToggle = document.getElementById('navToggle');
        const mainNav = document.getElementById('mainNav');
        if (navToggle && mainNav) {
            navToggle.addEventListener('click', () => mainNav.classList.toggle('open'));
        }

        const themeToggle = document.getElementById('themeToggle');
        const root = document.documentElement;
        const savedTheme = localStorage.getItem('jv_theme');
        if (savedTheme) {
            root.setAttribute('data-theme', savedTheme);
            if (themeToggle) themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
        }
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                root.setAttribute('data-theme', next);
                localStorage.setItem('jv_theme', next);
                themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
            });
        }

        const footerYear = document.getElementById('footerYear');
        if (footerYear) footerYear.textContent = new Date().getFullYear();

        const newsletterForm = document.getElementById('newsletterForm');
        if (newsletterForm) {
            newsletterForm.addEventListener('submit', (e) => {
                e.preventDefault();
                jv.showToast('Thanks for subscribing!', 'success');
                newsletterForm.reset();
            });
        }

        document.querySelectorAll('.share-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const url = btn.getAttribute('data-url');
                if (navigator.share) {
                    try { await navigator.share({ url }); } catch (e) { /* cancelled */ }
                } else {
                    await navigator.clipboard.writeText(url);
                    jv.showToast('Link copied to clipboard!', 'success');
                }
            });
        });
    }

    jv.onPartialsLoaded(() => {
        wireChrome();
        renderCategoriesMenu();
        renderAuthArea();
    });

    jv.supabase.auth.onAuthStateChange(() => {
        renderAuthArea();
    });
})(window.jv);
