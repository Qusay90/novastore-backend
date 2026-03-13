document.addEventListener('DOMContentLoaded', () => {
    const assistantIconMarkup = `<img src="ai-logo.png" alt="" class="chat-header-avatar">`;
    const chatFabIconMarkup = `<img src="ai-logo.png" alt="" class="chat-fab-robot">`;
    const supportIconMarkup = `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12a8 8 0 0 1 16 0"></path>
            <path d="M4 15v-3a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h2v-5H4"></path>
            <path d="M20 15v-3a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2v-5h2"></path>
            <path d="M8 19a6 6 0 0 0 8 0"></path>
        </svg>
    `;

    const chatHTML = `
        <div id="customer-chat-widget">
            <div class="chat-widget-container" id="chatWidget">
                <div class="chat-icon-collapsed" id="chatIconCollapsed" role="button" tabindex="0" aria-label="Canlı destek penceresini aç">
                    <div class="icon-circle">
                        <span class="chat-icon-mark" aria-hidden="true">${chatFabIconMarkup}</span>
                        <div class="live-pulse"></div>
                        <span id="chat-fab-badge">0</span>
                    </div>
                    <span class="chat-label">CANLI DESTEK</span>
                </div>

                <div class="chat-window-expanded" id="chat-window">
                    <div class="chat-header">
                        <div class="chat-header-copy">
                            <div id="chat-title" class="chat-header-title">
                                <span class="chat-header-icon" style="display:inline-flex; align-items:center;">${assistantIconMarkup}</span>
                                <span>NovaStore AI Asistan</span>
                            </div>
                            <div id="chat-subtitle" class="chat-header-subtitle">Ürün bulma, seçim kolaylaştırma ve destek yardımı</div>
                        </div>
                        <button id="closeChat" type="button" class="chat-close-btn" aria-label="Canlı desteği kapat">&times;</button>
                    </div>

                    <div class="chat-mode-strip">
                        <button id="chat-mode-assistant" class="chat-mode-btn active" type="button">AI Asistan</button>
                        <button id="chat-mode-support" class="chat-mode-btn" type="button">Canlı Destek</button>
                    </div>

                    <div id="chat-messages" class="chat-messages-panel"></div>

                    <div class="chat-input-row">
                        <input type="text" id="chat-input" placeholder="Mesajınızı yazın..." class="chat-input-field">
                        <button id="send-chat" class="chat-send-btn" type="button" aria-label="Mesajı gönder">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                    </div>
                </div>
            </div>
            <style>
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes blink { 0%, 80%, 100% { opacity: 0.2; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
                .chat-widget-container {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 1000;
                    display: flex;
                    flex-direction: column-reverse;
                    gap: 14px;
                    align-items: flex-end;
                }
                .chat-icon-collapsed {
                    --chat-primary: #FF8C00;
                    --chat-secondary: #0F2A43;
                    position: relative;
                    width: 72px;
                    height: 72px;
                    background: #0A1931;
                    color: #FFFFFF;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 0;
                    border-radius: 999px;
                    cursor: pointer;
                    box-shadow: 0 12px 28px rgba(10, 25, 49, 0.26);
                    transition: width 0.5s ease, box-shadow 0.5s ease, transform 0.3s ease;
                    overflow: hidden;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    user-select: none;
                    isolation: isolate;
                }
                .chat-icon-collapsed:hover {
                    width: 196px;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 25px rgba(10, 25, 49, 0);
                }
                .chat-icon-collapsed:focus-visible {
                    outline: 3px solid rgba(255, 140, 0, 0.35);
                    outline-offset: 3px;
                }
                .chat-icon-collapsed::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    background: linear-gradient(45deg, var(--chat-primary), var(--chat-secondary));
                    opacity: 0;
                    transition: opacity 0.5s ease;
                    z-index: -1;
                }
                .chat-icon-collapsed:hover::before { opacity: 1; }
                .chat-icon-collapsed::after {
                    content: "";
                    position: absolute;
                    top: 10px;
                    width: 100%;
                    height: 100%;
                    border-radius: inherit;
                    background: linear-gradient(45deg, var(--chat-primary), var(--chat-secondary));
                    transition: opacity 0.5s ease;
                    filter: blur(15px);
                    z-index: -2;
                    opacity: 0;
                }
                .chat-icon-collapsed:hover::after { opacity: 0.5; }
                .icon-circle {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .chat-icon-mark {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 52px;
                    height: 52px;
                    transition: transform 0.5s ease, opacity 0.5s ease;
                    transition-delay: 0.25s;
                }
                .chat-fab-robot {
                    width: 52px;
                    height: 52px;
                    object-fit: contain;
                    display: block;
                    filter: drop-shadow(0 4px 10px rgba(255, 140, 0, 0.24));
                    user-select: none;
                    pointer-events: none;
                }
                .chat-icon-collapsed:hover .chat-icon-mark {
                    transform: scale(0);
                    opacity: 0;
                    transition-delay: 0s;
                }
                .chat-label {
                    position: absolute;
                    font-weight: 800;
                    font-size: 1rem;
                    color: #FFFFFF;
                    letter-spacing: 0.08em;
                    white-space: nowrap;
                    transform: scale(0);
                    opacity: 0;
                    transition: transform 0.5s ease, opacity 0.5s ease;
                    transition-delay: 0s;
                }
                .chat-icon-collapsed:hover .chat-label {
                    transform: scale(1);
                    opacity: 1;
                    transition-delay: 0.25s;
                }
                .live-pulse {
                    position: absolute;
                    top: 14px;
                    right: 14px;
                    width: 12px;
                    height: 12px;
                    background-color: #FF8C00;
                    border-radius: 50%;
                    box-shadow: 0 0 0 rgba(255, 140, 0, 0.7);
                    animation: pulse 1.5s infinite;
                }
                .chat-icon-collapsed.has-unread .live-pulse { opacity: 0; }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(255, 140, 0, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(255, 140, 0, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(255, 140, 0, 0); }
                }
                #chat-fab-badge {
                    position: absolute;
                    display: none;
                    top: 8px;
                    right: 8px;
                    min-width: 20px;
                    height: 20px;
                    padding: 0 5px;
                    border-radius: 999px;
                    background: #E53935;
                    color: #FFFFFF;
                    font-size: 11px;
                    font-weight: 800;
                    align-items: center;
                    justify-content: center;
                    border: 2px solid #FFFFFF;
                    box-shadow: 0 4px 12px rgba(229, 57, 53, 0.32);
                }
                .chat-window-expanded {
                    display: none;
                    width: min(360px, calc(100vw - 28px));
                    height: min(520px, calc(100vh - 100px));
                    background-color: #FFFFFF;
                    border-radius: 18px;
                    box-shadow: 0 18px 40px rgba(10, 25, 49, 0.2);
                    overflow: hidden;
                    transition: all 0.3s ease-in-out;
                    flex-direction: column;
                    border: 1px solid rgba(10, 25, 49, 0.08);
                }
                .chat-header {
                    background: linear-gradient(135deg, #0A1931 0%, #0F2A43 100%);
                    color: #FFFFFF;
                    padding: 15px 16px 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 12px;
                }
                .chat-header-copy { min-width: 0; }
                .chat-header-title {
                    margin: 0;
                    font-size: 1.02rem;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .chat-header-icon {
                    color: #FFD199;
                    flex-shrink: 0;
                    width: 34px;
                    height: 34px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 10px;
                    overflow: hidden;
                    background: rgba(255, 255, 255, 0.08);
                }
                .chat-header-avatar {
                    width: 34px;
                    height: 34px;
                    object-fit: contain;
                    display: block;
                    filter: drop-shadow(0 4px 10px rgba(255, 140, 0, 0.2));
                }
                .chat-header-subtitle {
                    font-size: 0.8rem;
                    opacity: 0.82;
                    margin-top: 4px;
                }
                .chat-close-btn {
                    background: none;
                    border: none;
                    color: #FFFFFF;
                    font-size: 1.55rem;
                    line-height: 1;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    padding: 0;
                }
                .chat-close-btn:hover { color: #FF8C00; }
                .chat-mode-strip {
                    display: flex;
                    gap: 8px;
                    padding: 10px 14px 0;
                    background: #FFFFFF;
                }
                .chat-messages-panel {
                    flex: 1;
                    padding: 15px;
                    overflow-y: auto;
                    background: #F9FAFB;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .chat-input-row {
                    padding: 14px;
                    background: #FFFFFF;
                    border-top: 1px solid #EAEAEA;
                    display: flex;
                    gap: 10px;
                }
                .chat-input-field {
                    flex: 1;
                    padding: 10px 15px;
                    border: 1px solid #EAEAEA;
                    border-radius: 20px;
                    outline: none;
                    transition: 0.3s;
                }
                .chat-input-field:focus { border-color: #0F2A43; }
                .chat-send-btn {
                    background: #FF8C00;
                    color: #FFFFFF;
                    border: none;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: 0.3s;
                    flex-shrink: 0;
                }
                .chat-send-btn:hover { background: #e07d00; }
                .chat-widget-container.active .chat-window-expanded { display: flex; }
                @media (max-width: 640px) {
                    .chat-widget-container { bottom: 14px; right: 14px; }
                    .chat-icon-collapsed { width: 64px; height: 64px; }
                    .chat-icon-collapsed:hover { width: 168px; }
                    .chat-icon-mark { width: 44px; height: 44px; }
                    .chat-fab-robot { width: 44px; height: 44px; }
                    .chat-label { font-size: 0.84rem; letter-spacing: 0.06em; }
                    .live-pulse { top: 12px; right: 12px; width: 11px; height: 11px; }
                    .chat-window-expanded { width: min(360px, calc(100vw - 20px)); height: min(500px, calc(100vh - 90px)); }
                }
                .chat-mode-btn { background: #F4F7FB; color: #0F2A43; border: 1px solid #D7E3F0; border-radius: 999px; padding: 7px 12px; font-size: 0.78rem; cursor: pointer; transition: 0.2s; font-weight: 700; }
                .chat-mode-btn.active { background: #0F2A43; color: #FFFFFF; border-color: #0F2A43; }
                .chat-bubble { padding: 10px 15px; border-radius: 15px; max-width: 88%; font-size: 0.95rem; line-height: 1.5; word-wrap: break-word; }
                .chat-bubble.sent { background: #0F2A43; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
                .chat-bubble.received { background: white; color: #333; border: 1px solid #EAEAEA; align-self: flex-start; border-bottom-left-radius: 4px; }
                .chat-time { font-size: 0.7rem; margin-top: 6px; opacity: 0.7; text-align: right; }
                .chat-helper-note { text-align: center; color: #7A8697; font-size: 0.83rem; margin-bottom: 6px; }
                .chat-chip-wrap { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
                .chat-chip { background: #EEF4FB; color: #0F2A43; border: 1px solid #D7E3F0; border-radius: 999px; padding: 7px 10px; font-size: 0.78rem; cursor: pointer; }
                .chat-chip:hover { border-color: #F7941D; color: #F7941D; }
                .chat-link-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
                .chat-link-item { color: #0F2A43; font-size: 0.82rem; text-decoration: none; font-weight: 600; }
                .chat-link-item:hover { color: #F7941D; }
                .chat-typing { display: inline-flex; gap: 5px; align-items: center; }
                .chat-typing span { width: 7px; height: 7px; background: #A7B4C5; border-radius: 50%; display: inline-block; animation: blink 1.2s infinite; }
                .chat-typing span:nth-child(2) { animation-delay: 0.2s; }
                .chat-typing span:nth-child(3) { animation-delay: 0.4s; }
                .chat-product-grid { display: grid; gap: 10px; margin-top: 12px; }
                .chat-product-card { background: #FFFFFF; border: 1px solid #E6EDF5; border-radius: 12px; padding: 10px; display: grid; grid-template-columns: 64px 1fr; gap: 10px; box-shadow: 0 4px 14px rgba(15, 42, 67, 0.05); }
                .chat-product-image { width: 64px; height: 64px; border-radius: 10px; object-fit: cover; border: 1px solid #EEF1F4; background: #F7F9FB; }
                .chat-product-name { font-size: 0.88rem; font-weight: 700; color: #0F2A43; margin-bottom: 4px; }
                .chat-product-meta { font-size: 0.76rem; color: #6B7280; margin-bottom: 6px; }
                .chat-product-price { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
                .chat-product-price strong { color: #0F2A43; font-size: 0.95rem; }
                .chat-product-price s { color: #9CA3AF; font-size: 0.76rem; }
                .chat-product-actions { display: flex; gap: 8px; flex-wrap: wrap; }
                .chat-card-btn { border: none; border-radius: 999px; padding: 7px 10px; font-size: 0.75rem; font-weight: 700; cursor: pointer; }
                .chat-card-btn.primary { background: #0F2A43; color: white; }
                .chat-card-btn.secondary { background: #FFF4E8; color: #D97706; border: 1px solid #FCD9B3; }
                .chat-card-btn:hover { opacity: 0.92; }
                .chat-system-card { background: linear-gradient(180deg, #FFF9F3 0%, #FFFFFF 100%); border: 1px solid #F6D5B2; border-radius: 12px; padding: 10px 12px; color: #7A4A12; font-size: 0.84rem; }
                .chat-system-card strong { display: block; color: #B45309; margin-bottom: 4px; font-size: 0.82rem; }
            </style>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatHTML);

    const API_BASE = '';
    const AI_HANDOFF_PREFIX = '[AI DESTEK DEVRI]';
    const chatWidget = document.getElementById('chatWidget');
    const chatFab = document.getElementById('chatIconCollapsed');
    const chatWindow = document.getElementById('chat-window');
    const closeChat = document.getElementById('closeChat');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChat = document.getElementById('send-chat');
    const chatFabBadge = document.getElementById('chat-fab-badge');
    const chatTitle = document.getElementById('chat-title');
    const chatSubtitle = document.getElementById('chat-subtitle');
    const assistantModeBtn = document.getElementById('chat-mode-assistant');
    const supportModeBtn = document.getElementById('chat-mode-support');

    const token = localStorage.getItem('nova_user_token');
    let userId = null;
    let userRole = null;

    try {
        const userInfo = JSON.parse(localStorage.getItem('nova_user_info'));
        if (userInfo) {
            userId = userInfo.id;
            userRole = userInfo.role;
        }
    } catch (_) {}

    if (userRole === 'admin') return;

    function ensureChatSocketConnection() {
        if (typeof io === 'undefined' || !userId) return null;

        const existingSocket = window.socket && typeof window.socket.on === 'function'
            ? window.socket
            : null;
        const socket = existingSocket || io(undefined, { transports: ['websocket', 'polling'] });
        window.socket = socket;

        const roomName = `user_${userId}`;
        const joinRoom = () => socket.emit('join_room', roomName);

        if (!socket.__novaChatJoinRoom || socket.__novaChatJoinRoom !== roomName) {
            socket.on('connect', joinRoom);
            socket.__novaChatJoinRoom = roomName;
        }

        if (socket.connected) {
            joinRoom();
        }

        return socket;
    }

    const chatSocket = ensureChatSocketConnection();

    let isChatOpen = false;
    let unreadCount = 0;
    let chatMode = 'assistant';
    let assistantHistory = loadAssistantHistory();

    function getCurrentUserId() {
        try {
            const info = JSON.parse(localStorage.getItem('nova_user_info'));
            return info && info.id ? info.id : 'guest';
        } catch (_) {
            return 'guest';
        }
    }

    function getCartKey() {
        return `novastore_cart_${getCurrentUserId()}`;
    }

    function readCart() {
        try {
            const parsed = JSON.parse(localStorage.getItem(getCartKey()) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function writeCart(cart) {
        localStorage.setItem(getCartKey(), JSON.stringify(cart));
    }

    function syncCartUi(openAfterUpdate = false) {
        if (typeof window.renderCartUI === 'function') {
            window.renderCartUI();
        } else if (typeof window.renderCart === 'function') {
            window.renderCart();
        }

        const badge = document.getElementById('cart-count');
        if (badge) {
            const totalItems = readCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            badge.innerText = totalItems;
        }

        if (openAfterUpdate && typeof window.openCart === 'function') {
            window.openCart();
        }
    }

    function addProductToCart(product) {
        const cart = readCart();
        const existingItem = cart.find((item) => Number(item.id) === Number(product.id));

        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({
                id: Number(product.id),
                name: product.name,
                price: Number(product.price),
                image: product.imageUrl || '',
                old_price: product.oldPrice !== null && product.oldPrice !== undefined ? product.oldPrice : null,
                quantity: 1
            });
        }

        writeCart(cart);
        syncCartUi(true);
    }

    function assistantHistoryKey() {
        return `nova_ai_chat_history_v1_${userId || 'guest'}`;
    }

    function loadAssistantHistory() {
        try {
            const parsed = JSON.parse(localStorage.getItem(assistantHistoryKey()) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function persistAssistantHistory() {
        localStorage.setItem(assistantHistoryKey(), JSON.stringify(assistantHistory.slice(-24)));
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatTime(value) {
        return new Date(value || Date.now()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }

    function formatMoney(value) {
        return `${Number(value || 0).toFixed(2)} TL`;
    }

    function updateBadge() {
        if (unreadCount > 0) {
            chatFabBadge.style.display = 'flex';
            chatFabBadge.innerText = unreadCount;
            chatFab.classList.add('has-unread');
        } else {
            chatFabBadge.style.display = 'none';
            chatFab.classList.remove('has-unread');
        }
    }

    function scrollToBottom() {
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 50);
    }

    function setMode(mode) {
        chatMode = mode;
        const assistantActive = mode === 'assistant';
        assistantModeBtn.classList.toggle('active', assistantActive);
        supportModeBtn.classList.toggle('active', !assistantActive);

        if (assistantActive) {
            chatTitle.innerHTML = `<span class="chat-header-icon" style="display:inline-flex; align-items:center;">${assistantIconMarkup}</span><span>NovaStore AI Asistan</span>`;
            chatSubtitle.innerText = 'Ürün bulma, seçim kolaylaştırma ve destek yardımı';
            chatInput.placeholder = 'Ne aradığınızı yazın...';
            renderAssistantHistory();
        } else {
            chatTitle.innerHTML = `<span class="chat-header-icon" style="display:inline-flex; align-items:center;">${supportIconMarkup}</span><span>NovaStore Canlı Destek</span>`;
            chatSubtitle.innerText = 'Giriş yapan müşteriler için temsilci desteği';
            chatInput.placeholder = 'Destek mesajınızı yazın...';
            renderSupportHistory();
        }
    }

    function renderBubble(html, type, createdAt) {
        const bubbleHTML = `
            <div class="chat-bubble ${type}">
                <div>${html}</div>
                <div class="chat-time">${formatTime(createdAt)}</div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', bubbleHTML);
        scrollToBottom();
    }

    function buildProductCardsHtml(products) {
        if (!Array.isArray(products) || products.length === 0) return '';

        const cards = products.map((product) => {
            const imageUrl = escapeHtml(product.imageUrl || 'https://via.placeholder.com/64?text=Nova');
            const oldPriceHtml = product.oldPrice ? `<s>${escapeHtml(formatMoney(product.oldPrice))}</s>` : '';
            const categoryText = product.category ? `${escapeHtml(product.category)} · ` : '';
            const stockText = Number(product.stock) > 0 ? 'stokta' : 'stok bilgisi sinirli';

            return `
                <div class="chat-product-card">
                    <img class="chat-product-image" src="${imageUrl}" alt="${escapeHtml(product.name)}">
                    <div>
                        <div class="chat-product-name">${escapeHtml(product.name)}</div>
                        <div class="chat-product-meta">${categoryText}${escapeHtml(stockText)}</div>
                        <div class="chat-product-price">
                            <strong>${escapeHtml(formatMoney(product.price))}</strong>
                            ${oldPriceHtml}
                        </div>
                        <div class="chat-product-actions">
                            <button type="button" class="chat-card-btn primary" data-action="add-to-cart" data-product-id="${Number(product.id)}" data-product-name="${encodeURIComponent(product.name)}" data-product-price="${Number(product.price)}" data-product-image="${encodeURIComponent(product.imageUrl || '')}" data-product-old-price="${product.oldPrice !== null && product.oldPrice !== undefined ? Number(product.oldPrice) : ''}">Sepete ekle</button>
                            <a class="chat-card-btn secondary" href="${encodeURI(product.productUrl)}" style="text-decoration:none; display:inline-flex; align-items:center;">Ürüne git</a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="chat-product-grid">${cards}</div>`;
    }

    function renderAssistantEntry(entry) {
        const safeText = escapeHtml(entry.message || '').replace(/\n/g, '<br>');
        const productsHtml = buildProductCardsHtml(entry.products || []);
        const suggestions = Array.isArray(entry.suggestions) && entry.suggestions.length > 0
            ? `<div class="chat-chip-wrap">${entry.suggestions.map((item) => `<button type="button" class="chat-chip" data-prompt="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}</div>`
            : '';
        const escalateButton = entry.allowEscalation
            ? '<div class="chat-chip-wrap"><button type="button" class="chat-chip" data-action="escalate">Canlı desteğe bağlan</button></div>'
            : '';

        renderBubble(`${safeText}${productsHtml}${suggestions}${escalateButton}`, entry.role === 'user' ? 'sent' : 'received', entry.createdAt);
    }

    function renderAssistantWelcome() {
        chatMessages.innerHTML = `
            <div class="chat-helper-note">NovaStore AI Asistan ürün bulma, yorum özeti ve karar vermeyi kolaylaştırma konularında yardımcı olur.</div>
            <div class="chat-bubble received">
                <div>
                    Merhaba, hoş geldiniz. Memnuniyetle yardımcı olurum; ihtiyacınıza göre ürün bulabilir, ürünleri karşılaştırabilir, yorumları özetleyebilir ve kargo, iade, ödeme gibi konularda net cevap verebilirim.
                    <div class="chat-chip-wrap">
                        <button type="button" class="chat-chip" data-prompt="1000 TL altı ürün öner">1000 TL altı ürün öner</button>
                        <button type="button" class="chat-chip" data-prompt="Bu ürünün yorumları nasıl?">Bu ürünün yorumları nasıl?</button>
                        <button type="button" class="chat-chip" data-prompt="Kargo ve iade koşulları neler?">Kargo ve iade koşulları</button>
                    </div>
                </div>
                <div class="chat-time">${formatTime(Date.now())}</div>
            </div>
        `;
    }

    function renderAssistantHistory() {
        chatMessages.innerHTML = '';
        if (!assistantHistory.length) {
            renderAssistantWelcome();
            return;
        }

        assistantHistory.forEach((entry) => renderAssistantEntry(entry));
    }

    function formatSupportMessageHtml(message) {
        const text = String(message || '');
        if (text.startsWith(AI_HANDOFF_PREFIX)) {
            const summary = escapeHtml(text.replace(AI_HANDOFF_PREFIX, '').trim()).replace(/\n/g, '<br>');
            return `<div class="chat-system-card"><strong>AI devir özeti</strong>${summary}</div>`;
        }
        return escapeHtml(text).replace(/\n/g, '<br>');
    }

    async function loadSupportHistory() {
        if (!token || !userId) {
            chatMessages.innerHTML = `
                <div class="chat-helper-note">Canli destek modunu kullanmak icin giris yapmaniz gerekiyor.</div>
                <div class="chat-bubble received">
                    <div>Giris yaptiysaniz bu alanda temsilciyle mesajlasabilirsiniz. Giris yoksa AI Asistan ile devam edebiliriz.</div>
                    <div class="chat-time">${formatTime(Date.now())}</div>
                </div>
            `;
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/messages/history/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('support history failed');

            const history = await res.json();
            chatMessages.innerHTML = '<div class="chat-helper-note">NovaStore destek ekibiyle mesajlasiyorsunuz.</div>';
            history.forEach((msg) => {
                const type = Number(msg.sender_id) === Number(userId) ? 'sent' : 'received';
                renderBubble(formatSupportMessageHtml(msg.message), type, msg.created_at || Date.now());
            });
        } catch (err) {
            console.error('Canli destek gecmisi yuklenemedi:', err);
            chatMessages.innerHTML = '<div class="chat-helper-note" style="color:#C62828;">Canli destek gecmisi yuklenemedi.</div>';
        }
    }

    function renderSupportHistory() {
        loadSupportHistory();
    }

    function getPageContext() {
        const params = new URLSearchParams(window.location.search);
        const productId = Number(params.get('id'));
        return {
            page: window.location.pathname.split('/').pop() || 'index.html',
            title: document.title,
            productId: Number.isInteger(productId) ? productId : null
        };
    }

    function buildAssistantSummary() {
        return assistantHistory.slice(-6).map((item) => `${item.role === 'user' ? 'Kullanici' : 'Asistan'}: ${item.message}`).join('\n');
    }

    function appendAssistantEntry(entry) {
        assistantHistory.push(entry);
        persistAssistantHistory();
        if (chatMode === 'assistant') {
            renderAssistantEntry(entry);
        }
    }

    function showTyping(show) {
        const existing = document.getElementById('assistant-typing-bubble');
        if (show && !existing) {
            const typingHTML = `
                <div id="assistant-typing-bubble" class="chat-bubble received">
                    <div class="chat-typing"><span></span><span></span><span></span></div>
                </div>
            `;
            chatMessages.insertAdjacentHTML('beforeend', typingHTML);
            scrollToBottom();
        }
        if (!show && existing) {
            existing.remove();
        }
    }

    async function sendAssistantMessage() {
        const messageText = chatInput.value.trim();
        if (!messageText) return;

        chatInput.value = '';
        appendAssistantEntry({ role: 'user', message: messageText, createdAt: Date.now(), suggestions: [], products: [] });
        showTyping(true);

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/assistant/chat`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    message: messageText,
                    history: assistantHistory.slice(-12).map((item) => ({ role: item.role, message: item.message })),
                    context: getPageContext()
                })
            });

            const payload = await response.json();
            showTyping(false);

            if (!response.ok) {
                appendAssistantEntry({
                    role: 'assistant',
                    message: payload.error || 'AI asistan su an yanit veremiyor.',
                    createdAt: Date.now(),
                    suggestions: ['Canli destege baglan'],
                    products: [],
                    allowEscalation: true
                });
                return;
            }

            appendAssistantEntry({
                role: 'assistant',
                message: payload.reply,
                createdAt: Date.now(),
                suggestions: payload.suggestions || [],
                products: payload.products || [],
                allowEscalation: Boolean(payload.allowEscalation)
            });
        } catch (err) {
            console.error('AI mesaj hatasi:', err);
            showTyping(false);
            appendAssistantEntry({
                role: 'assistant',
                message: 'Sunucuya su an baglanamadim. Isterseniz canli destek moduna gecelim.',
                createdAt: Date.now(),
                suggestions: ['Canli destege baglan'],
                products: [],
                allowEscalation: true
            });
        }
    }

    async function sendSupportMessage() {
        if (!token || !userId) {
            if (confirm('Canlı desteği kullanabilmek için giriş yapmalısınız. Giriş sayfasına gitmek ister misiniz?')) {
                window.location.href = 'login.html';
            }
            setMode('assistant');
            return;
        }

        const messageText = chatInput.value.trim();
        if (!messageText) return;

        chatInput.value = '';

        const msgObj = {
            sender_id: Number(userId),
            receiver_id: 1,
            message: messageText
        };

        renderBubble(escapeHtml(msgObj.message), 'sent', Date.now());

        try {
            const res = await fetch(`${API_BASE}/api/messages/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(msgObj)
            });

            if (res.ok) {
                await res.json();
            } else {
                const errorPayload = await res.json().catch(() => ({}));
                renderBubble(escapeHtml(errorPayload.error || 'Mesaj gönderilemedi. Lütfen tekrar deneyin.'), 'received', Date.now());
            }
        } catch (err) {
            console.error('Mesaj gonderim hatasi:', err);
            renderBubble('Canlı destek şu an bağlanamıyor. Lütfen internet bağlantınızı kontrol edin.', 'received', Date.now());
        }
    }

    async function handleEscalationRequest() {
        if (!token || !userId) {
            alert('Canli destek devri icin once giris yapmaniz gerekiyor.');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/assistant/escalate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ summary: buildAssistantSummary() })
            });

            const payload = await res.json();
            if (!res.ok) {
                // Eğer oturum hatası ise daha net bilgi ver
                if (res.status === 401) {
                    if (confirm('Canlı desteğe bağlanmak için giriş yapmanız gerekiyor. Giriş sayfasına gitmek ister misiniz?')) {
                        window.location.href = 'login.html';
                    }
                } else {
                    alert(payload.error || 'Canlı destek devri şu an yapılamadı.');
                }
                return;
            }

            setMode('support');
        } catch (err) {
            console.error('Escalation hatasi:', err);
            alert('Canlı destek devri şu an yapılamadı. Lütfen internet bağlantınızı kontrol edin.');
        }
    }

    function handleSend() {
        if (chatMode === 'assistant') {
            sendAssistantMessage();
            return;
        }
        sendSupportMessage();
    }

    function openChatWindow() {
        isChatOpen = true;
        chatWidget.classList.add('active');
        chatWindow.style.display = 'flex';
        if (isChatOpen) {
            unreadCount = 0;
            updateBadge();
            if (chatMode === 'assistant') renderAssistantHistory();
            else renderSupportHistory();
            scrollToBottom();
        }
    }

    function closeChatWindow() {
        isChatOpen = false;
        chatWidget.classList.remove('active');
        chatWindow.style.display = 'none';
    }

    function toggleChatWindow() {
        if (isChatOpen) {
            closeChatWindow();
            return;
        }
        openChatWindow();
    }

    chatFab.addEventListener('click', toggleChatWindow);
    chatFab.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleChatWindow();
        }
    });

    closeChat.addEventListener('click', closeChatWindow);

    assistantModeBtn.addEventListener('click', () => setMode('assistant'));
    supportModeBtn.addEventListener('click', () => setMode('support'));
    sendChat.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') handleSend();
    });

    chatMessages.addEventListener('click', (event) => {
        const actionTarget = event.target.closest('[data-action], [data-prompt]');
        if (!actionTarget) return;

        const prompt = actionTarget.getAttribute('data-prompt');
        const action = actionTarget.getAttribute('data-action');

        if (prompt) {
            chatInput.value = prompt;
            chatInput.focus();
            if (chatMode === 'assistant') {
                sendAssistantMessage();
            }
            return;
        }

        if (action === 'escalate') {
            handleEscalationRequest();
            return;
        }

        if (action === 'add-to-cart') {
            const product = {
                id: Number(actionTarget.getAttribute('data-product-id')),
                name: decodeURIComponent(actionTarget.getAttribute('data-product-name') || ''),
                price: Number(actionTarget.getAttribute('data-product-price') || 0),
                imageUrl: decodeURIComponent(actionTarget.getAttribute('data-product-image') || ''),
                oldPrice: actionTarget.getAttribute('data-product-old-price') ? Number(actionTarget.getAttribute('data-product-old-price')) : null
            };
            addProductToCart(product);
            const originalText = actionTarget.textContent;
            actionTarget.textContent = 'Eklendi';
            actionTarget.disabled = true;
            setTimeout(() => {
                actionTarget.textContent = originalText;
                actionTarget.disabled = false;
            }, 1200);
        }
    });

    if (chatSocket && !chatSocket.__novaChatReceiveBound) {
        chatSocket.on('receive_message', (data) => {
            if (Number(data.receiver_id) === Number(userId)) {
                if (isChatOpen && chatMode === 'support') {
                    renderBubble(formatSupportMessageHtml(data.message), 'received', data.created_at || Date.now());
                } else {
                    unreadCount += 1;
                    updateBadge();
                }
            }
        });
        chatSocket.__novaChatReceiveBound = true;
    }

    setMode('assistant');
});
