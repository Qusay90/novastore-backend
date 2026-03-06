/**
 * NovaStore - Müşteri Bildirim Sistemi (notifications.js)
 * SADECE müşteri sayfaları için (index.html). Admin panelinin kendi sistemi var.
 * Tıklanınca → profile.html#orders veya ilgili sekme açılır.
 */

let _notifSocket = null;
let _currentUserId = null;

// Bildirim tiplerine göre meta
const NOTIF_META = {
    order_update: { emoji: '🚚', title: 'Sipariş Güncellendi', color: '#3b82f6', page: 'profile.html', tab: 'orders' },
    new_order: { emoji: '🛒', title: 'Yeni Sipariş', color: '#F7941D', page: null, tab: null },
    new_review: { emoji: '⭐', title: 'Yeni Yorum', color: '#a855f7', page: 'profile.html', tab: 'reviews' },
    low_stock: { emoji: '⚠️', title: 'Düşük Stok', color: '#ef4444', page: null, tab: null },
    welcome: { emoji: '🎉', title: 'Hoş Geldiniz', color: '#22c55e', page: null, tab: null },
    question_answered: { emoji: '💬', title: 'Soru Cevaplandı', color: '#2E7D32', page: 'profile.html', tab: 'questions' },
};

// ─────────────────────────────────────────────────────────────────
//  BAŞLATICI — Sadece giriş yapmış MÜŞTERİ için çalışır
//  (Admin sayfası değilse ve kullanıcı token varsa)
// ─────────────────────────────────────────────────────────────────
function initNotifications() {
    // Bu sayfa admin paneli değilse ve kullanıcı giriş yapmışsa çalıştır
    const isAdminPage = window.location.pathname.includes('admin.html');
    if (isAdminPage) return; // Admin panelinin kendi sistemi var

    const userInfoStr = localStorage.getItem('nova_user_info');
    if (!userInfoStr) return; // Giriş yapılmamış

    try {
        const user = JSON.parse(userInfoStr);
        _currentUserId = user.id || user.userId;
        if (!_currentUserId) return;

        // Bildirim izni iste
        _requestNotifPermission();
        _connectSocket(`user_${_currentUserId}`);
        _fetchUserNotifications(_currentUserId);
    } catch (e) { }

    // Dropdown dışına tıklanınca kapat
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('notificationWrapper');
        if (wrapper && !wrapper.contains(e.target)) _closeDropdown();
    });
}

// Bildirim izni — Otomatik sormak yerine sadece banner gösterir
function _requestNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;   // Zaten verildi
    if (Notification.permission === 'denied') return;    // Zaten reddedildi, rahatsız etme

    // Eğer kullanıcı daha önce banner'ı kapattıysa bir daha gösterme
    if (localStorage.getItem('nova_notif_banner_dismissed')) return;

    // 'default' durumundayız — banner'ı göster
    _showPermissionBanner();
}

