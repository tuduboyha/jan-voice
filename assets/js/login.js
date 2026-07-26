/**
 * Jan Voice — login via Supabase Auth.
 */
(function () {
    'use strict';

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const email = form.email.value.trim().toLowerCase();
        const password = form.password.value;

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        const { error } = await window.jv.supabase.auth.signInWithPassword({ email, password });

        submitBtn.disabled = false;

        if (error) {
            window.jv.showToast(error.message, 'error');
            return;
        }

        const params = new URLSearchParams(window.location.search);
        window.location.href = params.get('redirect') || 'index.html';
    });
})();
