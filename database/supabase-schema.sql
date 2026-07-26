-- ============================================================
-- Jan Voice — Supabase (PostgreSQL) schema
-- "Every Issue Matters. Every Voice Counts."
--
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- Auth is handled entirely by Supabase (auth.users); this schema
-- extends it with a `profiles` table and all app data. Row Level
-- Security (RLS) replaces the authorization checks that used to
-- live in PHP controllers, and trigger functions replace the
-- notification/badge-sync/like-count side effects those
-- controllers used to perform.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- profiles (extends auth.users — one row per account)
-- ------------------------------------------------------------
create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique,
    avatar_url text,
    bio text,
    location text,
    role text not null default 'user' check (role in ('user','moderator','admin')),
    status text not null default 'active' check (status in ('active','suspended','banned')),
    total_posts int not null default 0,
    total_opinions int not null default 0,
    support_count int not null default 0,
    oppose_count int not null default 0,
    badges text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- issue_categories
-- ------------------------------------------------------------
create table public.issue_categories (
    id bigserial primary key,
    name text not null unique,
    slug text not null unique,
    icon text,
    description text,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- issues
-- ------------------------------------------------------------
create table public.issues (
    id bigserial primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    category_id bigint references public.issue_categories(id) on delete set null,
    title text not null,
    slug text not null unique,
    summary text not null,
    description text not null,
    cover_image text,
    location text,
    source_links text,
    is_anonymous boolean not null default false,
    status text not null default 'pending' check (status in ('pending','approved','rejected')),
    is_featured boolean not null default false,
    views int not null default 0,
    support_count int not null default 0,
    oppose_count int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index idx_issues_status on public.issues(status);
create index idx_issues_created on public.issues(created_at desc);
create index idx_issues_search on public.issues using gin (to_tsvector('english', title || ' ' || summary || ' ' || description));

-- ------------------------------------------------------------
-- issue_tags
-- ------------------------------------------------------------
create table public.issue_tags (
    id bigserial primary key,
    issue_id bigint not null references public.issues(id) on delete cascade,
    tag text not null
);
create index idx_tags_tag on public.issue_tags(tag);

-- ------------------------------------------------------------
-- issue_images (extra gallery images beyond cover_image)
-- ------------------------------------------------------------
create table public.issue_images (
    id bigserial primary key,
    issue_id bigint not null references public.issues(id) on delete cascade,
    image_path text not null,
    created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- opinions (the core "stance" table: Support / Oppose per user per issue)
-- No UPDATE/DELETE policies are granted below — a stance is permanent.
-- ------------------------------------------------------------
create table public.opinions (
    id bigserial primary key,
    issue_id bigint not null references public.issues(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    side text not null check (side in ('support','oppose')),
    created_at timestamptz not null default now(),
    unique (issue_id, user_id)
);

-- ------------------------------------------------------------
-- comments (side is always derived server-side from the user's
-- own opinion row — never trusted from client input)
-- ------------------------------------------------------------
create table public.comments (
    id bigserial primary key,
    issue_id bigint not null references public.issues(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    side text not null check (side in ('support','oppose')),
    body text not null,
    like_count int not null default 0,
    is_reported boolean not null default false,
    is_hidden boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index idx_comments_issue_side on public.comments(issue_id, side);

-- ------------------------------------------------------------
-- replies (inherits parent comment's side implicitly — the UI
-- never asks for a side on a reply)
-- ------------------------------------------------------------
create table public.replies (
    id bigserial primary key,
    comment_id bigint not null references public.comments(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    body text not null,
    like_count int not null default 0,
    is_reported boolean not null default false,
    is_hidden boolean not null default false,
    created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- likes (polymorphic: comment or reply)
-- ------------------------------------------------------------
create table public.likes (
    id bigserial primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    likeable_type text not null check (likeable_type in ('comment','reply')),
    likeable_id bigint not null,
    created_at timestamptz not null default now(),
    unique (user_id, likeable_type, likeable_id)
);

-- ------------------------------------------------------------
-- bookmarks
-- ------------------------------------------------------------
create table public.bookmarks (
    id bigserial primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    issue_id bigint not null references public.issues(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (user_id, issue_id)
);

-- ------------------------------------------------------------
-- notifications
-- ------------------------------------------------------------
create table public.notifications (
    id bigserial primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    type text not null check (type in ('reply','like','support','oppose','mention','system')),
    message text not null,
    link text,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);
create index idx_notifications_user_read on public.notifications(user_id, is_read);

-- ------------------------------------------------------------
-- reports
-- ------------------------------------------------------------
create table public.reports (
    id bigserial primary key,
    reporter_id uuid not null references public.profiles(id) on delete cascade,
    reportable_type text not null check (reportable_type in ('issue','comment','reply')),
    reportable_id bigint not null,
    reason text not null,
    status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
    created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- activity_logs
-- ------------------------------------------------------------
create table public.activity_logs (
    id bigserial primary key,
    user_id uuid references public.profiles(id) on delete set null,
    action text not null,
    details text,
    created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- settings
-- ------------------------------------------------------------
create table public.settings (
    id bigserial primary key,
    setting_key text not null unique,
    setting_value text
);

insert into public.settings (setting_key, setting_value) values
    ('site_name', 'Jan Voice'),
    ('site_tagline', 'Every Issue Matters. Every Voice Counts.');

insert into public.issue_categories (name, slug, icon) values
    ('Education', 'education', 'graduation-cap'),
    ('Politics', 'politics', 'landmark'),
    ('Employment', 'employment', 'briefcase'),
    ('Women Safety', 'women-safety', 'shield'),
    ('Healthcare', 'healthcare', 'heart-pulse'),
    ('Economy', 'economy', 'trending-up'),
    ('Environment', 'environment', 'leaf'),
    ('Agriculture', 'agriculture', 'wheat'),
    ('Technology', 'technology', 'cpu'),
    ('Corruption', 'corruption', 'gavel'),
    ('Law', 'law', 'scale'),
    ('Road Safety', 'road-safety', 'car'),
    ('Digital India', 'digital-india', 'smartphone'),
    ('Society', 'society', 'users'),
    ('Human Rights', 'human-rights', 'hand'),
    ('Others', 'others', 'ellipsis');
