/**
 * NovaStore - Musteri Bildirim Sistemi
 * Sadece musteri sayfalari icin calisir. Admin panelinin kendi sistemi vardir.
 */

let _notifSocket = null;
let _currentUserId = null;

function _authHeaders(extra = {}) {
    const token = localStorage.getItem('nova_user_token');
    return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

const NOTIF_META = {
    order_update: { emoji: '&#128230;', title: 'Sipari\u015f G\u00fcncellendi', color: '#3b82f6', page: 'profile.html', tab: 'orders' },
    new_order: { emoji: '&#128722;', title: 'Yeni Sipari\u015f', color: '#F7941D', page: null, tab: null },
    new_review: { emoji: '&#11088;', title: 'Yeni Yorum', color: '#a855f7', page: 'profile.html', tab: 'reviews' },
    low_stock: { emoji: '&#9888;&#65039;', title: 'D\u00fc\u015f\u00fck Stok', color: '#ef4444', page: null, tab: null },
    welcome: { emoji: '&#128075;', title: 'Ho\u015f Geldiniz', color: '#22c55e', page: null, tab: null },
    question_answered: { emoji: '&#128172;', title: 'Soru Cevapland\u0131', color: '#2E7D32', page: 'profile.html', tab: 'questions' }
};

function initNotifications() {
    const isAdminPage = window.location.pathname.includes('admin.html');
    if (isAdminPage) return;

    const userInfoStr = localStorage.getItem('nova_user_info');
    if (!userInfoStr) return;

    try {
        const user = JSON.parse(userInfoStr);
        _currentUserId = user.id || user.userId;
        if (!_currentUserId) return;

        _requestNotifPermission();
        _connectSocket(`user_${_currentUserId}`);
        _fetchUserNotifications(_currentUserId);
    } catch (_) { }

    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('notificationWrapper');
        if (wrapper && !wrapper.contains(e.target)) _closeDropdown();
    });
}

function _requestNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    if (localStorage.getItem('nova_notif_banner_dismissed')) return;
    _showPermissionBanner();
}

