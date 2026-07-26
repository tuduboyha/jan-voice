-- ============================================================
-- Jan Voice — Supabase functions & triggers
-- Run this AFTER supabase-schema.sql (same SQL Editor).
--
-- These replace logic that used to live in PHP controllers:
-- notification creation, badge recomputation, like-count
-- maintenance, and "never trust the client for a comment's side."
-- ============================================================

-- ------------------------------------------------------------
-- is_admin(): SECURITY DEFINER so it can read profiles without
-- recursively triggering the RLS policy that calls it.
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
    select exists (
        select 1 from public.profiles where id = auth.uid() and role = 'admin'
    );
$$;

-- ------------------------------------------------------------
-- 1. New auth.users row -> create the matching profiles row.
--    Username comes from signUp's options.data.username.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
    insert into public.profiles (id, username)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8))
    );
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 2. Badge recomputation — mirrors the old models/Badge.php
--    thresholds exactly.
-- ------------------------------------------------------------
create or replace function public.recompute_badges(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
    v_approved_issues int;
    v_comments_replies int;
    v_likes_received int;
    v_replies_given int;
    v_email_verified boolean;
    v_badges text := '';
begin
    select count(*) into v_approved_issues from public.issues
        where user_id = p_user_id and status = 'approved';

    select
        (select count(*) from public.comments where user_id = p_user_id) +
        (select count(*) from public.replies where user_id = p_user_id)
        into v_comments_replies;

    select
        coalesce((select sum(like_count) from public.comments where user_id = p_user_id), 0) +
        coalesce((select sum(like_count) from public.replies where user_id = p_user_id), 0)
        into v_likes_received;

    select count(*) into v_replies_given from public.replies where user_id = p_user_id;

    select (email_confirmed_at is not null) into v_email_verified
        from auth.users where id = p_user_id;

    if v_approved_issues >= 5 then
        v_badges := v_badges || '🏆 Top Contributor,';
    end if;
    if v_comments_replies >= 15 then
        v_badges := v_badges || '💬 Debater,';
    end if;
    if v_likes_received >= 15 then
        v_badges := v_badges || '🧠 Critical Thinker,';
    end if;
    if v_email_verified then
        v_badges := v_badges || '✅ Verified User,';
    end if;
    if v_replies_given >= 10 then
        v_badges := v_badges || '🤝 Community Helper,';
    end if;

    update public.profiles
        set badges = nullif(trim(trailing ',' from v_badges), '')
        where id = p_user_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. New opinion -> bump issue + profile counters, notify the
--    issue owner, recompute badges. A side can never be changed
--    (no UPDATE/DELETE grant on opinions), matching the product
--    rule that a stance is permanent.
-- ------------------------------------------------------------
create or replace function public.handle_new_opinion()
returns trigger
language plpgsql
security definer
as $$
declare
    v_issue public.issues%rowtype;
    v_username text;
begin
    select * into v_issue from public.issues where id = new.issue_id;

    if new.side = 'support' then
        update public.issues set support_count = support_count + 1 where id = new.issue_id;
        update public.profiles set total_opinions = total_opinions + 1, support_count = support_count + 1
            where id = new.user_id;
    else
        update public.issues set oppose_count = oppose_count + 1 where id = new.issue_id;
        update public.profiles set total_opinions = total_opinions + 1, oppose_count = oppose_count + 1
            where id = new.user_id;
    end if;

    if v_issue.user_id != new.user_id then
        select username into v_username from public.profiles where id = new.user_id;
        insert into public.notifications (user_id, type, message, link)
        values (
            v_issue.user_id,
            new.side,
            v_username || ' ' || (case when new.side = 'support' then 'supported' else 'opposed' end)
                || ' your issue "' || v_issue.title || '".',
            '/issue.html?slug=' || v_issue.slug
        );
    end if;

    perform public.recompute_badges(v_issue.user_id);
    return new;
end;
$$;

create trigger on_opinion_created
    after insert on public.opinions
    for each row execute function public.handle_new_opinion();

-- ------------------------------------------------------------
-- 4. Before a comment is inserted, overwrite `side` with the
--    user's actual recorded opinion — the client's own claim
--    about its side is never trusted, exactly like the old
--    CommentController::postComment().
-- ------------------------------------------------------------
create or replace function public.set_comment_side()
returns trigger
language plpgsql
security definer
as $$
declare
    v_side text;
begin
    select side into v_side from public.opinions
        where issue_id = new.issue_id and user_id = new.user_id;

    if v_side is null then
        raise exception 'no_stance: choose a side before commenting';
    end if;

    new.side := v_side;
    return new;
end;
$$;

create trigger before_comment_insert
    before insert on public.comments
    for each row execute function public.set_comment_side();

-- ------------------------------------------------------------
-- 5. Mention notifications (@username) + badge sync, for both
--    comments and replies.
-- ------------------------------------------------------------
create or replace function public.notify_mentions(p_body text, p_author_id uuid, p_link text)
returns void
language plpgsql
security definer
as $$
declare
    v_author_name text;
    v_match text;
    v_mentioned_id uuid;
begin
    select username into v_author_name from public.profiles where id = p_author_id;

    for v_match in select (regexp_matches(p_body, '@([a-zA-Z0-9_]{3,50})', 'g'))[1]
    loop
        select id into v_mentioned_id from public.profiles where username = v_match;
        if v_mentioned_id is not null and v_mentioned_id != p_author_id then
            insert into public.notifications (user_id, type, message, link)
            values (v_mentioned_id, 'mention', v_author_name || ' mentioned you in a comment.', p_link);
        end if;
    end loop;
end;
$$;

create or replace function public.handle_new_comment()
returns trigger
language plpgsql
security definer
as $$
declare
    v_slug text;
begin
    select slug into v_slug from public.issues where id = new.issue_id;
    perform public.notify_mentions(new.body, new.user_id, '/issue.html?slug=' || v_slug);
    perform public.recompute_badges(new.user_id);
    return new;
end;
$$;

create trigger after_comment_insert
    after insert on public.comments
    for each row execute function public.handle_new_comment();

create or replace function public.handle_new_reply()
returns trigger
language plpgsql
security definer
as $$
declare
    v_comment public.comments%rowtype;
    v_slug text;
    v_username text;
begin
    select * into v_comment from public.comments where id = new.comment_id;
    select slug into v_slug from public.issues where id = v_comment.issue_id;

    if v_comment.user_id != new.user_id then
        select username into v_username from public.profiles where id = new.user_id;
        insert into public.notifications (user_id, type, message, link)
        values (v_comment.user_id, 'reply', v_username || ' replied to your comment.', '/issue.html?slug=' || v_slug);
    end if;

    perform public.notify_mentions(new.body, new.user_id, '/issue.html?slug=' || v_slug);
    perform public.recompute_badges(new.user_id);
    return new;
end;
$$;

create trigger after_reply_insert
    after insert on public.replies
    for each row execute function public.handle_new_reply();

-- ------------------------------------------------------------
-- 6. Like insert/delete -> maintain like_count, notify on new
--    likes only, recompute badges for the content owner.
-- ------------------------------------------------------------
create or replace function public.handle_like_change()
returns trigger
language plpgsql
security definer
as $$
declare
    v_row_id bigint;
    v_type text;
    v_owner_id uuid;
    v_liker_name text;
begin
    if tg_op = 'INSERT' then
        v_row_id := new.likeable_id;
        v_type := new.likeable_type;
    else
        v_row_id := old.likeable_id;
        v_type := old.likeable_type;
    end if;

    if v_type = 'comment' then
        if tg_op = 'INSERT' then
            update public.comments set like_count = like_count + 1 where id = v_row_id returning user_id into v_owner_id;
        else
            update public.comments set like_count = greatest(like_count - 1, 0) where id = v_row_id returning user_id into v_owner_id;
        end if;
    else
        if tg_op = 'INSERT' then
            update public.replies set like_count = like_count + 1 where id = v_row_id returning user_id into v_owner_id;
        else
            update public.replies set like_count = greatest(like_count - 1, 0) where id = v_row_id returning user_id into v_owner_id;
        end if;
    end if;

    if tg_op = 'INSERT' and v_owner_id is not null then
        if v_owner_id != new.user_id then
            select username into v_liker_name from public.profiles where id = new.user_id;
            insert into public.notifications (user_id, type, message)
            values (v_owner_id, 'like', v_liker_name || ' liked your opinion.');
        end if;
    end if;

    if v_owner_id is not null then
        perform public.recompute_badges(v_owner_id);
    end if;

    return coalesce(new, old);
end;
$$;

create trigger after_like_insert
    after insert on public.likes
    for each row execute function public.handle_like_change();

create trigger after_like_delete
    after delete on public.likes
    for each row execute function public.handle_like_change();

-- ------------------------------------------------------------
-- 7. Issue approved -> notify owner + recompute their badges.
--    Fires on any status change, but only acts on 'approved'.
-- ------------------------------------------------------------
create or replace function public.handle_issue_status_change()
returns trigger
language plpgsql
security definer
as $$
begin
    if new.status = 'approved' and old.status != 'approved' then
        insert into public.notifications (user_id, type, message, link)
        values (
            new.user_id, 'system',
            'Your issue "' || new.title || '" has been approved and is now live.',
            '/issue.html?slug=' || new.slug
        );
        perform public.recompute_badges(new.user_id);
    elsif new.status = 'rejected' and old.status != 'rejected' then
        insert into public.notifications (user_id, type, message)
        values (new.user_id, 'system', 'Your issue "' || new.title || '" was not approved. Please review our Community Guidelines.');
    end if;
    return new;
end;
$$;

create trigger after_issue_status_update
    after update of status on public.issues
    for each row execute function public.handle_issue_status_change();

-- ------------------------------------------------------------
-- 8. Prevent a non-admin from escalating their own role/status.
--    Basic profile edits (bio, location, avatar) still go through
--    the normal RLS "own row" UPDATE policy.
-- ------------------------------------------------------------
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
as $$
begin
    if (new.role != old.role or new.status != old.status) and not public.is_admin() then
        raise exception 'Only admins may change role or status.';
    end if;
    return new;
end;
$$;

create trigger before_profile_update
    before update on public.profiles
    for each row execute function public.prevent_privilege_escalation();

-- ------------------------------------------------------------
-- 9. New report -> flag the reported comment/reply, mirroring
--    the old Comment::report() which did both in one call.
-- ------------------------------------------------------------
create or replace function public.handle_new_report()
returns trigger
language plpgsql
security definer
as $$
begin
    if new.reportable_type = 'comment' then
        update public.comments set is_reported = true where id = new.reportable_id;
    elsif new.reportable_type = 'reply' then
        update public.replies set is_reported = true where id = new.reportable_id;
    end if;
    return new;
end;
$$;

create trigger after_report_insert
    after insert on public.reports
    for each row execute function public.handle_new_report();

-- ------------------------------------------------------------
-- 10. increment_issue_views — a public RPC so any visitor (even
--     anonymous) can bump the view counter without needing a
--     broad UPDATE grant on the whole issues row.
-- ------------------------------------------------------------
-- ------------------------------------------------------------
-- 10b. Profanity filter — runs in Postgres so it applies no matter
--      how the insert happens (this app's own pages, or anyone
--      calling the Supabase REST API directly). A client-side-only
--      check would be trivially bypassable in a static-site
--      architecture with no backend of its own.
-- ------------------------------------------------------------
create or replace function public.check_profanity(p_text text)
returns void
language plpgsql
immutable
as $$
declare
    v_banned text[] := array[
        'fuck','fucking','fucker','motherfucker','shit','bullshit','bitch','bastard',
        'asshole','dick','pussy','cunt','whore','slut','nigger','nigga','chink','spic',
        'faggot','retard','randi','chutiya','madarchod','behenchod','bhosdike','gandu','harami'
    ];
    v_word text;
begin
    foreach v_word in array v_banned loop
        if p_text ~* ('\y' || v_word || '\y') then
            raise exception 'profanity_detected: content violates Community Guidelines';
        end if;
    end loop;
end;
$$;

create or replace function public.check_issue_profanity()
returns trigger
language plpgsql
as $$
begin
    perform public.check_profanity(new.title || ' ' || new.summary || ' ' || new.description);
    return new;
end;
$$;

create trigger before_issue_insert_profanity
    before insert on public.issues
    for each row execute function public.check_issue_profanity();

create or replace function public.check_comment_profanity()
returns trigger
language plpgsql
as $$
begin
    perform public.check_profanity(new.body);
    return new;
end;
$$;

create trigger before_comment_insert_profanity
    before insert on public.comments
    for each row execute function public.check_comment_profanity();

create trigger before_reply_insert_profanity
    before insert on public.replies
    for each row execute function public.check_comment_profanity();

create or replace function public.increment_issue_views(p_issue_id bigint)
returns void
language sql
security definer
as $$
    update public.issues set views = views + 1 where id = p_issue_id;
$$;

-- ------------------------------------------------------------
-- 10c. admin_list_users / admin_count_users — email lives in
--      auth.users, which PostgREST does not expose to normal
--      client queries. These SECURITY DEFINER functions let an
--      admin read it anyway, after checking is_admin() themselves.
-- ------------------------------------------------------------
create or replace function public.admin_list_users(
    p_search text default null, p_role text default null, p_status text default null,
    p_limit int default 20, p_offset int default 0
)
returns table (
    id uuid, username text, email text, role text, status text,
    total_posts int, avatar_url text, created_at timestamptz
)
language plpgsql
security definer
as $$
begin
    if not public.is_admin() then
        raise exception 'Only admins may list users.';
    end if;

    return query
    select p.id, p.username, u.email, p.role, p.status, p.total_posts, p.avatar_url, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where (p_search is null or p_search = '' or p.username ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%')
      and (p_role is null or p_role = '' or p.role = p_role)
      and (p_status is null or p_status = '' or p.status = p_status)
    order by p.created_at desc
    limit p_limit offset p_offset;
end;
$$;

create or replace function public.admin_count_users(
    p_search text default null, p_role text default null, p_status text default null
)
returns bigint
language plpgsql
security definer
as $$
declare
    v_count bigint;
begin
    if not public.is_admin() then
        raise exception 'Only admins may count users.';
    end if;

    select count(*) into v_count
    from public.profiles p
    join auth.users u on u.id = p.id
    where (p_search is null or p_search = '' or p.username ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%')
      and (p_role is null or p_role = '' or p.role = p_role)
      and (p_status is null or p_status = '' or p.status = p_status);

    return v_count;
end;
$$;

-- ------------------------------------------------------------
-- 11. weekly_leaderboard — mirrors the old models/Leaderboard.php
--     weighting exactly: issues x5, comments+replies x2,
--     opinions x1, likes received x1, over the trailing 7 days.
--     security invoker so it still only sees what RLS allows.
-- ------------------------------------------------------------
create or replace function public.weekly_leaderboard(p_limit int default 20)
returns table (
    user_id uuid,
    username text,
    avatar_url text,
    issues bigint,
    comments bigint,
    opinions bigint,
    likes bigint,
    score bigint
)
language sql
security invoker
stable
as $$
    with since as (select now() - interval '7 days' as cutoff),
    issue_counts as (
        select i.user_id, count(*) as cnt from public.issues i, since
        where i.status = 'approved' and i.created_at >= since.cutoff
        group by i.user_id
    ),
    -- Each of these is collapsed to exactly one row per user_id before
    -- being joined below — otherwise the two `union all` branches would
    -- produce 2 rows per user here, and joining two such CTEs together
    -- in `combined` would cross-multiply into 4 rows and inflate sums.
    comment_counts as (
        select user_id, sum(cnt) as cnt from (
            select c.user_id, count(*) as cnt from public.comments c, since
            where c.created_at >= since.cutoff group by c.user_id
            union all
            select r.user_id, count(*) as cnt from public.replies r, since
            where r.created_at >= since.cutoff group by r.user_id
        ) x group by user_id
    ),
    opinion_counts as (
        select o.user_id, count(*) as cnt from public.opinions o, since
        where o.created_at >= since.cutoff
        group by o.user_id
    ),
    like_counts as (
        select user_id, sum(cnt) as cnt from (
            select c.user_id, count(*) as cnt
            from public.likes l
            join public.comments c on c.id = l.likeable_id and l.likeable_type = 'comment'
            cross join since
            where l.created_at >= since.cutoff
            group by c.user_id
            union all
            select r.user_id, count(*) as cnt
            from public.likes l
            join public.replies r on r.id = l.likeable_id and l.likeable_type = 'reply'
            cross join since
            where l.created_at >= since.cutoff
            group by r.user_id
        ) x group by user_id
    ),
    combined as (
        select
            p.id as user_id,
            coalesce(sum(ic.cnt), 0) as issues,
            coalesce(sum(cc.cnt), 0) as comments,
            coalesce(sum(oc.cnt), 0) as opinions,
            coalesce(sum(lc.cnt), 0) as likes
        from public.profiles p
        left join issue_counts ic on ic.user_id = p.id
        left join comment_counts cc on cc.user_id = p.id
        left join opinion_counts oc on oc.user_id = p.id
        left join like_counts lc on lc.user_id = p.id
        group by p.id
    )
    select
        c.user_id, p.username, p.avatar_url,
        c.issues, c.comments, c.opinions, c.likes,
        (c.issues * 5 + c.comments * 2 + c.opinions * 1 + c.likes * 1) as score
    from combined c
    join public.profiles p on p.id = c.user_id
    where (c.issues * 5 + c.comments * 2 + c.opinions * 1 + c.likes * 1) > 0
    order by score desc
    limit p_limit;
$$;
