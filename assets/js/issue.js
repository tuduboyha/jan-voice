/**
 * Jan Voice — issue.html: the core Support/Oppose gate + split
 * discussion feature. Every write here goes straight to Supabase;
 * RLS + Postgres triggers (see database/*.sql) enforce the rules
 * that used to live in PHP controllers (side is never trusted from
 * the client, a stance is permanent, profanity is blocked, etc).
 */
(async function () {
    'use strict';

    const supabase = window.jv.supabase;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug') || '';

    let issue = null;
    let session = null;
    let userSide = null;

    function friendlyError(error) {
        if (!error) return 'Something went wrong.';
        if (error.message?.includes('profanity_detected')) {
            return 'Your submission contains language that violates our Community Guidelines.';
        }
        if (error.message?.includes('no_stance')) {
            return 'Choose Support or Oppose before commenting.';
        }
        if (error.code === '23505') {
            return 'You have already done that.';
        }
        return error.message || 'Something went wrong.';
    }

    async function loadIssue() {
        session = await window.jv.getSession();

        const { data, error } = await supabase
            .from('issues')
            .select('*, profiles(id, username, avatar_url), issue_categories(name, slug)')
            .eq('slug', slug)
            .maybeSingle();

        if (error || !data) return showNotFound();

        const isOwner = session && session.user.id === data.user_id;
        let isAdmin = false;
        if (session) {
            const profile = await window.jv.getProfile(session.user.id);
            isAdmin = profile?.role === 'admin';
        }

        if (data.status !== 'approved' && !isOwner && !isAdmin) return showNotFound();

        issue = data;
        document.getElementById('issueDetail').hidden = false;

        markViewed();
        renderIssue();
        loadStats();
        loadTags();
        loadRelated();

        if (session) {
            const { data: opinion } = await supabase
                .from('opinions').select('side').eq('issue_id', issue.id).eq('user_id', session.user.id).maybeSingle();
            userSide = opinion?.side || null;
        }
        renderStanceUi();
        wireStanceButtons();
        wireIssueActions();
        loadComments();
    }

    function showNotFound() {
        document.getElementById('notFoundState').hidden = false;
    }

    function markViewed() {
        const key = 'jv_viewed_' + issue.id;
        if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            supabase.rpc('increment_issue_views', { p_issue_id: issue.id });
            issue.views = (issue.views || 0) + 1;
        }
    }

    function renderIssue() {
        const authorLabel = issue.is_anonymous ? 'Anonymous' : window.jv.escapeHtml(issue.profiles?.username || 'Unknown');
        const categoryName = issue.issue_categories?.name;
        const cover = window.jv.coverUrl(issue.cover_image);
        const pageUrl = window.location.href;

        document.getElementById('issueHero').style.backgroundImage =
            `linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.6)), url('${cover}')`;

        if (categoryName) {
            const badge = document.getElementById('issueCategoryBadge');
            badge.hidden = false;
            badge.textContent = categoryName;
        }

        document.getElementById('issueTitle').textContent = issue.title;
        document.getElementById('issueMeta').innerHTML = `
            <span>${authorLabel}</span><span>&middot;</span>
            <span>${new Date(issue.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span>&middot;</span><span>${issue.views || 0} views</span>
            ${issue.location ? `<span>&middot;</span><span>📍 ${window.jv.escapeHtml(issue.location)}</span>` : ''}
        `;

        document.getElementById('issueDescription').textContent = issue.description;

        if (issue.source_links) {
            const el = document.getElementById('sourceLinks');
            el.hidden = false;
            el.innerHTML = '<strong>Source:</strong> ' + window.jv.escapeHtml(issue.source_links);
        }

        if (issue.status === 'pending') document.getElementById('pendingBanner').hidden = false;

        document.title = issue.title + ' — Jan Voice';
        window.jv.setPageMeta({
            title: issue.title + ' — Jan Voice',
            description: issue.summary,
            image: cover,
            url: pageUrl,
        });

        const shareBtn = document.getElementById('shareBtn');
        shareBtn.setAttribute('data-url', pageUrl);
        const bookmarkBtn = document.getElementById('bookmarkBtn');
        bookmarkBtn.setAttribute('data-issue-id', issue.id);
        checkBookmarked(bookmarkBtn);
    }

    async function checkBookmarked(btn) {
        if (!session) return;
        const { data } = await supabase.from('bookmarks').select('id').eq('user_id', session.user.id).eq('issue_id', issue.id).maybeSingle();
        if (data) {
            btn.classList.add('bookmarked');
            btn.textContent = '🔖 Bookmarked';
        }
    }

    async function loadTags() {
        const { data } = await supabase.from('issue_tags').select('tag').eq('issue_id', issue.id);
        document.getElementById('tagList').innerHTML = (data || [])
            .map((t) => `<span class="tag-chip">#${window.jv.escapeHtml(t.tag)}</span>`).join('');
    }

    async function loadRelated() {
        if (!issue.category_id) return;
        const { data } = await supabase
            .from('issues').select('title, slug')
            .eq('status', 'approved').eq('category_id', issue.category_id).neq('id', issue.id)
            .order('created_at', { ascending: false }).limit(4);
        if (data && data.length) {
            document.getElementById('relatedIssuesBox').hidden = false;
            document.getElementById('relatedIssuesList').innerHTML = data
                .map((r) => `<a class="mini-issue-row" href="issue.html?slug=${encodeURIComponent(r.slug)}"><span>${window.jv.escapeHtml(r.title)}</span></a>`)
                .join('');
        }
    }

    async function loadStats() {
        const support = issue.support_count || 0;
        const oppose = issue.oppose_count || 0;
        const total = support + oppose;
        const supportPct = total > 0 ? Math.round((support / total) * 100) : 0;
        const opposePct = total > 0 ? Math.round((oppose / total) * 100) : 0;

        document.getElementById('supportPct').textContent = supportPct + '%';
        document.getElementById('opposePct').textContent = opposePct + '%';
        document.getElementById('voteProgressFill').style.width = supportPct + '%';
        document.getElementById('supportCount').textContent = support;
        document.getElementById('opposeCount').textContent = oppose;

        const { count } = await supabase.from('opinions').select('id', { count: 'exact', head: true }).eq('issue_id', issue.id);
        document.getElementById('participantCount').textContent = count || 0;
    }

    function renderStanceUi() {
        const gate = document.getElementById('stanceGate');
        const banner = document.getElementById('stanceConfirmedBanner');

        if (!userSide) {
            gate.hidden = false;
            banner.hidden = true;
            document.getElementById('supportComposer').hidden = true;
            document.getElementById('opposeComposer').hidden = true;
            document.getElementById('supportLockedNote').hidden = false;
            document.getElementById('supportLockedNote').textContent = "Choose a side above to join this column's discussion.";
            document.getElementById('opposeLockedNote').hidden = false;
            document.getElementById('opposeLockedNote').textContent = "Choose a side above to join this column's discussion.";
            return;
        }

        gate.hidden = true;
        banner.hidden = false;
        const label = document.getElementById('userSideLabel');
        label.textContent = userSide === 'support' ? '🟢 Support' : '🔴 Oppose';
        label.className = 'side-label-' + userSide;

        document.getElementById('supportComposer').hidden = userSide !== 'support';
        document.getElementById('opposeComposer').hidden = userSide !== 'oppose';

        const supportNote = document.getElementById('supportLockedNote');
        const opposeNote = document.getElementById('opposeLockedNote');
        if (userSide === 'support') {
            supportNote.hidden = true;
            opposeNote.hidden = false;
            opposeNote.textContent = "You're on the Support side — you can only comment in the Support column.";
        } else {
            opposeNote.hidden = true;
            supportNote.hidden = false;
            supportNote.textContent = "You're on the Oppose side — you can only comment in the Oppose column.";
        }
    }

    function wireStanceButtons() {
        document.querySelectorAll('#stanceButtons .stance-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!session) {
                    window.jv.showToast('Please log in to take a side.', 'error');
                    setTimeout(() => { window.location.href = 'login.html'; }, 1000);
                    return;
                }
                const side = btn.getAttribute('data-side');
                btn.disabled = true;
                const { error } = await supabase.from('opinions').insert({ issue_id: issue.id, user_id: session.user.id, side });
                btn.disabled = false;

                if (error) {
                    window.jv.showToast(friendlyError(error), 'error');
                    return;
                }

                userSide = side;
                if (side === 'support') issue.support_count = (issue.support_count || 0) + 1;
                else issue.oppose_count = (issue.oppose_count || 0) + 1;

                btn.classList.add('stance-selected');
                loadStats();
                renderStanceUi();
                window.jv.showToast(side === 'support' ? 'You are now Supporting this issue!' : 'You are now Opposing this issue!', 'success');
            });
        });
    }

    function wireIssueActions() {
        document.getElementById('reportIssueBtn').addEventListener('click', async () => {
            if (!session) { window.jv.showToast('Please log in to report content.', 'error'); return; }
            const reason = window.prompt('Why are you reporting this issue?') || 'Not specified';
            const { error } = await supabase.from('reports').insert({
                reporter_id: session.user.id, reportable_type: 'issue', reportable_id: issue.id, reason,
            });
            window.jv.showToast(error ? friendlyError(error) : 'Reported. Thank you.', error ? 'error' : 'success');
        });

        document.getElementById('sortSelect').addEventListener('change', loadComments);
    }

    // ---------------- comments/replies ----------------
    async function loadComments() {
        const sort = document.getElementById('sortSelect').value;
        const order = sort === 'oldest'
            ? { column: 'created_at', ascending: true }
            : sort === 'liked'
                ? { column: 'like_count', ascending: false }
                : { column: 'created_at', ascending: false };

        for (const side of ['support', 'oppose']) {
            const { data: comments } = await supabase
                .from('comments')
                .select('*, profiles(username, avatar_url)')
                .eq('issue_id', issue.id).eq('side', side).eq('is_hidden', false)
                .order(order.column, { ascending: order.ascending });

            document.getElementById(side + 'CommentCount').textContent = (comments || []).length + ' comments';

            const list = document.getElementById(side + 'Comments');
            list.innerHTML = '';
            if (!comments || !comments.length) continue;

            const commentIds = comments.map((c) => c.id);
            const { data: replies } = await supabase
                .from('replies').select('*, profiles(username, avatar_url)')
                .in('comment_id', commentIds).eq('is_hidden', false).order('created_at', { ascending: true });

            const repliesByComment = {};
            (replies || []).forEach((r) => {
                (repliesByComment[r.comment_id] = repliesByComment[r.comment_id] || []).push(r);
            });

            comments.forEach((c) => list.appendChild(buildCommentNode(c, repliesByComment[c.id] || [])));
        }
    }

    function buildCommentNode(comment, replies) {
        const tpl = document.getElementById('commentTemplate');
        const node = tpl.content.firstElementChild.cloneNode(true);
        node.setAttribute('data-comment-id', comment.id);
        node.querySelector('.comment-avatar').src = window.jv.avatarUrl(comment.profiles?.avatar_url);
        node.querySelector('.comment-username').textContent = comment.profiles?.username || 'Unknown';
        const badge = node.querySelector('.badge');
        badge.classList.add('badge-' + comment.side);
        badge.textContent = comment.side === 'support' ? '🟢 Support' : '🔴 Oppose';
        node.querySelector('.comment-time').textContent = window.jv.timeAgo(comment.created_at);
        node.querySelector('.comment-text').textContent = comment.body;
        node.querySelector('.like-btn').setAttribute('data-id', comment.id);
        node.querySelector('.like-count').textContent = comment.like_count || 0;
        node.querySelector('.report-btn').setAttribute('data-id', comment.id);
        node.querySelector('.reply-form').setAttribute('data-comment-id', comment.id);

        const repliesList = node.querySelector('.replies-list');
        replies.forEach((r) => repliesList.appendChild(buildReplyNode(r)));

        return node;
    }

    function buildReplyNode(reply) {
        const tpl = document.getElementById('replyTemplate');
        const node = tpl.content.firstElementChild.cloneNode(true);
        node.setAttribute('data-reply-id', reply.id);
        node.querySelector('.comment-avatar').src = window.jv.avatarUrl(reply.profiles?.avatar_url);
        node.querySelector('.comment-username').textContent = reply.profiles?.username || 'Unknown';
        node.querySelector('.comment-time').textContent = window.jv.timeAgo(reply.created_at);
        node.querySelector('.comment-text').textContent = reply.body;
        node.querySelector('.like-btn').setAttribute('data-id', reply.id);
        node.querySelector('.like-count').textContent = reply.like_count || 0;
        node.querySelector('.report-btn').setAttribute('data-id', reply.id);
        return node;
    }

    // Comment/reply form submission (event delegation, since comment
    // nodes are created dynamically).
    document.getElementById('discussionColumns').addEventListener('submit', async (e) => {
        const commentForm = e.target.closest('.comment-form');
        if (commentForm) {
            e.preventDefault();
            if (!session) { window.jv.showToast('Please log in to continue.', 'error'); return; }
            const side = commentForm.getAttribute('data-side');
            const textarea = commentForm.querySelector('textarea');
            const body = textarea.value.trim();
            if (!body) return;

            const btn = commentForm.querySelector('button');
            btn.disabled = true;
            const { error } = await supabase.from('comments').insert({
                issue_id: issue.id, user_id: session.user.id, side, body,
            });
            btn.disabled = false;

            if (error) { window.jv.showToast(friendlyError(error), 'error'); return; }

            textarea.value = '';
            window.jv.showToast('Comment posted!', 'success');
            loadComments();
            return;
        }

        const replyForm = e.target.closest('.reply-form');
        if (replyForm) {
            e.preventDefault();
            if (!session) { window.jv.showToast('Please log in to continue.', 'error'); return; }
            const commentId = replyForm.getAttribute('data-comment-id');
            const textarea = replyForm.querySelector('textarea');
            const body = textarea.value.trim();
            if (!body) return;

            const btn = replyForm.querySelector('button');
            btn.disabled = true;
            const { error } = await supabase.from('replies').insert({
                comment_id: commentId, user_id: session.user.id, body,
            });
            btn.disabled = false;

            if (error) { window.jv.showToast(friendlyError(error), 'error'); return; }

            textarea.value = '';
            replyForm.hidden = true;
            window.jv.showToast('Reply posted!', 'success');
            loadComments();
        }
    });

    document.getElementById('discussionColumns').addEventListener('click', async (e) => {
        const toggleBtn = e.target.closest('.reply-toggle-btn');
        if (toggleBtn) {
            const commentEl = toggleBtn.closest('.comment');
            const form = commentEl.querySelector(':scope > .comment-main > .comment-body > .reply-form');
            if (form) form.hidden = !form.hidden;
            return;
        }

        const likeBtn = e.target.closest('.like-btn');
        if (likeBtn) {
            if (!session) { window.jv.showToast('Please log in to continue.', 'error'); return; }
            const type = likeBtn.getAttribute('data-type');
            const id = Number(likeBtn.getAttribute('data-id'));

            const { data: existing } = await supabase
                .from('likes').select('id').eq('user_id', session.user.id).eq('likeable_type', type).eq('likeable_id', id).maybeSingle();

            if (existing) {
                await supabase.from('likes').delete().eq('id', existing.id);
                likeBtn.classList.remove('liked');
                likeBtn.querySelector('.like-count').textContent = Math.max(0, Number(likeBtn.querySelector('.like-count').textContent) - 1);
            } else {
                const { error } = await supabase.from('likes').insert({ user_id: session.user.id, likeable_type: type, likeable_id: id });
                if (error) { window.jv.showToast(friendlyError(error), 'error'); return; }
                likeBtn.classList.add('liked');
                likeBtn.querySelector('.like-count').textContent = Number(likeBtn.querySelector('.like-count').textContent) + 1;
            }
            return;
        }

        const reportBtn = e.target.closest('.report-btn');
        if (reportBtn) {
            if (!session) { window.jv.showToast('Please log in to continue.', 'error'); return; }
            const type = reportBtn.getAttribute('data-type');
            const id = Number(reportBtn.getAttribute('data-id'));
            const reason = window.prompt('Why are you reporting this?') || 'Not specified';
            const { error } = await supabase.from('reports').insert({
                reporter_id: session.user.id, reportable_type: type, reportable_id: id, reason,
            });
            window.jv.showToast(error ? friendlyError(error) : 'Reported. Thank you.', error ? 'error' : 'success');
        }
    });

    window.jv.onPartialsLoaded(loadIssue);
})();