// Bildirim izni bannerı — "Bildirimleri Aç" düğmesi
function _showPermissionBanner() {
    if (document.getElementById('notif-permission-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'notif-permission-banner';
    banner.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#0F2A43; color:white; padding:14px 24px; border-radius:14px; box-shadow:0 8px 24px rgba(0,0,0,0.2); display:flex; align-items:center; gap:14px; z-index:99999; font-family:Inter,sans-serif; font-size:0.9rem; max-width:90%;';

    banner.innerHTML = `
        <span>🔔 Siparişleriniz hakkında bildirim almak ister misiniz?</span>
        <button id="btn-enable-notif" style="background:#F7941D; border:none; color:white; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:700; white-space:nowrap;">→ Evet, İzin Ver</button>
        <button id="btn-dismiss-notif" style="background:rgba(255,255,255,0.15); border:none; color:white; padding:6px 12px; border-radius:8px; cursor:pointer;">Hayır</button>
    `;

    document.body.appendChild(banner);

    // Event listenerlar
    document.getElementById('btn-enable-notif').onclick = () => {
        Notification.requestPermission().then(perm => {
            _hidePermissionBanner();
            if (perm === 'granted') {
                alert('✅ Bildirimler aktif! Artık siparişleriniz hakkında anlık bildirim alacaksınız.');
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
    const b = document.getElementById('notif-permission-banner');
    if (b) b.remove();
}

// ─────────────────────────────────────────────────────────────────
//  SOCKET.IO — Kullanıcı odasını dinle
// ─────────────────────────────────────────────────────────────────
function _connectSocket(room) {
    if (typeof io === 'undefined') return;
    try {
        _notifSocket = io('http://localhost:5000', { transports: ['websocket', 'polling'] });
        _notifSocket.on('connect', () => {
            _notifSocket.emit('join_room', room);
        });
        _notifSocket.on('new_notification', (notif) => {
            _prependNotifToDOM(notif);
            _updateBadge(+1);
            showToast(notif);
            _showBrowserPopup(notif);
        });
    } catch (e) { }
}

// ─────────────────────────────────────────────────────────────────
//  API — Bildirimleri Çek
// ─────────────────────────────────────────────────────────────────
async function _fetchUserNotifications(userId) {
    try {
        const res = await fetch(`http://localhost:5000/api/notifications/user/${userId}`);
        const data = await res.json();
        _renderNotifications(data);
    } catch (e) { }
}

// ─────────────────────────────────────────────────────────────────
//  DOM — Render
// ─────────────────────────────────────────────────────────────────
function _renderNotifications(notifications) {
    const list = document.getElementById('notifList');
    if (!list) return;

    if (!notifications || notifications.length === 0) {
        list.innerHTML = `<div class="notif-empty"><i>🔔</i><p>Henüz bildiriminiz yok</p></div>`;
        _updateBadge(0, true);
        return;
    }

    list.innerHTML = '';
    let unread = 0;
    notifications.forEach(n => {
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
    const meta = NOTIF_META[n.type] || { emoji: '🔔', title: 'Bildirim' };
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

// ─────────────────────────────────────────────────────────────────
//  NAVİGASYON — Tıklanınca nereye gidilecek
// ─────────────────────────────────────────────────────────────────
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

    // Aynı sayfadaysak tab geç, farklı sayfadaysak yönlendir
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

// ─────────────────────────────────────────────────────────────────
//  BADGE
// ─────────────────────────────────────────────────────────────────
function _setBadgeCount(count) {
    const badge = document.getElementById('notifBadge');
    const unreadSpan = document.getElementById('unreadCount');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
        if (unreadSpan) { unreadSpan.textContent = count; unreadSpan.style.display = 'inline'; }
    } else {
        badge.style.display = 'none';
        if (unreadSpan) unreadSpan.style.display = 'none';
    }
}

function _updateBadge(delta, reset = false) {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (reset) { _setBadgeCount(0); return; }
    const current = parseInt(badge.textContent) || 0;
    _setBadgeCount(Math.max(0, current + delta));
}

// ─────────────────────────────────────────────────────────────────
//  DROPDOWN TOGGLE
// ─────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────
//  OKUNDU İŞARETLEME + NAVİGASYON
// ─────────────────────────────────────────────────────────────────
async function handleNotifClick(id, type, el) {
    // Okundu işaretle
    if (el.classList.contains('unread')) {
        try {
            await fetch(`http://localhost:5000/api/notifications/${id}/read`, { method: 'PATCH' });
            el.classList.remove('unread');
            _updateBadge(-1);
        } catch (e) { }
    }
    // İlgili sayfaya git
    _navigateToNotif(type);
    _closeDropdown();
}

async function markAllNotificationsRead() {
    if (!_currentUserId) return;
    try {
        await fetch(`http://localhost:5000/api/notifications/read-all/${_currentUserId}`, { method: 'PATCH' });
        document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
        _setBadgeCount(0);
    } catch (e) { }
}

// ─────────────────────────────────────────────────────────────────
//  TARAYICI POPUP BİLDİRİMİ
// ─────────────────────────────────────────────────────────────────
function _showBrowserPopup(notif) {
    if (!('Notification' in window)) return;

    const show = () => {
        const meta = NOTIF_META[notif.type] || { emoji: '🔔', title: 'Bildirim' };
        const n = new Notification(`NovaStore — ${meta.title}`, {
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
        // Bildirim gelince izin defaultsa ve dismissal flag yoksa banner göster
        if (!localStorage.getItem('nova_notif_banner_dismissed')) {
            _showPermissionBanner();
        }
    }
}

// ─────────────────────────────────────────────────────────────────
//  TOAST BİLDİRİMLERİ (sayfa içi)
// ─────────────────────────────────────────────────────────────────
function showToast(notifOrMsg, type = 'order_update') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    // hem obje hem string kabul et
    const message = typeof notifOrMsg === 'string' ? notifOrMsg : notifOrMsg.message;
    const notifType = typeof notifOrMsg === 'string' ? type : notifOrMsg.type;
    const notifObj = typeof notifOrMsg === 'object' ? notifOrMsg : null;

    const meta = NOTIF_META[notifType] || { emoji: '🔔', title: 'Bildirim' };

    const toast = document.createElement('div');
    toast.className = `toast ${_toastClass(notifType)}`;
    toast.style.cursor = notifObj ? 'pointer' : 'default';
    toast.innerHTML = `
        <div class="toast-icon">${meta.emoji}</div>
        <div class="toast-content">
            <div class="toast-title">${meta.title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="event.stopPropagation(); _removeToast(this.parentElement)">✕</button>
    `;

    // Toast'a tıklanınca ilgili sayfaya git
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

// ─────────────────────────────────────────────────────────────────
//  YARDIMCI — Zaman
// ─────────────────────────────────────────────────────────────────
function _timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Az önce';
    if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
    return `${Math.floor(diff / 86400)} gün önce`;
}
