/**
 * Jan Voice — profile.html: public profile page.
 */
(async function () {
    'use strict';

    const supabase = window.jv.supabase;
    const username = new URLSearchParams(window.location.search).get('u') || '';

    const { data: profile } = await supabase
        .from('profiles').select('*').eq('username', username).eq('status', 'active').maybeSingle();

    if (!profile) {
        document.getElementById('notFoundState').hidden = false;
        return;
    }

    document.getElementById('profileContent').hidden = false;
    document.getElementById('pageTitle').textContent = '@' + profile.username + ' — Jan Voice';
    document.getElementById('profileAvatar').src = window.jv.avatarUrl(profile.avatar_url);
    document.getElementById('profileUsername').textContent = '@' + profile.username;

    if (profile.bio) {
        const el = document.getElementById('profileBio');
        el.hidden = false;
        el.textContent = profile.bio;
    }
    if (profile.location) {
        const el = document.getElementById('profileLocation');
        el.hidden = false;
        el.innerHTML = window.jv.iconHtml('map-pin') + ' ' + window.jv.escapeHtml(profile.location);
        el.classList.add('icon-label');
    }
    document.getElementById('profileJoined').textContent =
        'Joined ' + new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const badges = (profile.badges || '').split(',').map((b) => b.trim()).filter(Boolean);
    document.getElementById('profileBadges').innerHTML =
        badges.map((b) => `<span class="tag-chip badge-chip">${window.jv.escapeHtml(b)}</span>`).join('');

    const totalOpinions = profile.total_opinions || 0;
    const supportPct = totalOpinions > 0 ? Math.round((profile.support_count / totalOpinions) * 100) : 0;
    const opposePct = totalOpinions > 0 ? Math.round((profile.oppose_count / totalOpinions) * 100) : 0;
    document.getElementById('statPosts').textContent = profile.total_posts || 0;
    document.getElementById('statOpinions').textContent = totalOpinions;
    document.getElementById('statSupportPct').textContent = supportPct + '%';
    document.getElementById('statOpposePct').textContent = opposePct + '%';

    document.getElementById('issuesHeading').textContent = `Issues by @${profile.username}`;

    const { data: issues } = await supabase
        .from('issues')
        .select('*, profiles(username, avatar_url), issue_categories(name, slug)')
        .eq('user_id', profile.id).eq('status', 'approved').eq('is_anonymous', false)
        .order('created_at', { ascending: false });

    if (issues && issues.length) {
        await window.jv.renderIssueGrid('#issueGrid', issues);
    } else {
        document.getElementById('emptyState').hidden = false;
    }
})();
