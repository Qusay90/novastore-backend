document.addEventListener('DOMContentLoaded', () => {
    const chatUsersList = document.getElementById('admin-chat-users');
    const chatMessages = document.getElementById('admin-chat-messages');
    const chatInput = document.getElementById('admin-chat-input');
    const sendChatBtn = document.getElementById('admin-send-chat');
    const chatHeader = document.getElementById('admin-chat-header');

    let currentChatUserId = null;
    const adminToken = localStorage.getItem('nova_admin_token'); // admin token
    let adminUserId = 1;
    try {
        const payload = JSON.parse(atob((adminToken || '').split('.')[1] || ''));
        if (payload && Number.isInteger(Number(payload.id))) adminUserId = Number(payload.id);
    } catch (_) { }

    // Admin sayfaya girdiï¿½inde sohbet eden kullanï¿½cï¿½larï¿½ getir
    async function loadChatUsers() {
        try {
            const res = await fetch('/api/messages/users', {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            if (res.ok) {
                const users = await res.json();
                renderChatUsers(users);
            } else {
                chatUsersList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Kullanï¿½cï¿½lar yï¿½klenemedi.</div>';
            }
        } catch (err) {
            console.error(err);
        }
    }

    function renderChatUsers(users) {
        if (users.length === 0) {
            chatUsersList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Henï¿½z mesaj yok.</div>';
            return;
        }

        chatUsersList.innerHTML = '';
        users.forEach(user => {
            const item = document.createElement('div');
            item.className = 'chat-user-item';
            item.innerHTML = `
                <div>
                    <div class="chat-user-item-name">${user.name}</div>
                    <div style="font-size: 0.8rem; color: #666;">${user.email}</div>
                </div>
            `;
            item.addEventListener('click', () => {
                document.querySelectorAll('.chat-user-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                openUserChat(user);
            });
            chatUsersList.appendChild(item);
        });
    }

    async function openUserChat(user) {
        currentChatUserId = user.id;
        chatHeader.innerHTML = `<span>?? ${user.name} ile Gï¿½rï¿½ï¿½ï¿½lï¿½yor</span>`;
        chatInput.disabled = false;
        sendChatBtn.disabled = false;
        chatInput.focus();

        chatMessages.innerHTML = '<div style="text-align: center; color: #999;">Mesajlar yï¿½kleniyor...</div>';

        try {
            const res = await fetch(`/api/messages/history/${user.id}`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            if (res.ok) {
                const history = await res.json();
                chatMessages.innerHTML = '';
                if (history.length === 0) {
                    chatMessages.innerHTML = '<div style="text-align: center; color: #999;">Sohbet geï¿½miï¿½i yok. ï¿½lk mesajï¿½ gï¿½nderin!</div>';
                } else {
                    history.forEach(msg => {
                        const type = msg.sender_id == adminUserId ? 'sent' : 'received';
                        addAdminMessageToUI(msg, type);
                    });
                }
            }
        } catch (err) {
            chatMessages.innerHTML = '<div style="text-align: center; color: #999;">Hata oluï¿½tu.</div>';
        }
    }

    function addAdminMessageToUI(msg, type) {
        // Eï¿½er placeholder varsa kaldï¿½r
        const placeholders = chatMessages.querySelectorAll('div[style*="text-align: center"]');
        placeholders.forEach(p => p.remove());

        const timeStr = new Date(msg.created_at || Date.now()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const bubbleHTML = `
            <div class="admin-chat-bubble ${type}">
                <div>${msg.message}</div>
                <div class="admin-chat-time">${timeStr}</div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', bubbleHTML);
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 50);
    }

    async function sendAdminMessage() {
        if (!currentChatUserId) return;

        const messageText = chatInput.value.trim();
        if (!messageText) return;

        chatInput.value = '';

        const msgObj = {
            sender_id: adminUserId, // Admin
            receiver_id: currentChatUserId,
            message: messageText
        };

        // UI'ya hemen ekle
        addAdminMessageToUI(msgObj, 'sent');

        try {
            const res = await fetch(`/api/messages/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify(msgObj)
            });

            if (res.ok) {
                const savedMsg = await res.json();

                // Baï¿½arï¿½lï¿½ysa Socket ile mï¿½ï¿½teriye gï¿½nder
                if (window.socket && window.socket.connected) {
                    window.socket.emit('send_message', { ...savedMsg, receiver_role: 'customer' });
                }
            } else {
                console.error("Mesaj gï¿½nderilemedi");
            }
        } catch (err) {
            console.error("Mesaj gï¿½nderim hatasï¿½:", err);
        }
    }

    sendChatBtn.addEventListener('click', sendAdminMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAdminMessage();
    });

    // Socket Dinleyicileri (admin panelinde window.socket tanï¿½mlï¿½ mï¿½ kontrol edeceï¿½iz veya burada tanï¿½mlayacaï¿½ï¿½z)
    // Eï¿½er admin.html iï¿½inde <script src="/socket.io/socket.io.js"> varsa:
    if (typeof io !== 'undefined' && !window.socket) {
        window.socket = io();
        window.socket.emit('join_room', 'admin_room');
    }

    if (window.socket) {
        window.socket.on('receive_message', (data) => {
            // Eï¿½er mï¿½ï¿½teri admin'e yolladï¿½ysa
            if (data.receiver_id == adminUserId) {
                // Eï¿½er ilgili mï¿½ï¿½terinin sohbeti aï¿½ï¿½ksa
                if (currentChatUserId == data.sender_id) {
                    addAdminMessageToUI(data, 'received');
                } else {
                    // Kullanï¿½cï¿½ listesinde kullanï¿½cï¿½ yoksa yenile veya unread flag ekle (Basitï¿½e listeyi yeniliyoruz)
                    loadChatUsers();
                    // Ses ï¿½alï¿½nabiliyor
                    const notifBell = document.getElementById('notif-bell');
                    if (notifBell) {
                        notifBell.classList.add('ring');
                        setTimeout(() => notifBell.classList.remove('ring'), 1000);
                    }
                }
            }
        });
    }

    // ï¿½lk yï¿½kleme
    // Sekme tï¿½klandï¿½ï¿½ï¿½nda listeyi gï¿½ncellemesini saï¿½lamak iï¿½in global switchTab'e kanca atï¿½labilir
    // Basitï¿½e ï¿½imdilik 3 saniyede bir veya DOM yï¿½klenince ï¿½alï¿½ï¿½tï¿½ralï¿½m
    const originalSwitchTab = window.switchTab;
    window.switchTab = function (tabId, el) {
        if (originalSwitchTab) originalSwitchTab(tabId, el);
        if (tabId === 'chat') {
            loadChatUsers();
        }
    };
});