function _showPermissionBanner() {
    if (document.getElementById('notif-permission-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'notif-permission-banner';
    banner.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#0F2A43; color:white; padding:14px 24px; border-radius:14px; box-shadow:0 8px 24px rgba(0,0,0,0.2); display:flex; align-items:center; gap:14px; z-index:99999; font-family:Inter,sans-serif; font-size:0.9rem; max-width:90%;';
    banner.innerHTML = `
        <span>&#128276; Sipari\u015fleriniz hakk\u0131nda bildirim almak ister misiniz?</span>
        <button id="btn-enable-notif" style="background:#F7941D; border:none; color:white; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:700; white-space:nowrap;">Evet, \u0130zin Ver</button>
        <button id="btn-dismiss-notif" style="background:rgba(255,255,255,0.15); border:none; color:white; padding:6px 12px; border-radius:8px; cursor:pointer;">Hay\u0131r</button>
    `;

    document.body.appendChild(banner);

    document.getElementById('btn-enable-notif').onclick = () => {
        Notification.requestPermission().then((perm) => {
            _hidePermissionBanner();
            if (perm === 'granted') {
                alert('\u2705 Bildirimler aktif! Art\u0131k sipari\u015fleriniz hakk\u0131nda anl\u0131k bildirim alacaks\u0131n\u0131z.');
            } else {
                localStorage.setItem('nova_notif_banner_dismissed', '1');
            }
        });
    };

    document.getElementById('btn-dismiss-notif').onclick = () => {
        localStorage.setItem('nova_notif_banner_dismissed', '1');
        _hidePermissionBanner();
    };
}

function _hidePermissionBanner() {
    const banner = document.getElementById('notif-permission-banner');
    if (banner) banner.remove();
}

function _connectSocket(room) {
    if (typeof io === 'undefined') return;

    try {
        _notifSocket = io(undefined, { transports: ['websocket', 'polling'] });
        window.socket = _notifSocket;

        _notifSocket.on('connect', () => {
            _notifSocket.emit('join_room', room);
        });

        _notifSocket.on('new_notification', (notif) => {
            _prependNotifToDOM(notif);
            _updateBadge(1);
            showToast(notif);
            _showBrowserPopup(notif);
        });
    } catch (_) { }
}

async function _fetchUserNotifications(userId) {
    try {
        const res = await fetch(`/api/notifications/user/${userId}`, { headers: _authHeaders() });
        const data = await res.json();
        _renderNotifications(data);
    } catch (_) { }
}

function _renderNotifications(notifications) {
    const list = document.getElementById('notifList');
    if (!list) return;

    if (!notifications || notifications.length === 0) {
        list.innerHTML = '<div class="notif-empty"><i>&#128276;</i><p>Hen\u00fcz bildiriminiz yok</p></div>';
        _updateBadge(0, true);
        return;
    }

    list.innerHTML = '';
    let unread = 0;

    notifications.forEach((n) => {
        if (!n.is_read) unread++;
        list.innerHTML += _buildNotifItemHTML(n);
    });

    _setBadgeCount(unread);
}

function _prependNotifToDOM(notif) {
    const list = document.getElementById('notifList');
    if (!list) return;

    const empty = list.querySelector('.notif-empty');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.innerHTML = _buildNotifItemHTML(notif);
    list.prepend(div.firstElementChild);
}

function _buildNotifItemHTML(n) {
    const meta = NOTIF_META[n.type] || { emoji: '&#128276;', title: 'Bildirim' };
    const readCls = n.is_read ? '' : 'unread';
    const time = _timeAgo(n.created_at);

    return `
        <div class="notif-item ${readCls}"
             data-id="${n.id}"
             data-type="${n.type}"
             onclick="handleNotifClick(${n.id}, '${n.type}', this)">
            <div class="notif-icon ${n.type}">${meta.emoji}</div>
            <div class="notif-body">
                <div class="notif-message">${n.message}</div>
                <div class="notif-time">${time}</div>
            </div>
        </div>`;
}

function _getNotifUrl(type) {
    const routes = {
        order_update: 'profile.html?tab=orders',
        new_review: 'profile.html?tab=reviews',
        welcome: 'profile.html?tab=orders',
        question_answered: 'profile.html?tab=questions'
    };

    return routes[type] || null;
}

function _navigateToNotif(type) {
    const url = _getNotifUrl(type);
    if (!url) return;

    if (window.location.pathname.includes('profile.html')) {
        const tab = url.split('tab=')[1];
        if (tab) {
            const mapObj = { orders: 1, reviews: 2, favorites: 3, questions: 4, address: 5 };
            const tabIndex = mapObj[tab] || 1;
            const tabEl = document.querySelector(`.profile-nav li:nth-child(${tabIndex})`);
            if (tabEl) {
                tabEl.click();
                _closeDropdown();
            }
        }
    } else {
        window.location.href = url;
    }
}

function _setBadgeCount(count) {
    const badge = document.getElementById('notifBadge');
    const unreadSpan = document.getElementById('unreadCount');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
        if (unreadSpan) {
            unreadSpan.textContent = count;
            unreadSpan.style.display = 'inline';
        }
    } else {
        badge.style.display = 'none';
        if (unreadSpan) unreadSpan.style.display = 'none';
    }
}

function _updateBadge(delta, reset = false) {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;

    if (reset) {
        _setBadgeCount(0);
        return;
    }

    const current = parseInt(badge.textContent, 10) || 0;
    _setBadgeCount(Math.max(0, current + delta));
}

function toggleNotificationDropdown(event) {
    if (event) event.stopPropagation();
    const dd = document.getElementById('notificationDropdown');
    if (!dd) return;
    dd.classList.toggle('open');
}

function _closeDropdown() {
    const dd = document.getElementById('notificationDropdown');
    if (dd) dd.classList.remove('open');
}

async function handleNotifClick(id, type, el) {
    if (el.classList.contains('unread')) {
        try {
            await fetch(`/api/notifications/${id}/read`, { method: 'PATCH', headers: _authHeaders() });
            el.classList.remove('unread');
            _updateBadge(-1);
        } catch (_) { }
    }

    _navigateToNotif(type);
    _closeDropdown();
}

async function markAllNotificationsRead() {
    if (!_currentUserId) return;

    try {
        await fetch(`/api/notifications/read-all/${_currentUserId}`, { method: 'PATCH', headers: _authHeaders() });
        document.querySelectorAll('.notif-item.unread').forEach((el) => el.classList.remove('unread'));
        _setBadgeCount(0);
    } catch (_) { }
}

function _showBrowserPopup(notif) {
    if (!('Notification' in window)) return;

    const show = () => {
        const meta = NOTIF_META[notif.type] || { emoji: '&#128276;', title: 'Bildirim' };
        const n = new Notification(`NovaStore - ${meta.title}`, {
            body: notif.message,
            icon: 'https://img.icons8.com/color/48/shopping-cart--v1.png',
            tag: 'novastore-user-' + notif.id,
            requireInteraction: false
        });

        n.onclick = () => {
            window.focus();
            const url = _getNotifUrl(notif.type);
            if (url) window.location.href = url;
            n.close();
        };

        setTimeout(() => n.close(), 8000);
    };

    if (Notification.permission === 'granted') {
        show();
    } else if (Notification.permission === 'default') {
        if (!localStorage.getItem('nova_notif_banner_dismissed')) {
            _showPermissionBanner();
        }
    }
}

function showToast(notifOrMsg, type = 'order_update') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const message = typeof notifOrMsg === 'string' ? notifOrMsg : notifOrMsg.message;
    const notifType = typeof notifOrMsg === 'string' ? type : notifOrMsg.type;
    const notifObj = typeof notifOrMsg === 'object' ? notifOrMsg : null;
    const meta = NOTIF_META[notifType] || { emoji: '&#128276;', title: 'Bildirim' };

    const toast = document.createElement('div');
    toast.className = `toast ${_toastClass(notifType)}`;
    toast.style.cursor = notifObj ? 'pointer' : 'default';
    toast.innerHTML = `
        <div class="toast-icon">${meta.emoji}</div>
        <div class="toast-content">
            <div class="toast-title">${meta.title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="event.stopPropagation(); _removeToast(this.parentElement)">&#10005;</button>
    `;

    if (notifObj) {
        toast.addEventListener('click', (e) => {
            if (e.target.classList.contains('toast-close')) return;
            _navigateToNotif(notifObj.type);
        });
    }

    container.appendChild(toast);
    setTimeout(() => _removeToast(toast), 5000);
}

function _removeToast(toast) {
    if (!toast || !toast.parentElement) return;
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 320);
}

function _toastClass(type) {
    const map = {
        order_update: 'info',
        new_order: 'warning',
        new_review: 'info',
        low_stock: 'error',
        welcome: 'success',
        question_answered: 'success'
    };

    return map[type] || 'info';
}

function _timeAgo(dateStr) {
    if (!dateStr) return '';

    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Az \u00f6nce';
    if (diff < 3600) return `${Math.floor(diff / 60)} dk \u00f6nce`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} sa \u00f6nce`;
    return `${Math.floor(diff / 86400)} g\u00fcn \u00f6nce`;
}
