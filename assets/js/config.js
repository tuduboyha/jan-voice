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
    SUPABASE_URL: 'YOUR_SUPABASE_PROJECT_URL',
    SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_PUBLIC_KEY',
};
