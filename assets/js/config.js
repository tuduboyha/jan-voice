/**
 * Jan Voice — Supabase connection config.
 *
 * Fill these in from your Supabase project dashboard:
 * Project Settings → API → Project URL, and the "anon public" key.
 *
 * The anon key is DESIGNED to be public/client-visible — it is not a
 * secret. Access control is enforced by the Row Level Security
 * policies in database/supabase-rls.sql, not by hiding this key.
 * Never put your "service_role" key here or in any client file.
 */
window.JANVOICE_CONFIG = {
    SUPABASE_URL: 'https://apxfggcasykxjdnwojsr.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGZnZ2Nhc3lreGpkbndvanNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNDQ3NjMsImV4cCI6MjEwMDYyMDc2M30.WGgwglnRBQjH7JX-QdiW6UDbslc2xwvL9EHCC0S1wdM',
};
