document.addEventListener('DOMContentLoaded', () => {

    // Chat arayüzünü DOM'a ekleme
    const chatHTML = `
        <div id="customer-chat-widget">
            <button id="chat-fab" title="Canlı Destek" style="position: fixed; bottom: 20px; right: 20px; background: #0F2A43; color: white; border: none; width: 60px; height: 60px; border-radius: 50%; font-size: 24px; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 1000; transition: transform 0.3s; display: flex; align-items: center; justify-content: center;">
                💬
                <span id="chat-fab-badge" style="display: none; position: absolute; top: -5px; right: -5px; background: #E53935; color: white; width: 22px; height: 22px; border-radius: 50%; font-size: 12px; font-weight: bold; align-items: center; justify-content: center;">0</span>
            </button>

            <div id="chat-window" style="display: none; position: fixed; bottom: 90px; right: 20px; width: 350px; height: 450px; background: white; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); border: 1px solid #EAEAEA; z-index: 1000; flex-direction: column; overflow: hidden; animation: slideUp 0.3s ease;">
                <div style="background: #0F2A43; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
                        <span>🎧</span> Canlı Destek
                    </h3>
                    <button id="close-chat" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">&times;</button>
                </div>
                
                <div id="chat-messages" style="flex: 1; padding: 15px; overflow-y: auto; background: #F9FAFB; display: flex; flex-direction: column; gap: 10px;">
                    <div style="text-align: center; color: #888; font-size: 0.85rem; margin-bottom: 10px;">NovaStore Destek ekibiyle görüşüyorsunuz</div>
                </div>

                <div style="padding: 15px; background: white; border-top: 1px solid #EAEAEA; display: flex; gap: 10px;">
                    <input type="text" id="chat-input" placeholder="Mesajınızı yazın..." style="flex: 1; padding: 10px 15px; border: 1px solid #EAEAEA; border-radius: 20px; outline: none; transition: 0.3s;">
                    <button id="send-chat" style="background: #F7941D; color: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.3s;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
            </div>
            <style>
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                #chat-fab:hover { transform: scale(1.05); }
                #chat-input:focus { border-color: #0F2A43; }
                #send-chat:hover { background: #e08312; }
                
                .chat-bubble { padding: 10px 15px; border-radius: 15px; max-width: 80%; font-size: 0.95rem; line-height: 1.4; word-wrap: break-word;}
                .chat-bubble.sent { background: #0F2A43; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
                .chat-bubble.received { background: white; color: #333; border: 1px solid #EAEAEA; align-self: flex-start; border-bottom-left-radius: 4px; }
                .chat-time { font-size: 0.7rem; margin-top: 5px; opacity: 0.7; text-align: right; }
            </style>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatHTML);

    const chatFab = document.getElementById('chat-fab');
    const chatWindow = document.getElementById('chat-window');
    const closeChat = document.getElementById('close-chat');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChat = document.getElementById('send-chat');
    const chatFabBadge = document.getElementById('chat-fab-badge');

    let isChatOpen = false;
    let unreadCount = 0;

    // Sadece giriş yapmış kullanıcılar mesajlaşabilir
    const token = localStorage.getItem('nova_user_token');
    let userId = null;
    let userRole = null;
    try {
        const userInfo = JSON.parse(localStorage.getItem('nova_user_info'));
        if (userInfo) {
            userId = userInfo.id;
            userRole = userInfo.role;
        }
    } catch (e) { }

    // Admin sayfada müşteri chati görmemeli
    if (userRole === 'admin') return;

    // UI Toggles
    chatFab.addEventListener('click', () => {
        isChatOpen = !isChatOpen;
        chatWindow.style.display = isChatOpen ? 'flex' : 'none';
        if (isChatOpen) {
            unreadCount = 0;
            updateBadge();
            scrollToBottom();
            if (token && userId) loadChatHistory();
        }
    });

    closeChat.addEventListener('click', () => {
        isChatOpen = false;
        chatWindow.style.display = 'none';
    });

    function updateBadge() {
        if (unreadCount > 0) {
            chatFabBadge.style.display = 'flex';
            chatFabBadge.innerText = unreadCount;
        } else {
            chatFabBadge.style.display = 'none';
        }
    }

    function scrollToBottom() {
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 50);
    }

    function addMessageToUI(msg, type) {
        const timeStr = new Date(msg.created_at || Date.now()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const bubbleHTML = `
            <div class="chat-bubble ${type}">
                <div>${msg.message}</div>
                <div class="chat-time">${timeStr}</div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', bubbleHTML);
        scrollToBottom();
    }

    async function loadChatHistory() {
        if (!token || !userId) return;
        try {
            const res = await fetch(`http://localhost:5000/api/messages/history/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const history = await res.json();
                chatMessages.innerHTML = '<div style="text-align: center; color: #888; font-size: 0.85rem; margin-bottom: 10px;">NovaStore Destek ekibiyle görüşüyorsunuz</div>';
                history.forEach(msg => {
                    // Adminin ID'si her zaman 1
                    const type = msg.sender_id == userId ? 'sent' : 'received';
                    addMessageToUI(msg, type);
                });
            }
        } catch (err) {
            console.error("Geçmiş mesajlar yüklenemedi:", err);
        }
    }

    async function sendMessage() {
        if (!token) {
            alert("Canlı desteği kullanabilmek için giriş yapmalısınız.");
            return;
        }

        const messageText = chatInput.value.trim();
        if (!messageText) return;

        chatInput.value = '';

        const msgObj = {
            sender_id: parseInt(userId),
            receiver_id: 1, // Admin
            message: messageText
        };

        // UI'ya hemen ekle
        addMessageToUI(msgObj, 'sent');

        try {
            const res = await fetch(`http://localhost:5000/api/messages/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(msgObj)
            });

            if (res.ok) {
                const savedMsg = await res.json();

                // Başarılıysa Socket ile admin'e gönder
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

    sendChat.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Socket Dinleyicileri (app.js veya notifications.js de window.socket tanımlı)
    // Biraz bekle (socket'in init olması için)
    setTimeout(() => {
        if (window.socket) {
            window.socket.on('receive_message', (data) => {
                // Eğer mesaj admin'den geldiyse (bana gönderilen mesaj)
                if (data.receiver_id == userId) {
                    if (isChatOpen) {
                        addMessageToUI(data, 'received');
                    } else {
                        unreadCount++;
                        updateBadge();
                        // Arka planda geldiğinde listeye eklenmeyebileceğinden, chat açılınca history yüklüyoruz.
                    }
                }
            });
        }
    }, 1500);

});
