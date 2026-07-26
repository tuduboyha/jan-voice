-- ============================================================
-- Jan Voice — Supabase Storage buckets for avatar/cover uploads
-- Run this AFTER the other SQL files (same SQL Editor).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('issue-covers', 'issue-covers', true)
on conflict (id) do nothing;

-- Uploads must live under a folder named after the uploader's own
-- user id (e.g. "3f2a.../my-avatar.png") — this is how we scope
-- write access without a server of our own to check ownership.

create policy "avatar images are publicly viewable" on storage.objects
    for select using (bucket_id = 'avatars');

create policy "users upload their own avatar" on storage.objects
    for insert with check (
        bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "users replace/delete their own avatar" on storage.objects
    for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete their own avatar" on storage.objects
    for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cover images are publicly viewable" on storage.objects
    for select using (bucket_id = 'issue-covers');

create policy "users upload their own issue covers" on storage.objects
    for insert with check (
        bucket_id = 'issue-covers' and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "users delete their own issue covers" on storage.objects
    for delete using (bucket_id = 'issue-covers' and (storage.foldername(name))[1] = auth.uid()::text);
