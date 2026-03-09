let globalOrders = [];
        let globalProducts = [];
        let globalCategories = []; // Kategorileri tutacak
        let editingProductId = null;
        let salesChartInstance = null; // Grafiği sıfırlamak için
        const _nativeFetch = window.fetch.bind(window);
        function adminApiFetch(input, init = {}) {
            const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
            const isApiCall = typeof url === 'string' && url.includes('/api/');
            if (!isApiCall) return _nativeFetch(input, init);

            const token = localStorage.getItem('nova_admin_token');
            if (!token) return _nativeFetch(input, init);

            const mergedHeaders = new Headers(init.headers || {});
            if (!mergedHeaders.has('Authorization')) {
                mergedHeaders.set('Authorization', `Bearer ${token}`);
            }

            return _nativeFetch(input, { ...init, headers: mergedHeaders });
        }

        async function adminReadJson(response, fallbackMessage = 'İşlem başarısız.') {
            let payload = null;
            try {
                payload = await response.json();
            } catch (_) {
                payload = null;
            }

            if (!response.ok) {
                const apiMessage = payload && (payload.error || payload.mesaj || payload.message);
                const err = new Error(apiMessage || fallbackMessage);
                err.status = response.status;
                throw err;
            }

            return payload;
        }

        function renderOrdersTableError(message) {
            const tbody = document.getElementById('orders-table-body');
            if (!tbody) return;
            tbody.innerHTML = `<tr><td colspan="6" style="color:#C62828; text-align:center; padding:18px;">${message}</td></tr>`;
        }
        function switchTab(tabId, element) {
            document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
            element.classList.add('active');
            document.getElementById('page-title-text').innerText = element.innerText.replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/gi, '');
            document.querySelectorAll('.tab-pane').forEach(tab => tab.classList.remove('active'));
            document.getElementById('tab-' + tabId).classList.add('active');

            if (tabId === 'dashboard') fetchStats();
            if (tabId === 'orders') fetchOrders();
            if (tabId === 'products') fetchProducts();
            if (tabId === 'categories') fetchCategories();
            if (tabId === 'chat') { loadAdminQuestions(); loadAiHandoffs(); }
        }

        function adminLogout() {
            localStorage.removeItem('nova_admin_token');
            window.location.href = 'admin-login.html';
        }

        let aiHandoffItems = [];
        let currentAiHandoffUserId = null;

        function updateAiHandoffBadge(count) {
            const badge = document.getElementById('ai-handoff-count-badge');
            if (!badge) return;
            badge.innerText = String(Number(count) || 0);
        }

        function openAiHandoffModal() {
            const modal = document.getElementById('ai-handoff-modal');
            if (!modal) return;
            modal.style.display = 'flex';
            loadAiHandoffs(true);
        }

        function closeAiHandoffModal() {
            const modal = document.getElementById('ai-handoff-modal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        function getAdminChatUserId() {
            try {
                const token = localStorage.getItem('nova_admin_token') || '';
                const payload = JSON.parse(atob(token.split('.')[1] || ''));
                return Number(payload.id) || 1;
            } catch (_) {
                return 1;
            }
        }

        function escapeAdminHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function cleanAiSummary(message) {
            return String(message || '').replace('[AI DESTEK DEVRI]', '').trim();
        }

        function formatAdminDate(value) {
            if (!value) return '-';
            return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        }

        function setAiHandoffEmptyState(message) {
            const preview = document.getElementById('ai-handoff-preview');
            const thread = document.getElementById('ai-handoff-thread');
            const replyInput = document.getElementById('ai-handoff-reply');
            const replyButton = document.getElementById('ai-handoff-send');
            if (preview) preview.innerHTML = escapeAdminHtml(message || 'Listeden bir müşteri seçin.');
            if (thread) thread.innerHTML = '<div style="height:100%; display:flex; align-items:center; justify-content:center; color:#888;">Aktif AI devir kaydı yok.</div>';
            if (replyInput) { replyInput.value = ''; replyInput.disabled = true; }
            if (replyButton) replyButton.disabled = true;
        }

        function renderAiHandoffList(items) {
            const list = document.getElementById('ai-handoff-list');
            if (!list) return;

            if (!items.length) {
                list.innerHTML = '<div style="padding:22px; color:#888; text-align:center;">Henüz AI devri oluşmadı.</div>';
                setAiHandoffEmptyState('AI devri bekleniyor.');
                return;
            }

            list.innerHTML = items.map((item) => {
                const isActive = Number(item.id) === Number(currentAiHandoffUserId);
                const summary = cleanAiSummary(item.latest_handoff_message || '').slice(0, 140);
                return `
                    <button type="button" onclick="openAiHandoffThread(${Number(item.id)})" style="width:100%; text-align:left; border:none; border-bottom:1px solid var(--border); background:${isActive ? 'rgba(247, 148, 29, 0.10)' : 'transparent'}; padding:16px 18px; cursor:pointer; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                            <div style="font-weight:700; color:var(--heading-color);">${escapeAdminHtml(item.name)}</div>
                            <span style="background:#FFF3E0; color:#E65100; border-radius:999px; padding:4px 8px; font-size:0.72rem; font-weight:700;">AI x${Number(item.handoff_count || 1)}</span>
                        </div>
                        <div style="font-size:0.82rem; color:#667085; line-height:1.45;">${escapeAdminHtml(summary || 'AI devir özeti hazır.')}</div>
                        <div style="font-size:0.74rem; color:#98A2B3;">Son devir: ${escapeAdminHtml(formatAdminDate(item.latest_handoff_at))}</div>
                    </button>
                `;
            }).join('');
        }

        async function loadAiHandoffs(keepSelection = true) {
            const list = document.getElementById('ai-handoff-list');
            if (!list) return;
            list.innerHTML = '<div style="padding:22px; color:#888; text-align:center;">Yükleniyor...</div>';

            try {
                const res = await adminApiFetch('http://localhost:5000/api/messages/handoffs');
                const items = await adminReadJson(res, 'AI devir listesi alınamadı.');
                aiHandoffItems = Array.isArray(items) ? items : [];
                updateAiHandoffBadge(aiHandoffItems.length);
                renderAiHandoffList(aiHandoffItems);

                if (!aiHandoffItems.length) {
                    currentAiHandoffUserId = null;
                    return;
                }

                const activeStillExists = keepSelection && aiHandoffItems.some((item) => Number(item.id) === Number(currentAiHandoffUserId));
                if (activeStillExists) {
                    await openAiHandoffThread(currentAiHandoffUserId, true);
                } else {
                    await openAiHandoffThread(aiHandoffItems[0].id, true);
                }
            } catch (err) {
                console.error('AI handoff yükleme hatası:', err);
                list.innerHTML = `<div style="padding:22px; color:#C62828; text-align:center;">${escapeAdminHtml(err.message || 'AI devir listesi alınamadı.')}</div>`;
                setAiHandoffEmptyState('AI devir bilgisi alınamadı.');
            }
        }

        function renderAiThreadMessages(messages) {
            const adminId = getAdminChatUserId();
            if (!messages.length) {
                return '<div style="height:100%; display:flex; align-items:center; justify-content:center; color:#888;">Bu müşteri için mesaj kaydı yok.</div>';
            }

            return messages.map((msg) => {
                const isAdminMessage = Number(msg.sender_id) === Number(adminId);
                const messageText = String(msg.message || '');
                const createdAt = formatAdminDate(msg.created_at || Date.now());

                if (msg.is_ai_handoff || messageText.startsWith('[AI DESTEK DEVRI]')) {
                    return `
                        <div style="background:linear-gradient(180deg,#FFF7ED 0%,#FFFFFF 100%); border:1px solid #FED7AA; border-radius:14px; padding:14px 16px; margin-bottom:14px; box-shadow:0 6px 18px rgba(15,42,67,0.05);">
                            <div style="font-size:0.76rem; font-weight:800; color:#C2410C; margin-bottom:8px; letter-spacing:0.02em;">AI DEVİR ÖZETİ</div>
                            <div style="font-size:0.88rem; color:#7C2D12; line-height:1.55;">${escapeAdminHtml(cleanAiSummary(messageText)).replace(/\n/g, '<br>')}</div>
                            <div style="font-size:0.72rem; color:#9A3412; margin-top:8px;">${escapeAdminHtml(createdAt)}</div>
                        </div>
                    `;
                }

                return `
                    <div style="display:flex; justify-content:${isAdminMessage ? 'flex-end' : 'flex-start'}; margin-bottom:12px;">
                        <div style="max-width:78%; background:${isAdminMessage ? '#0F2A43' : '#FFFFFF'}; color:${isAdminMessage ? '#FFFFFF' : '#344054'}; border:${isAdminMessage ? 'none' : '1px solid #E5E7EB'}; border-radius:14px; padding:12px 14px; box-shadow:${isAdminMessage ? 'none' : '0 4px 12px rgba(15,42,67,0.04)'};">
                            <div style="font-size:0.9rem; line-height:1.5;">${escapeAdminHtml(messageText).replace(/\n/g, '<br>')}</div>
                            <div style="font-size:0.72rem; margin-top:6px; opacity:0.72; text-align:right;">${escapeAdminHtml(createdAt)}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function openAiHandoffThread(userId, silent = false) {
            currentAiHandoffUserId = Number(userId);
            renderAiHandoffList(aiHandoffItems);

            const preview = document.getElementById('ai-handoff-preview');
            const thread = document.getElementById('ai-handoff-thread');
            const replyInput = document.getElementById('ai-handoff-reply');
            const replyButton = document.getElementById('ai-handoff-send');
            const meta = aiHandoffItems.find((item) => Number(item.id) === Number(userId));

            if (preview && meta) {
                preview.innerHTML = `
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px;">
                        <div>
                            <div style="font-size:1rem; font-weight:800; color:var(--heading-color);">${escapeAdminHtml(meta.name)}</div>
                            <div style="font-size:0.84rem; color:#667085; margin-top:4px;">${escapeAdminHtml(meta.email || '')}</div>
                        </div>
                        <div style="text-align:right; font-size:0.78rem; color:#667085;">
                            <div><strong>${Number(meta.handoff_count || 1)}</strong> AI devri</div>
                            <div style="margin-top:4px;">Son devir: ${escapeAdminHtml(formatAdminDate(meta.latest_handoff_at))}</div>
                        </div>
                    </div>
                `;
            }

            if (thread) {
                thread.innerHTML = '<div style="height:100%; display:flex; align-items:center; justify-content:center; color:#888;">Mesajlar yükleniyor...</div>';
            }

            try {
                const res = await adminApiFetch(`http://localhost:5000/api/messages/history/${Number(userId)}`);
                const history = await adminReadJson(res, 'Mesaj geçmişi alınamadı.');
                if (thread) {
                    thread.innerHTML = renderAiThreadMessages(Array.isArray(history) ? history : []);
                    thread.scrollTop = thread.scrollHeight;
                }
                if (replyInput) replyInput.disabled = false;
                if (replyButton) replyButton.disabled = false;
                if (!silent && replyInput) replyInput.focus();
            } catch (err) {
                console.error('AI handoff detay hatası:', err);
                if (thread) {
                    thread.innerHTML = `<div style="height:100%; display:flex; align-items:center; justify-content:center; color:#C62828;">${escapeAdminHtml(err.message || 'Mesaj geçmişi alınamadı.')}</div>`;
                }
            }
        }

        async function sendAiHandoffReply() {
            const replyInput = document.getElementById('ai-handoff-reply');
            const replyButton = document.getElementById('ai-handoff-send');
            const message = String(replyInput ? replyInput.value : '').trim();

            if (!currentAiHandoffUserId || !message) return;

            if (replyButton) {
                replyButton.disabled = true;
                replyButton.innerText = 'Gönderiliyor';
            }

            try {
                const res = await adminApiFetch('http://localhost:5000/api/messages/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ receiver_id: Number(currentAiHandoffUserId), message })
                });
                await adminReadJson(res, 'Mesaj gönderilemedi.');
                if (replyInput) replyInput.value = '';
                await openAiHandoffThread(currentAiHandoffUserId, true);
                await loadAiHandoffs(true);
            } catch (err) {
                alert(err.message || 'Mesaj gönderilemedi.');
            } finally {
                if (replyButton) {
                    replyButton.disabled = false;
                    replyButton.innerText = 'G?nder';
                }
            }
        }

        // --- DASHBOARD ÖZEL GÜNCELLEMELERİ (GRAFİK VE BEKLEYEN İŞLER) ---
        async function fetchOrdersForDashboard() {
            try {
                const res = await adminApiFetch('http://localhost:5000/api/orders');
                const orders = await adminReadJson(res, 'Siparişler getirilemedi.');
                if (!Array.isArray(orders)) throw new Error('Sipariş verisi beklenen formatta değil.');

                // 1. BEKLEYEN ISLER LISTESI (Sadece Onay Bekleyenler)
                const pendingOrders = orders.filter(o => {
                    const normalized = String(o.status || '')
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase();
                    return normalized === 'onay bekliyor' || normalized === 'hazirlaniyor';
                });
                document.getElementById('pending-count').innerText = pendingOrders.length;

                const pendingList = document.getElementById('pending-orders-list');
                pendingList.innerHTML = '';

                if (pendingOrders.length === 0) {
                    pendingList.innerHTML = '<li class="pending-item"><span style="color:#888;">Şu an bekleyen sipariş yok.</span></li>';
                } else {
                    // Sadece ilk 4 tanesini goster
                    pendingOrders.slice(0, 4).forEach(o => {
                        pendingList.innerHTML += `
    <li class="pending-item">
        <div class="pending-info">
            <span class="pending-id">Sipariş #${o.id}</span>
            <span class="pending-name">${o.customer_name} - ${o.total_amount} TL</span>
        </div>
        <button class="btn-action"
            onclick="switchTab('orders', document.querySelectorAll('.nav-link')[1]); setTimeout(() => openOrderModal(${o.id}), 300)">Kargola</button>
    </li>
    `;
                    });
                }

                // 2. SATIS GRAFIGI
                renderChart(orders);

            } catch (e) {
                console.error('Dashboard sipariş verisi alınamadı:', e);
                document.getElementById('pending-count').innerText = '0';
                const pendingList = document.getElementById('pending-orders-list');
                if (pendingList) {
                    pendingList.innerHTML = '<li class="pending-item"><span style="color:#C62828;">Sipariş verisi alınamadı.</span></li>';
                }
            }
        }

        function renderChart(orders) {
            const ctx = document.getElementById('salesChart').getContext('2d');
            if (salesChartInstance) salesChartInstance.destroy(); // Eski grafiği sil

            // Şimdilik görsel zenginlik için son 7 günün sahte verisini çizdiriyoruz.
            // İleride backend'den günlük gruplanmış gerçek veriyi çekebiliriz.
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(247, 148, 29, 0.5)'); // Turuncu transparan
            gradient.addColorStop(1, 'rgba(247, 148, 29, 0.0)');

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const textColor = isDark ? '#e2e8f0' : '#888';

            salesChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
                    datasets: [{
                        label: 'Günlük Ciro (TL)',
                        data: [1200, 1900, 800, 2500, 3200, 2100, 4500], // Sembolik dalgalanma
                        borderColor: '#F7941D',
                        backgroundColor: gradient,
                        borderWidth: 3,
                        pointBackgroundColor: '#0F2A43',
                        pointBorderColor: '#FFF',
                        pointRadius: 5,
                        fill: true,
                        tension: 0.4 // Çizgiyi yumuşatır (Dalga efekti)
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { borderDash: [5, 5] }, ticks: { color: textColor } },
                        x: { grid: { display: false }, ticks: { color: textColor } }
                    }
                }
            });
            window.salesChart = salesChartInstance; // Global olarak erişilebilir yap
        }

        // --- DİĞER FONKSİYONLAR (Aynı) ---
        // Sadece class isimlerini döndür - CSS ile yönetilecek
        function getStatusClass(status) {
            if (status === 'Onay Bekliyor') return 'status-pending';
            if (status === 'Hazırlanıyor') return 'status-preparing';
            if (status === 'Kargoya Verildi') return 'status-shipped';
            if (status === 'Teslim Edildi') return 'status-delivered';
            if (status === 'İptal Edildi') return 'status-cancelled';
            return 'status-default';
        }

        // KATEGORİ YÖNETİMİ
        async function fetchCategories() {
            try {
                const res = await adminApiFetch('http://localhost:5000/api/categories');
                globalCategories = await res.json();

                const tbody = document.getElementById('categories-table-body');
                tbody.innerHTML = '';

                if (globalCategories.length === 0) {
                    tbody.innerHTML = '<tr> <td colspan = "4" style = "text-align: center;"> Henüz kategori eklenmemiş.</td> </tr> ';
                } else {
                    globalCategories.forEach(cat => {
                        const parentName = cat.parent_id
                            ? (globalCategories.find(c => c.id === cat.parent_id)?.name || '-')
                            : '-';

                        const dateStr = cat.created_at ? new Date(cat.created_at).toLocaleDateString('tr-TR') : '-';
                        tbody.innerHTML += `
    <tr>
        <td style="font-weight: bold; color: var(--accent);">#${cat.id}</td>
        <td>${cat.name}</td>
        <td><span class="cat-badge">${parentName}</span></td>
        <td>${dateStr}</td>
        <td>
            <button class="btn-action btn-delete" style="background:#C62828;"
                onclick="deleteCategory(${cat.id})">Sil</button>
        </td>
    </tr>
    `;
                    });
                }

                populateCategoryDropdowns();
            } catch (error) {
                console.error("Kategoriler çekilirken hata:", error);
                tbody.innerHTML = '<tr> <td colspan = "4" style = "text-align: center; color: red;"> Veri yüklenemedi.</td> </tr> ';
            }
        }

        function populateCategoryDropdowns() {
            const parentSelect = document.getElementById('cat-parent');
            if (parentSelect) {
                parentSelect.innerHTML = '<option value="">-- Ana Kategori (Yok) --</option>';
                globalCategories.forEach(c => {
                    parentSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
                });
            }

            const prodCatSelect = document.getElementById('prod-category');
            if (prodCatSelect) {
                const currentValue = prodCatSelect.value;
                prodCatSelect.innerHTML = '<option value="">Kategori Seçin</option>';
                globalCategories.forEach(c => {
                    prodCatSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`;
                });
                if (currentValue) prodCatSelect.value = currentValue;
            }
        }

        function openCategoryModal() {
            document.getElementById('add-category-form').reset();
            populateCategoryDropdowns();
            document.getElementById('category-modal').style.display = 'flex';
        }

        async function deleteCategory(id) {
            if (!confirm("Kategoriyi silerseniz alt kategoriler de silinir. Emin misiniz?")) return;
            try {
                const res = await adminApiFetch('http://localhost:5000/api/categories/' + id, { method: 'DELETE' });
                if (res.ok) fetchCategories();
                else alert('Hata oluştu');
            } catch (e) { }
        }

        document.addEventListener('DOMContentLoaded', () => {
            const catForm = document.getElementById('add-category-form');
            if (catForm) {
                catForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const btn = document.getElementById('btn-save-category');
                    btn.innerText = "Kaydediliyor..."; btn.disabled = true;
                    try {
                        const parent_id = document.getElementById('cat-parent').value;
                        const bodyData = {
                            name: document.getElementById('cat-name').value,
                            parent_id: parent_id ? parseInt(parent_id) : null
                        };

                        await adminApiFetch('http://localhost:5000/api/categories', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(bodyData)
                        });
                        closeModal('category-modal');
                        fetchCategories();
                    } catch (e) {
                    } finally {
                        btn.innerText = "Kaydet"; btn.disabled = false;
                    }
                });
            }
        });

        async function fetchStats() {
            try {
                const res = await adminApiFetch('http://localhost:5000/api/admin/stats');
                const data = await adminReadJson(res, 'İstatistikler getirilemedi.');
                document.getElementById('stat-revenue').innerText = data.totalRevenue + " TL";
                document.getElementById('stat-orders').innerText = data.totalOrders;
                document.getElementById('stat-products').innerText = data.totalProducts;
                document.getElementById('stat-users').innerText = data.totalUsers;
            } catch (e) {
                console.error('İstatistikler alınamadı:', e);
            }
        }

        async function fetchOrders() {
            try {
                const res = await adminApiFetch('http://localhost:5000/api/orders');
                const payload = await adminReadJson(res, 'Siparişler getirilemedi.');
                if (!Array.isArray(payload)) throw new Error('Sipariş verisi beklenen formatta değil.');

                globalOrders = payload;
                const tbody = document.getElementById('orders-table-body');
                tbody.innerHTML = '';
                if (globalOrders.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Sipariş yok.</td></tr>';
                    return;
                }

                globalOrders.forEach(order => {
                    const date = new Date(order.created_at).toLocaleDateString('tr-TR');
                    tbody.innerHTML += `
    <tr>
        <td style="font-weight:700;">#000${order.id}</td>
        <td>${order.customer_name || 'Bilinmiyor'}</td>
        <td>${date}</td>
        <td style="color:var(--accent); font-weight:700;">${order.total_amount} TL</td>
        <td><span class="status-badge ${getStatusClass(order.status)}">${order.status}</span></td>
        <td>
            <button onclick="openOrderModal(${order.id})" class="btn-inspect">İncele</button>
            <button onclick="deleteOrder(${order.id})" class="btn-delete" style="margin-left:5px;">Sil</button>
        </td>
    </tr>
    `;
                });
            } catch (e) {
                console.error('Siparişler alınamadı:', e);
                const isAuthError = e && (e.status === 401 || e.status === 403);
                const msg = isAuthError
                    ? 'Yetki hatası: yönetici oturumu ile tekrar giriş yapın.'
                    : (e && e.message ? e.message : 'Siparişler alınamadı.');
                renderOrdersTableError(msg);
            }
        }

        async function fetchProducts() {
            try {
                const res = await adminApiFetch('http://localhost:5000/api/products');
                globalProducts = await res.json();
                const tbody = document.getElementById('products-table-body');
                tbody.innerHTML = '';
                if (globalProducts.length === 0) {
                    tbody.innerHTML = '<tr> <td colspan = "7"> Ürün yok.</td> </tr> '; return;
                }

                globalProducts.forEach(p => {
                    const img = p.image_url || 'https://via.placeholder.com/50';
                    const oldPriceStr = p.old_price ? `<span style="color:#2E7D32; font-weight:bold;">${p.old_price} TL</span>` : '-';
                    const catStr = p.category || 'Kategorisiz';

                    tbody.innerHTML += `
    <tr>
        <td><img src="${img}"
                style="width:50px; height:50px; object-fit:contain; border-radius:8px; border:1px solid #eee;"></td>
        <td style="font-weight:600;">${p.name}</td>
        <td><span class="cat-badge">${catStr}</span></td>
        <td>${p.price} TL</td>
        <td>${oldPriceStr}</td>
        <td>${p.stock}</td>
        <td>
            <button onclick="editProduct(${p.id})" class="btn-edit">✏️ Düzenle</button>
            <button onclick="deleteProduct(${p.id})" class="btn-delete">🗑️ Sil</button>
        </td>
    </tr>
    `;
                });
            } catch (e) { }
        }

        // --- DİĞER MODAL VE FORM KODLARI BURADA ÇALIŞMAYA DEVAM EDECEK (SİLME, DÜZENLEME VB.) ---
        function closeModal(id) { document.getElementById(id).style.display = 'none'; }

        function openProductModal() {
            editingProductId = null;
            document.getElementById('add-product-form').reset();
            document.getElementById('modal-title-text').innerText = "Vitrine Yeni Ürün Ekle";
            document.getElementById('existing-media-group').style.display = 'none';
            document.getElementById('existing-media-container').innerHTML = '';
            document.getElementById('upload-status').innerText = '';
            document.getElementById('btn-save-product').innerText = "Ürünü Kaydet";
            populateCategoryDropdowns();
            document.getElementById('product-modal').style.display = 'flex';
        }

        async function editProduct(id) {
            const p = globalProducts.find(x => x.id === id);
            if (!p) return;
            editingProductId = p.id;
            document.getElementById('modal-title-text').innerText = "Ürünü Düzenle: " + p.name;
            document.getElementById('prod-name').value = p.name;
            document.getElementById('prod-category').value = p.category || '';
            document.getElementById('prod-price').value = p.price;
            document.getElementById('prod-old-price').value = p.old_price || '';
            document.getElementById('prod-stock').value = p.stock;
            document.getElementById('prod-desc').value = p.description || '';
            document.getElementById('btn-save-product').innerText = "Değişiklikleri Kaydet";
            document.getElementById('upload-status').innerText = '';

            document.getElementById('existing-media-group').style.display = 'none';
            document.getElementById('existing-media-container').innerHTML = '';

            try {
                const res = await adminApiFetch('http://localhost:5000/api/products/' + id);
                const pDetails = await res.json();
                if (pDetails.media && pDetails.media.length > 0) {
                    document.getElementById('existing-media-group').style.display = 'block';
                    const container = document.getElementById('existing-media-container');
                    pDetails.media.forEach(m => {
                        let mediaTag = m.media_url.endsWith('.mp4')
                            ? `<video src="${m.media_url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px;"></video>`
                            : `<img src="${m.media_url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px;">`;

                        container.innerHTML += `
    <div style="position: relative; display: inline-block;">
        ${mediaTag}
        <button type="button" onclick="deleteSpecificMedia(${m.id}, this)"
            style="position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 12px; display:flex; align-items:center; justify-content:center;">✕</button>
    </div>
    `;
                    });
                }
            } catch (e) { }

            populateCategoryDropdowns();
            document.getElementById('product-modal').style.display = 'flex';
        }

        async function deleteSpecificMedia(mediaId, btnEl) {
            if (!confirm("Bu görseli silmek istediğinize emin misiniz?")) return;
            try {
                btnEl.innerText = "...";
                const res = await adminApiFetch('http://localhost:5000/api/products/media/' + mediaId, { method: 'DELETE' });
                if (res.ok) {
                    btnEl.parentElement.remove();
                } else {
                    alert("Görsel silinemedi.");
                    btnEl.innerText = "✕";
                }
            } catch (e) { console.error(e); }
        }

        async function deleteProduct(id) {
            if (!confirm("Silmek istediğinize emin misiniz?")) return;
            try {
                const response = await adminApiFetch('http://localhost:5000/api/products/' + id, { method: 'DELETE' });
                if (response.ok) { alert("🗑️ Ürün silindi!"); fetchProducts(); fetchStats(); }
            } catch (e) { }
        }

        function openOrderModal(orderId) {
            const order = globalOrders.find(o => o.id === orderId);
            if (!order) return;
            let itemsHtml = '<div style=\"margin-top:20px; border:1px solid var(--border); border-radius:8px; padding:15px; background: var(--table-hover);\">';

            let items = [];
            try {
                items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
                if (!Array.isArray(items)) items = [];
            } catch (e) {
                console.error("Sipariş içeriği okunamadı:", e);
                items = [];
                itemsHtml += `<div style="color:red; font-size:0.9rem;">Sipariş içeriği hatalı formatta kaydedilmiş.</div>`;
            }

            items.forEach(item => {
                itemsHtml += `<div style="padding:8px 0; border-bottom:1px dashed var(--border);">
            <strong>${item.quantity}x</strong> ${item.name} <span style="float:right; opacity:0.8;">${item.price}
                TL</span></div>`;
            });
            itemsHtml += '</div>';

            document.getElementById('order-modal-body').innerHTML = `
    <div
        style="background: var(--table-hover); padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--border);">
        <div style="margin-bottom:5px;"><strong>Müşteri:</strong> ${order.customer_name}</div>
        <div style="margin-bottom:5px;"><strong>Telefon:</strong> ${order.phone}</div>
        <div><strong>Adres:</strong> ${order.address}</div>
    </div>
    <h4>Sipariş İçeriği</h4>
    ${itemsHtml}
    <div style="margin-top: 25px; display: flex; justify-content: space-between; align-items: center;">
        <select id="status-select" class="form-control" style="width: 200px;">
            <option value="Onay Bekliyor" ${order.status === 'Onay Bekliyor' ? 'selected' : ''}>Onay Bekliyor</option>
            <option value="Hazırlanıyor" ${order.status === 'Hazırlanıyor' ? 'selected' : ''}>Hazırlanıyor</option>
            <option value="Kargoya Verildi" ${order.status === 'Kargoya Verildi' ? 'selected' : ''}>Kargoya Verildi
            </option>
            <option value="Teslim Edildi" ${order.status === 'Teslim Edildi' ? 'selected' : ''}>Teslim Edildi</option>
            <option value="İptal Edildi" ${order.status === 'İptal Edildi' ? 'selected' : ''}>İptal Edildi</option>
        </select>
        <button onclick="updateOrderStatus(${order.id})" class="btn-submit"
            style="width:auto; padding: 12px 25px;">Güncelle</button>
    </div>
    `;
            document.getElementById('order-modal').style.display = 'flex';
        }

        async function updateOrderStatus(orderId) {
            const newStatus = document.getElementById('status-select').value;
            try {
                const response = await adminApiFetch('http://localhost:5000/api/orders/' + orderId + '/status', {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus })
                });
                await adminReadJson(response, 'Sipariş durumu güncellenemedi.');
                alert("✅ Güncellendi!");
                closeModal('order-modal');
                fetchOrders();
                fetchOrdersForDashboard();
                fetchStats();
            } catch (e) {
                alert(e.message || 'Sipariş durumu güncellenemedi.');
            }
        }

        async function deleteOrder(orderId) {
            if (!confirm("Bu siparişi silmek istediğinize emin misiniz? Bu işlem geri alınamaz!")) return;
            try {
                const response = await adminApiFetch('http://localhost:5000/api/orders/' + orderId, { method: 'DELETE' });
                if (response.ok) {
                    alert("🗑️ Sipariş silindi!");
                    fetchOrders();
                    fetchOrdersForDashboard();
                    fetchStats();
                } else {
                    alert("Silme işlemi başarısız.");
                }
            } catch (e) { console.error("Sipariş silme hatası:", e); }
        }

        document.getElementById('add-product-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save-product');
            btn.innerText = "Kaydediliyor..."; btn.disabled = true;
            try {
                const formData = new FormData();
                formData.append('name', document.getElementById('prod-name').value);
                formData.append('price', document.getElementById('prod-price').value);
                formData.append('oldPrice', document.getElementById('prod-old-price').value);
                formData.append('stock', document.getElementById('prod-stock').value);
                formData.append('description', document.getElementById('prod-desc').value);
                formData.append('category', document.getElementById('prod-category').value);

                const files = document.getElementById('prod-media')?.files;
                if (files) {
                    for (let i = 0; i < files.length; i++) { formData.append('media', files[i]); }
                } if (editingProductId) {
                    await
                        adminApiFetch('http://localhost:5000/api/products/' + editingProductId, { method: 'PUT', body: formData });
                } else {
                    await adminApiFetch('http://localhost:5000/api/products', { method: 'POST', body: formData });
                }
                document.getElementById('add-product-form').reset(); document.getElementById('upload-status').innerText = '';
                closeModal('product-modal'); fetchProducts(); fetchStats();
            } catch (error) { console.error(error); } finally {
                btn.innerText = "Kaydet"; btn.disabled = false;
            }
        });

        // Theme Toggle Logic
        function toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            document.getElementById('theme-checkbox').checked = (newTheme === 'dark');

            // Eğer grafik varsa onun renklerini de güncelle
            if (window.salesChart) {
                const isDark = newTheme === 'dark';
                window.salesChart.options.scales.x.ticks.color = isDark ? '#e2e8f0' : '#888';
                window.salesChart.options.scales.y.ticks.color = isDark ? '#e2e8f0' : '#888';
                window.salesChart.update();
            }
        }
        document.addEventListener('DOMContentLoaded', () => {
            // 🔐 Admin token kontrolü — geçersizse login'e yönlendir
            const token = localStorage.getItem('nova_admin_token');
            if (!token) {
                window.location.href = 'admin-login.html';
                return;
            }
            // Token formatı doğru mu basit kontrol
            const parts = token.split('.');
            if (parts.length !== 3) {
                localStorage.removeItem('nova_admin_token');
                window.location.href = 'admin-login.html';
                return;
            }

            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
            document.getElementById('theme-checkbox').checked = (savedTheme === 'dark');

            const aiReplyInput = document.getElementById('ai-handoff-reply');
            if (aiReplyInput) {
                aiReplyInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') sendAiHandoffReply();
                });
            }

            fetchStats(); fetchOrdersForDashboard(); fetchCategories();

            // Bildirim sistemini başlat
            initAdminNotifications();
        });


        // ─────────────────────────────────────────────────────
        // ADMİN BİLDİRİM SİSTEMİ
        // ─────────────────────────────────────────────────────

        let unreadCount = 0;

        function initAdminNotifications() {
            // 1) Tarayıcı bildirim izni — sadece banner ile sor
            if ('Notification' in window && Notification.permission === 'default') {
                if (!localStorage.getItem('nova_notif_banner_dismissed')) {
                    _showAdminPermissionBanner();
                }
            }

            // 2) Mevcut admin bildirimlerini çek
            fetchAdminNotifications();

            // 3) Socket.io ile admin_room'a bağlan
            const socket = io('http://localhost:5000');
            socket.on('connect', () => {
                console.log('🔔 Socket bağlantısı kuruldu, admin_room odasına katılıyorum...');
                socket.emit('join_room', 'admin_room');
            });

            // 4) Gerçek zamanlı bildirim gelince
            socket.on('new_notification', (notif) => {
                addNotifToDropdown(notif, true);
                incrementBadge();
                ringBell();
                showBrowserPopup(notif);
                showAdminToast(notif);
                if (notif.type === 'ai_handoff') loadAiHandoffs();
                if (notif.type === 'new_question') loadAdminQuestions();
            });
        }

        async function fetchAdminNotifications() {
            try {
                const res = await adminApiFetch('http://localhost:5000/api/notifications/admin');
                const data = await res.json();
                const list = document.getElementById('notif-list');
                list.innerHTML = '';
                unreadCount = 0;

                if (!data || data.length === 0) {
                    list.innerHTML = '<div class="notif-empty">Henüz bildirim yok.</div>';
                    return;
                }

                data.forEach(n => {
                    addNotifToDropdown(n, false);
                    if (!n.is_read) unreadCount++;
                });

                updateBadge();
            } catch (e) {
                console.error('Bildirimler çekilemedi:', e);
            }
        }

        function addNotifToDropdown(notif, prepend = false) {
            const list = document.getElementById('notif-list');
            const empty = list.querySelector('.notif-empty');
            if (empty) empty.remove();

            const icons = {
                'new_order': '🛒',
                'order_update': '📦',
                'new_review': '⭐',
                'low_stock': '⚠️',
                'welcome': '👋',
                'new_question': '💬'
            };
            const icon = icons[notif.type] || '🔔';
            const timeStr = new Date(notif.created_at).toLocaleString('tr-TR');

            const item = document.createElement('div');
            item.className = 'notif-item' + (notif.is_read ? '' : ' unread');
            item.dataset.id = notif.id;
            item.innerHTML = `
        <div class="notif-icon-box">${icon}</div>
        <div class="notif-text">
            <p>${notif.message}</p>
            <small>${timeStr}</small>
        </div>
        `;
            // Tıklayınca okundu yap ve ilgili sekmeye git
            item.addEventListener('click', () => {
                markNotifRead(notif.id, item);
                navigateAdminNotif(notif.type);
                closeNotifDropdown();
            });

            if (prepend) {
                list.insertBefore(item, list.firstChild);
            } else {
                list.appendChild(item);
            }
        }

        // Bildirim tipine göre admin sekmesine git
        function navigateAdminNotif(type) {
            const tabMap = {
                new_order: 'orders',
                order_update: 'orders',
                new_review: 'products',
                low_stock: 'products',
                new_question: 'chat',
                ai_handoff: 'chat'
            };
            const tabName = tabMap[type];
            if (tabName) {
                const link = document.querySelector(`.nav-link[onclick*="'${tabName}'"]`);
                if (link) link.click();
            }
        }

        async function markNotifRead(id, el) {
            if (el.classList.contains('unread')) {
                el.classList.remove('unread');
                unreadCount = Math.max(0, unreadCount - 1);
                updateBadge();
                await adminApiFetch(`http://localhost:5000/api/notifications/${id}/read`, { method: 'PATCH' });
            }
        }

        async function markAllAdminRead() {
            await adminApiFetch('http://localhost:5000/api/notifications/read-all/admin', { method: 'PATCH' });
            document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
            unreadCount = 0;
            updateBadge();
        }

        function incrementBadge() {
            unreadCount++;
            updateBadge();
        }

        function updateBadge() {
            const badge = document.getElementById('notif-badge');
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        function ringBell() {
            const bell = document.getElementById('notif-bell');
            bell.classList.remove('ring');
            void bell.offsetWidth; // reflow trick
            bell.classList.add('ring');
            bell.addEventListener('animationend', () => bell.classList.remove('ring'), { once: true });
        }

        function showBrowserPopup(notif) {
            if (!('Notification' in window)) return;

            const show = () => {
                const icons = { 'new_order': '🛒', 'order_update': '📦', 'new_review': '⭐', 'low_stock': '⚠️' };
                const n = new Notification('NovaStore — Yeni Bildirim', {
                    body: notif.message,
                    icon: 'https://img.icons8.com/color/48/shopping-cart--v1.png',
                    tag: 'novastore-admin-' + notif.id,
                    requireInteraction: false
                });
                n.onclick = () => {
                    window.focus();
                    navigateAdminNotif(notif.type);
                    n.close();
                };
                setTimeout(() => n.close(), 8000);
            };

            if (Notification.permission === 'granted') {
                show();
            } else if (Notification.permission !== 'denied') {
                // Bildirim gelince izin defaultsa ve dismissal flag yoksa banner göster
                if (!localStorage.getItem('nova_notif_banner_dismissed')) {
                    _showAdminPermissionBanner();
                }
            }
        }

        function toggleNotifDropdown() {
            const dd = document.getElementById('notif-dropdown');
            dd.classList.toggle('open');
        }

        function closeNotifDropdown() {
            document.getElementById('notif-dropdown').classList.remove('open');
        }

        function _showAdminPermissionBanner() {
            if (document.getElementById('admin-notif-banner')) return;
            const banner = document.createElement('div');
            banner.id = 'admin-notif-banner';
            banner.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#0F2A43; color: white; padding: 14px 24px; border-radius: 14px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); display: flex; align-items: center; gap: 14px; z-index: 99999; font-family: Inter, sans-serif; font-size: 0.9rem; max-width: 90%;';

            banner.innerHTML = `
        <span>🔔 Yeni siparişlerde masaüstü bildirimi almak ister misiniz?</span>
        <button id="btn-admin-enable"
            style="background:#F7941D; border:none; color:white; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:700; white-space:nowrap;">→
            Evet, İzin Ver</button>
        <button id="btn-admin-dismiss"
            style="background:rgba(255,255,255,0.15); border:none; color:white; padding:6px 12px; border-radius:8px; cursor:pointer;">Hayır</button>
        `;
            document.body.appendChild(banner);

            document.getElementById('btn-admin-enable').onclick = () => {
                Notification.requestPermission().then(perm => {
                    banner.remove();
                    if (perm === 'granted') {
                        alert('✅ Admin masaüstü bildirimleri aktif!');
                    } else {
                        localStorage.setItem('nova_notif_banner_dismissed', '1');
                    }
                });
            };

            document.getElementById('btn-admin-dismiss').onclick = () => {
                localStorage.setItem('nova_notif_banner_dismissed', '1');
                banner.remove();
            };
        }

        // Dropdown dışına tıklayınca kapat
        document.addEventListener('click', (e) => {
            const wrapper = document.getElementById('notif-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                closeNotifDropdown();
            }
        });
        // --- ÜRÜN SORULARI (S&C) ---
        async function loadAdminQuestions() {
            try {
                const token = localStorage.getItem('nova_admin_token');
                const res = await adminApiFetch('http://localhost:5000/api/questions/admin/all', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const tbody = document.querySelector('#adminQuestionsTable tbody');
                if (res.ok) {
                    const questions = await res.json();
                    if (!questions || questions.length === 0) {
                        tbody.innerHTML = '<tr> <td colspan = "6" style = "text-align:center; color:#888;"> Henüz hiç soru yok.</td> </tr> ';
                        return;
                    }

                    let html = '';
                    questions.forEach(q => {
                        const dateStr = new Date(q.created_at).toLocaleDateString('tr-TR');
                        const isAnswered = q.answer !== null;

                        html += `
        <tr style="${!isAnswered ? 'background: rgba(247, 148, 29, 0.05); font-weight:600;' : ''}">
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${q.product_image || 'https://via.placeholder.com/40'}"
                        style="width:40px; height:40px; object-fit:cover; border-radius:6px;">
                    <div style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
                        title="${q.product_name}">${q.product_name}</div>
                </div>
            </td>
            <td>${q.user_name}</td>
            <td>
                <div style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
                    title="${q.question}">${q.question}</div>
            </td>
            <td>
                ${isAnswered
                                ? '<span class="status-badge status-delivered">Cevaplandı</span>'
                                : '<span class="status-badge status-pending">Bekliyor</span>'}
            </td>
            <td>${dateStr}</td>
            <td>
                <button class="btn-edit" onclick="openAnswerModal(${q.id}, '${q.question.replace(/'/g, "\\'")}', '${(q.answer || '').replace(/'/g, "\\'")}')">
                    ${isAnswered ? 'Güncelle' : 'Yanıtla'}
                </button>
            </td>
        </tr>
        `;
                    });
                    tbody.innerHTML = html;
                } else {
                    const errData = await res.json();
                    if (res.status === 401 || res.status === 403 || (errData.error && errData.error.toLowerCase().includes('token'))) {
                        alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
                        adminLogout();
                        return;
                    }
                    tbody.innerHTML = `<tr>
            <td colspan="6" style="text-align:center; color:red; padding: 20px;">Hata: ${errData.error || 'Bilinmeyen bir hata oluştu.'}</td>
        </tr>`;
                }
            } catch (err) {
                console.error("Soruları çekerken hata:", err);
                alert("Soruları çekerken hata: " + err.message);
            }
        }

        function openAnswerModal(id, questionText, currentAnswer) {
            document.getElementById('modal-question-id').value = id;
            document.getElementById('modal-question-text').innerText = questionText;
            document.getElementById('modal-answer-text').value = currentAnswer;
            document.getElementById('answerModal').style.display = 'flex';
        }

        function closeAnswerModal() {
            document.getElementById('answerModal').style.display = 'none';
        }

        async function submitAnswer() {
            const id = document.getElementById('modal-question-id').value;
            const answer = document.getElementById('modal-answer-text').value.trim();
            const token = localStorage.getItem('nova_admin_token');

            if (!answer) {
                alert("Lütfen bir yanıt girin.");
                return;
            }

            try {
                const res = await adminApiFetch(`http://localhost:5000/api/questions/admin/answer/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ answer })
                });

                const result = await res.json();
                if (res.ok) {
                    alert('✅ ' + result.mesaj);
                    closeAnswerModal();
                    loadAdminQuestions(); // Tabloyu yenile
                } else {
                    alert('❌ Hata: ' + result.error);
                }
            } catch (err) {
                alert("Güncellenirken hata oluştu.");
            }
        }

        function showAdminToast(notif) {
            const container = document.getElementById('toastContainer');
            if (!container) return;

            const icons = { order_update: '📦', new_order: '🛒', new_review: '⭐', low_stock: '⚠️', welcome: '👋', new_question: '💬' };
            const metas = { order_update: 'Sipariş Güncellendi', new_order: 'Yeni Sipariş', new_review: 'Yeni Yorum', low_stock: 'Düşük Stok', welcome: 'Hoş Geldiniz', new_question: 'Yeni Soru' };
            const classes = { order_update: 'info', new_order: 'warning', new_review: 'info', low_stock: 'error', welcome: 'success', new_question: 'success' };

            const icon = icons[notif.type] || '🔔';
            const title = metas[notif.type] || 'Bildirim';
            const typeClass = classes[notif.type] || 'info';

            const toast = document.createElement('div');
            toast.className = `toast ${typeClass}`;
            toast.style.cursor = 'pointer';
            toast.innerHTML = `
                <div class="toast-icon">${icon}</div>
                <div class="toast-content">
                    <div class="toast-title">${title}</div>
                    <div class="toast-message">${notif.message}</div>
                </div>
                <button class="toast-close" onclick="event.stopPropagation(); this.parentElement.classList.add('removing'); setTimeout(() => this.parentElement.remove(), 320)">✕</button>
            `;

            toast.addEventListener('click', (e) => {
                if (e.target.classList.contains('toast-close')) return;
                navigateAdminNotif(notif.type);
            });

            container.appendChild(toast);
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.classList.add('removing');
                    setTimeout(() => toast.remove(), 320);
                }
            }, 5000);
        }

    