'use strict';
// Same supported legacy customer login and storage contract; no registration path.
document.getElementById('review-login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    const message = document.getElementById('review-login-message');
    button.disabled = true;
    message.textContent = 'Giriş yapılıyor…';
    try {
        const response = await fetch('/api/users/login', {
            method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email: form.elements.email.value, password: form.elements.password.value}),
        });
        const result = await response.json();
        if (!response.ok || typeof result.token !== 'string' || !result.user) {
            message.textContent = 'Giriş yapılamadı. E-posta adresinizi ve şifrenizi kontrol edip tekrar deneyin.';
            return;
        }
        localStorage.setItem('nova_user_token', result.token);
        localStorage.setItem('nova_user_info', JSON.stringify(result.user));
        form.elements.password.value = '';
        window.location.assign('/profile.html');
    } catch {
        message.textContent = 'Şu anda giriş yapılamıyor. Lütfen daha sonra tekrar deneyin.';
    } finally {
        button.disabled = false;
    }
});
