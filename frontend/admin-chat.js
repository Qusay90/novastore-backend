document.addEventListener('DOMContentLoaded', () => {
    const chatUsersList = document.getElementById('admin-chat-users');
    const chatMessages = document.getElementById('admin-chat-messages');
    const chatInput = document.getElementById('admin-chat-input');
    const sendChatBtn = document.getElementById('admin-send-chat');
    const chatHeader = document.getElementById('admin-chat-header');

    let currentChatUserId = null;
    const adminToken = localStorage.getItem('nova_admin_token'); // admin token

    // Admin sayfaya girdiğinde sohbet eden kullanıcıları getir
    async function loadChatUsers() {
        try {
            const res = await fetch('http://localhost:5000/api/messages/users', {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            if (res.ok) {
                const users = await res.json();
                renderChatUsers(users);
            } else {
                chatUsersList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Kullanıcılar yüklenemedi.</div>';
            }
        } catch (err) {
            console.error(err);
        }
    }

    function renderChatUsers(users) {
        if (users.length === 0) {
            chatUsersList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Henüz mesaj yok.</div>';
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
        chatHeader.innerHTML = `<span>💬 ${user.name} ile Görüşülüyor</span>`;
        chatInput.disabled = false;
        sendChatBtn.disabled = false;
        chatInput.focus();

        chatMessages.innerHTML = '<div style="text-align: center; color: #999;">Mesajlar yükleniyor...</div>';

        try {
            const res = await fetch(`http://localhost:5000/api/messages/history/${user.id}`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            if (res.ok) {
                const history = await res.json();
                chatMessages.innerHTML = '';
                if (history.length === 0) {
                    chatMessages.innerHTML = '<div style="text-align: center; color: #999;">Sohbet geçmişi yok. İlk mesajı gönderin!</div>';
                } else {
                    history.forEach(msg => {
                        const type = msg.sender_id == 1 ? 'sent' : 'received';
                        addAdminMessageToUI(msg, type);
                    });
                }
            }
        } catch (err) {
            chatMessages.innerHTML = '<div style="text-align: center; color: #999;">Hata oluştu.</div>';
        }
    }

    function addAdminMessageToUI(msg, type) {
        // Eğer placeholder varsa kaldır
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
            sender_id: 1, // Admin
            receiver_id: currentChatUserId,
            message: messageText
        };

        // UI'ya hemen ekle
        addAdminMessageToUI(msgObj, 'sent');

        try {
            const res = await fetch(`http://localhost:5000/api/messages/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify(msgObj)
            });

            if (res.ok) {
                const savedMsg = await res.json();

                // Başarılıysa Socket ile müşteriye gönder
                if (window.socket && window.socket.connected) {
                    window.socket.emit('send_message', savedMsg);
                }
            } else {
                console.error("Mesaj gönderilemedi");
            }
        } catch (err) {
            console.error("Mesaj gönderim hatası:", err);
        }
    }

    sendChatBtn.addEventListener('click', sendAdminMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAdminMessage();
    });

    // Socket Dinleyicileri (admin panelinde window.socket tanımlı mı kontrol edeceğiz veya burada tanımlayacağız)
    // Eğer admin.html içinde <script src="/socket.io/socket.io.js"> varsa:
    if (typeof io !== 'undefined' && !window.socket) {
        window.socket = io('http://localhost:5000');
        window.socket.emit('join_room', 'admin_room');
    }

    if (window.socket) {
        window.socket.on('receive_message', (data) => {
            // Eğer müşteri admin'e yolladıysa
            if (data.receiver_id == 1) {
                // Eğer ilgili müşterinin sohbeti açıksa
                if (currentChatUserId == data.sender_id) {
                    addAdminMessageToUI(data, 'received');
                } else {
                    // Kullanıcı listesinde kullanıcı yoksa yenile veya unread flag ekle (Basitçe listeyi yeniliyoruz)
                    loadChatUsers();
                    // Ses çalınabiliyor
                    const notifBell = document.getElementById('notif-bell');
                    if (notifBell) {
                        notifBell.classList.add('ring');
                        setTimeout(() => notifBell.classList.remove('ring'), 1000);
                    }
                }
            }
        });
    }

    // İlk yükleme
    // Sekme tıklandığında listeyi güncellemesini sağlamak için global switchTab'e kanca atılabilir
    // Basitçe şimdilik 3 saniyede bir veya DOM yüklenince çalıştıralım
    const originalSwitchTab = window.switchTab;
    window.switchTab = function (tabId, el) {
        if (originalSwitchTab) originalSwitchTab(tabId, el);
        if (tabId === 'chat') {
            loadChatUsers();
        }
    };
});
