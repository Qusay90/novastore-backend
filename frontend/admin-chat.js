document.addEventListener('DOMContentLoaded', () => {
    const chatUsersList = document.getElementById('admin-chat-users');
    const chatMessages = document.getElementById('admin-chat-messages');
    const chatInput = document.getElementById('admin-chat-input');
    const sendChatBtn = document.getElementById('admin-send-chat');
    const chatHeader = document.getElementById('admin-chat-header');

    let currentChatUserId = null;
    const adminToken = localStorage.getItem('nova_admin_token');
    let adminUserId = 1;

    try {
        const payload = JSON.parse(atob((adminToken || '').split('.')[1] || ''));
        if (payload && Number.isInteger(Number(payload.id))) adminUserId = Number(payload.id);
    } catch (_) { }

    async function loadChatUsers() {
        try {
            const res = await fetch('/api/messages/users', {
                headers: { Authorization: `Bearer ${adminToken}` }
            });

            if (res.ok) {
                const users = await res.json();
                renderChatUsers(users);
            } else {
                chatUsersList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Kullan\u0131c\u0131lar y\u00fcklenemedi.</div>';
            }
        } catch (err) {
            console.error(err);
        }
    }

    function renderChatUsers(users) {
        if (users.length === 0) {
            chatUsersList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Hen\u00fcz mesaj yok.</div>';
            return;
        }

        chatUsersList.innerHTML = '';
        users.forEach((user) => {
            const item = document.createElement('div');
            item.className = 'chat-user-item';
            item.innerHTML = `
                <div>
                    <div class="chat-user-item-name">${user.name}</div>
                    <div style="font-size: 0.8rem; color: #666;">${user.email}</div>
                </div>
            `;

            item.addEventListener('click', () => {
                document.querySelectorAll('.chat-user-item').forEach((el) => el.classList.remove('active'));
                item.classList.add('active');
                openUserChat(user);
            });

            chatUsersList.appendChild(item);
        });
    }

    async function openUserChat(user) {
        currentChatUserId = user.id;
        chatHeader.innerHTML = `<span>&#128172; ${user.name} ile G\u00f6r\u00fc\u015f\u00fcl\u00fcyor</span>`;
        chatInput.disabled = false;
        sendChatBtn.disabled = false;
        chatInput.focus();

        chatMessages.innerHTML = '<div style="text-align: center; color: #999;">Mesajlar y\u00fckleniyor...</div>';

        try {
            const res = await fetch(`/api/messages/history/${user.id}`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });

            if (res.ok) {
                const history = await res.json();
                chatMessages.innerHTML = '';

                if (history.length === 0) {
                    chatMessages.innerHTML = '<div style="text-align: center; color: #999;">Sohbet ge\u00e7mi\u015fi yok. \u0130lk mesaj\u0131 g\u00f6nderin!</div>';
                } else {
                    history.forEach((msg) => {
                        const type = msg.sender_id == adminUserId ? 'sent' : 'received';
                        addAdminMessageToUI(msg, type);
                    });
                }
            }
        } catch (_) {
            chatMessages.innerHTML = '<div style="text-align: center; color: #999;">Hata olu\u015ftu.</div>';
        }
    }

    function addAdminMessageToUI(msg, type) {
        const placeholders = chatMessages.querySelectorAll('div[style*="text-align: center"]');
        placeholders.forEach((p) => p.remove());

        const timeStr = new Date(msg.created_at || Date.now()).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });

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
            sender_id: adminUserId,
            receiver_id: currentChatUserId,
            message: messageText
        };

        addAdminMessageToUI(msgObj, 'sent');

        try {
            const res = await fetch('/api/messages/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify(msgObj)
            });

            if (res.ok) {
                const savedMsg = await res.json();
                if (window.socket && window.socket.connected) {
                    window.socket.emit('send_message', { ...savedMsg, receiver_role: 'customer' });
                }
            } else {
                console.error('Mesaj gonderilemedi');
            }
        } catch (err) {
            console.error('Mesaj gonderim hatasi:', err);
        }
    }

    sendChatBtn.addEventListener('click', sendAdminMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAdminMessage();
    });

    if (typeof io !== 'undefined' && !window.socket) {
        window.socket = io();
        window.socket.emit('join_room', 'admin_room');
    }

    if (window.socket) {
        window.socket.on('receive_message', (data) => {
            if (data.receiver_id == adminUserId) {
                if (currentChatUserId == data.sender_id) {
                    addAdminMessageToUI(data, 'received');
                } else {
                    loadChatUsers();
                    const notifBell = document.getElementById('notif-bell');
                    if (notifBell) {
                        notifBell.classList.add('ring');
                        setTimeout(() => notifBell.classList.remove('ring'), 1000);
                    }
                }
            }
        });
    }

    const originalSwitchTab = window.switchTab;
    window.switchTab = function (tabId, el) {
        if (originalSwitchTab) originalSwitchTab(tabId, el);
        if (tabId === 'chat') {
            loadChatUsers();
        }
    };
});
