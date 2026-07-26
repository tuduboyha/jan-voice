/**
 * Jan Voice — create-issue.html submission.
 */
(async function () {
    'use strict';

    const supabase = window.jv.supabase;
    const session = await window.jv.requireLogin();
    if (!session) return;

    async function loadCategories() {
        const { data } = await supabase.from('issue_categories').select('id, name').eq('is_active', true).order('name');
        const select = document.getElementById('categorySelect');
        (data || []).forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            select.appendChild(opt);
        });
    }

    let captchaAnswer = 0;
    function newCaptcha() {
        const a = Math.floor(Math.random() * 12) + 1;
        const b = Math.floor(Math.random() * 12) + 1;
        captchaAnswer = a + b;
        document.getElementById('captchaQuestion').textContent = `What is ${a} + ${b}?`;
    }

    function friendlyError(error) {
        if (error?.message?.includes('profanity_detected')) {
            return 'Your submission contains language that violates our Community Guidelines. Please revise and try again.';
        }
        return error?.message || 'Something went wrong.';
    }

    document.getElementById('createIssueForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const title = form.title.value.trim();
        const summary = form.summary.value.trim();
        const description = form.description.value.trim();
        const categoryId = form.category_id.value || null;
        const location = form.location.value.trim();
        const sourceLinks = form.source_links.value.trim();
        const isAnonymous = form.is_anonymous.checked;
        const tags = form.tags.value.split(',').map((t) => t.trim()).filter(Boolean);
        const answer = Number(form.captcha_answer.value);
        const file = form.cover_image.files[0];

        if (answer !== captchaAnswer) {
            window.jv.showToast('Incorrect answer to the security check. Please try again.', 'error');
            newCaptcha();
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        let coverImageUrl = null;
        if (file) {
            const ext = file.name.split('.').pop();
            const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
            const { error: uploadError } = await supabase.storage.from('issue-covers').upload(path, file);
            if (uploadError) {
                window.jv.showToast('Image upload failed: ' + uploadError.message, 'error');
                submitBtn.disabled = false;
                return;
            }
            coverImageUrl = supabase.storage.from('issue-covers').getPublicUrl(path).data.publicUrl;
        }

        const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const slug = slugBase + '-' + Date.now().toString(36);

        const { data: issue, error } = await supabase
            .from('issues')
            .insert({
                user_id: session.user.id,
                category_id: categoryId,
                title, slug, summary, description,
                cover_image: coverImageUrl,
                location: location || null,
                source_links: sourceLinks || null,
                is_anonymous: isAnonymous,
            })
            .select()
            .single();

        submitBtn.disabled = false;

        if (error) {
            window.jv.showToast(friendlyError(error), 'error');
            newCaptcha();
            return;
        }

        if (tags.length) {
            await supabase.from('issue_tags').insert(tags.map((tag) => ({ issue_id: issue.id, tag })));
        }

        window.jv.showToast('Your issue has been submitted and is pending review.', 'success');
        window.location.href = 'dashboard.html?tab=my-issues';
    });

    newCaptcha(); // captchaQuestion lives in the page body, not a partial — no need to wait
    loadCategories();
})();
