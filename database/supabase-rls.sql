-- ============================================================
-- Jan Voice — Row Level Security policies
-- Run this AFTER supabase-schema.sql and supabase-functions.sql
-- (same SQL Editor). This is the authorization layer that
-- replaces PHP's require_login()/require_admin() checks.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.issue_categories enable row level security;
alter table public.issues enable row level security;
alter table public.issue_tags enable row level security;
alter table public.issue_images enable row level security;
alter table public.opinions enable row level security;
alter table public.comments enable row level security;
alter table public.replies enable row level security;
alter table public.likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.activity_logs enable row level security;
alter table public.settings enable row level security;

-- ---------------- profiles ----------------
create policy "profiles are publicly readable" on public.profiles
    for select using (true);

create policy "users update own profile, admins update any" on public.profiles
    for update using (auth.uid() = id or public.is_admin())
    with check (auth.uid() = id or public.is_admin());

-- ---------------- issue_categories ----------------
create policy "active categories are public, admins see all" on public.issue_categories
    for select using (is_active or public.is_admin());

create policy "admins manage categories" on public.issue_categories
    for insert with check (public.is_admin());
create policy "admins update categories" on public.issue_categories
    for update using (public.is_admin());
create policy "admins delete categories" on public.issue_categories
    for delete using (public.is_admin());

-- ---------------- issues ----------------
create policy "approved issues are public; owners and admins see all" on public.issues
    for select using (status = 'approved' or user_id = auth.uid() or public.is_admin());

create policy "authenticated users create their own pending issue" on public.issues
    for insert with check (user_id = auth.uid() and status = 'pending');

create policy "admins update any issue" on public.issues
    for update using (public.is_admin());

create policy "admins delete issues" on public.issues
    for delete using (public.is_admin());

-- ---------------- issue_tags ----------------
create policy "tags are public" on public.issue_tags
    for select using (true);

create policy "owner adds tags to their own issue" on public.issue_tags
    for insert with check (exists (
        select 1 from public.issues where id = issue_id and user_id = auth.uid()
    ));

create policy "admins delete tags" on public.issue_tags
    for delete using (public.is_admin());

-- ---------------- issue_images ----------------
create policy "images are public" on public.issue_images
    for select using (true);

create policy "owner adds images to their own issue" on public.issue_images
    for insert with check (exists (
        select 1 from public.issues where id = issue_id and user_id = auth.uid()
    ));

create policy "admins delete images" on public.issue_images
    for delete using (public.is_admin());

-- ---------------- opinions ----------------
-- Deliberately no UPDATE/DELETE policy anywhere below: a stance,
-- once cast, is permanent — this is enforced at the database level.
create policy "opinions are public (needed for live stats)" on public.opinions
    for select using (true);

create policy "authenticated users cast one opinion per issue" on public.opinions
    for insert with check (
        user_id = auth.uid()
        and exists (select 1 from public.issues where id = issue_id and status = 'approved')
    );

-- ---------------- comments ----------------
create policy "visible comments are public, admins see all" on public.comments
    for select using (not is_hidden or public.is_admin());

create policy "authenticated users post their own comment" on public.comments
    for insert with check (user_id = auth.uid());

create policy "admins moderate comments" on public.comments
    for update using (public.is_admin());
create policy "admins delete comments" on public.comments
    for delete using (public.is_admin());

-- ---------------- replies ----------------
create policy "visible replies are public, admins see all" on public.replies
    for select using (not is_hidden or public.is_admin());

create policy "authenticated users post their own reply" on public.replies
    for insert with check (user_id = auth.uid());

create policy "admins moderate replies" on public.replies
    for update using (public.is_admin());
create policy "admins delete replies" on public.replies
    for delete using (public.is_admin());

-- ---------------- likes ----------------
create policy "likes are public (needed for counts)" on public.likes
    for select using (true);

create policy "authenticated users like as themselves" on public.likes
    for insert with check (user_id = auth.uid());

create policy "users unlike their own like" on public.likes
    for delete using (user_id = auth.uid());

-- ---------------- bookmarks ----------------
create policy "users see only their own bookmarks" on public.bookmarks
    for select using (user_id = auth.uid());

create policy "users bookmark as themselves" on public.bookmarks
    for insert with check (user_id = auth.uid());

create policy "users remove their own bookmark" on public.bookmarks
    for delete using (user_id = auth.uid());

-- ---------------- notifications ----------------
create policy "users see only their own notifications" on public.notifications
    for select using (user_id = auth.uid());

create policy "users mark their own notifications read" on public.notifications
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------- reports ----------------
create policy "authenticated users file a report as themselves" on public.reports
    for insert with check (reporter_id = auth.uid());

create policy "admins view reports" on public.reports
    for select using (public.is_admin());

create policy "admins resolve reports" on public.reports
    for update using (public.is_admin());

-- ---------------- activity_logs ----------------
create policy "admins view activity logs" on public.activity_logs
    for select using (public.is_admin());

-- ---------------- settings ----------------
create policy "settings are public" on public.settings
    for select using (true);

create policy "admins manage settings" on public.settings
    for all using (public.is_admin()) with check (public.is_admin());
