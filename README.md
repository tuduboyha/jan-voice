# Jan Voice — Static + Supabase Edition

*Every Issue Matters. Every Voice Counts.*

A social-issue discussion platform where citizens raise real issues, take a
permanent Support 🟢 / Oppose 🔴 stance, and debate it out in a structured,
two-column discussion — backed by live statistics.

This is a **static HTML/CSS/JavaScript** rewrite of the original PHP+MySQL
app, built specifically so it can be hosted for free on **GitHub Pages**.
There is no server of this app's own — every read/write goes straight from
the browser to **Supabase** (Postgres + Auth + Storage), and all
authorization/business rules (permanent stances, profanity filtering,
notification triggers, badge scoring, admin-only actions) are enforced
**inside the database** via Row Level Security policies and triggers, not
in JavaScript. A user could open dev tools and read every line of this
site's JS — that's fine, because the JS has no special privileges the
database doesn't already grant it.

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → sign up (free tier is enough) → **New project**.
2. Wait for it to finish provisioning (~2 minutes).
3. Go to **SQL Editor** in the left sidebar → **New query**, and run these four files from `database/` **in this exact order** (copy-paste each file's contents, click Run, then move to the next):
   1. `supabase-schema.sql` — tables
   2. `supabase-functions.sql` — RLS helper functions, triggers, RPCs
   3. `supabase-rls.sql` — Row Level Security policies
   4. `supabase-views.sql` — the `issues_with_comment_count` view
   5. `supabase-storage.sql` — avatar/cover-image storage buckets

   Order matters: functions reference tables, RLS policies reference
   functions, and the view/storage files reference both.

4. (Optional but recommended) Under **Authentication → Providers**, email
   confirmation is on by default — new users get a confirmation email
   automatically from Supabase. This is what powers the "Verified User"
   badge; no code changes needed for it.
5. (Recommended) Under **Authentication → Settings → Bot and Abuse
   Protection**, enable **Cloudflare Turnstile CAPTCHA**. This app ships a
   simple math question on the sign-up form for casual deterrence, but a
   *static site has no server of its own to truly enforce a CAPTCHA* — a
   bot can call the Supabase API directly. Turnstile is verified by
   Supabase itself, server-side, and is the real protection.

## 2. Connect the site to your project

Open `assets/js/config.js` and fill in your project's URL and anon key
(found in **Project Settings → API**):

```js
window.JANVOICE_CONFIG = {
    SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
    SUPABASE_ANON_KEY: 'eyJ...',
};
```

The anon key is meant to be public/client-visible — it is **not** a
secret. Access control comes entirely from the RLS policies you ran in
step 1, not from hiding this key. **Never** put your `service_role` key
anywhere in this folder.

Until you fill this in, every page shows a yellow "Supabase is not
configured" banner and works with empty data instead of crashing.

## 3. Test locally

Any static file server works, e.g.:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

## 4. Deploy to GitHub Pages

1. Push this folder to a GitHub repository (see the main branch of this repo).
2. In the repo, go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**, pick your branch and
   the `/ (root)` folder (or `/janvoice-web` if this folder lives inside a
   larger repo), then **Save**.
4. GitHub gives you a URL like `https://<username>.github.io/<repo>/` —
   that's your live site.

## What changed from the PHP version, and why

| PHP version | This version | Why |
|---|---|---|
| PHP sessions | Supabase Auth (JWT) | No server to hold PHP sessions |
| MySQL + PDO | Postgres (Supabase) | GitHub Pages can't run MySQL either way; Supabase is Postgres-only |
| `require_login()` / `require_admin()` in controllers | Row Level Security policies + `is_admin()` | The real security boundary now lives in the database, not in JS that anyone can read |
| Controllers creating notifications/badges as side effects | Postgres trigger functions (`database/supabase-functions.sql`) | Triggers fire no matter *how* a row gets inserted — this app's pages, or a raw API call — so the logic can't be bypassed |
| `.htaccess` blocking `/includes/`, `/models/` etc. | N/A — there is no server-side code to protect | Nothing sensitive is deployed; the anon key is meant to be public |
| PHP-side profanity filter | A Postgres trigger (`check_profanity`) | Enforced in the database, so it can't be bypassed by calling the Supabase API directly — actually *stronger* than the old PHP version |
| PHP-side CAPTCHA | Client-side math question only | **Not real bot protection** on its own — see the Turnstile recommendation above |
| Server-rendered `<title>`/meta tags per page | JS updates them after data loads (`jv.setPageMeta`) | A static site has one `issue.html` file shared by every issue; there's no server to render a unique file per issue. This is weaker for SEO than true server rendering, but crawlers that execute JS still pick it up |
| Contact form saved to `activity_logs` | Client-side acknowledgement only, no storage | No backend to receive/store it; wire a Supabase Edge Function or a form service (Formspree, etc.) if you need this |

## Project structure

```
janvoice-web/
  index.html, login.html, register.html, issue.html, ...   — pages
  admin/                                                     — admin panel pages
  partials/            — header/footer HTML injected via assets/js/include.js
  assets/css/style.css — same design system as the PHP version
  assets/js/
    config.js           — YOUR Supabase URL/key go here
    supabase-client.js   — creates the shared client (or a safe stub if unconfigured)
    common.js             — nav rendering, toasts, auth helpers, notifications
    issue.js, dashboard.js, admin-*.js, ...  — one file per page
  database/
    supabase-schema.sql, supabase-functions.sql, supabase-rls.sql,
    supabase-views.sql, supabase-storage.sql   — run these in Supabase, in order
```
