/**
 * Jan Voice — single shared Supabase client instance.
 * Requires config.js and the Supabase UMD script to be loaded first.
 */
(function () {
    'use strict';

    if (!window.supabase || !window.supabase.createClient) {
        console.error('Supabase JS library not loaded. Check the <script> order in this page.');
        return;
    }

    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.JANVOICE_CONFIG || {};
    window.jv = window.jv || {};

    function showConfigWarning() {
        const banner = document.createElement('div');
        banner.textContent =
            '⚠️ Supabase is not configured yet — edit assets/js/config.js with your project URL and anon key. ' +
            '(See the setup steps in README.md.)';
        Object.assign(banner.style, {
            position: 'fixed', top: '0', left: '0', right: '0', zIndex: '9999',
            background: '#f59e0b', color: '#1a1a2e', textAlign: 'center',
            padding: '10px 16px', fontSize: '0.85rem', fontWeight: '600',
        });
        document.addEventListener('DOMContentLoaded', () => document.body.prepend(banner));
        if (document.body) document.body.prepend(banner);
    }

    let isValidUrl = false;
    try {
        isValidUrl = Boolean(SUPABASE_URL) && new URL(SUPABASE_URL).protocol.startsWith('http');
    } catch (e) {
        isValidUrl = false;
    }

    if (!isValidUrl || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_PUBLIC_KEY') {
        console.warn('Jan Voice: assets/js/config.js still has placeholder Supabase credentials.');
        showConfigWarning();
        // A stub client so pages don't throw on every jv.supabase.* call —
        // every chained query method returns the same stub, which itself
        // resolves (via .then) to an empty/error result once awaited.
        const stubError = { message: 'Supabase is not configured yet.' };
        const stubResult = { data: null, error: stubError };
        const chainMethods = [
            'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
            'in', 'contains', 'order', 'limit', 'range', 'or', 'match',
        ];
        const stubQuery = { single: () => stubQuery, maybeSingle: () => stubQuery };
        chainMethods.forEach((m) => { stubQuery[m] = () => stubQuery; });
        stubQuery.then = (resolve) => resolve({ data: [], error: stubError, count: 0 });

        window.jv.supabase = {
            from: () => stubQuery,
            rpc: async () => stubResult,
            auth: {
                getSession: async () => ({ data: { session: null }, error: null }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
                signUp: async () => stubResult,
                signInWithPassword: async () => stubResult,
                signOut: async () => ({ error: null }),
                updateUser: async () => stubResult,
                resetPasswordForEmail: async () => stubResult,
            },
            storage: { from: () => ({ upload: async () => stubResult, getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
        };
        return;
    }

    window.jv.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
