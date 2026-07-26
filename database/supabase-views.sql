-- ============================================================
-- Jan Voice — read-optimized views
-- Run this AFTER the other three SQL files (same SQL Editor).
-- ============================================================

-- security_invoker ensures this view respects the querying user's
-- own RLS on `issues` (so, e.g., a pending issue still only shows
-- to its owner/admin through this view too).
create view public.issues_with_comment_count
with (security_invoker = true)
as
select i.*, (select count(*) from public.comments c where c.issue_id = i.id) as comment_count
from public.issues i;
