/**
 * Jan Voice — registration via Supabase Auth.
 *
 * Note on the math CAPTCHA below: without a server of its own, a
 * static site cannot truly enforce a CAPTCHA (a bot can call the
 * Supabase API directly, bypassing this HTML form entirely). This
 * check only deters casual/scripted form-fillers. For real bot
 * protection, enable Supabase's built-in CAPTCHA (Cloudflare
 * Turnstile) under Authentication → Settings in your Supabase
 * dashboard — Supabase verifies that token server-side.
 */
(function () {
    'use strict';

    let captchaAnswer = 0;

    function newCaptcha() {
        const a = Math.floor(Math.random() * 12) + 1;
        const b = Math.floor(Math.random() * 12) + 1;
        captchaAnswer = a + b;
        document.getElementById('captchaQuestion').textContent = `What is ${a} + ${b}?`;
    }

    document.addEventListener('partialsLoaded', newCaptcha, { once: true });
    newCaptcha();

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const username = form.username.value.trim();
        const email = form.email.value.trim().toLowerCase();
        const password = form.password.value;
        const confirm = form.confirm_password.value;
        const answer = Number(form.captcha_answer.value);

        if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
            window.jv.showToast('Username must be 3-50 characters (letters, numbers, underscore only).', 'error');
            return;
        }
        if (password.length < 8) {
            window.jv.showToast('Password must be at least 8 characters.', 'error');
            return;
        }
        if (password !== confirm) {
            window.jv.showToast('Passwords do not match.', 'error');
            return;
        }
        if (answer !== captchaAnswer) {
            window.jv.showToast('Incorrect answer to the security check. Please try again.', 'error');
            newCaptcha();
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        const { data, error } = await window.jv.supabase.auth.signUp({
            email,
            password,
            options: { data: { username } },
        });

        submitBtn.disabled = false;

        if (error) {
            window.jv.showToast(error.message, 'error');
            newCaptcha();
            return;
        }

        if (data.session) {
            window.jv.showToast('Welcome to Jan Voice!', 'success');
            window.location.href = 'index.html';
        } else {
            window.jv.showToast('Account created! Check your email to confirm your address, then log in.', 'success');
            window.location.href = 'login.html';
        }
    });
})();
