function getProgressBarHtml(status) {
            let fillWidth = '0%';
            let steps = [
                { label: 'Sipariş Alındı', active: false, icon: '✓' },
                { label: 'Hazırlanıyor', active: false, icon: '📦' },
                { label: 'Kargoya Verildi', active: false, icon: '🚚' },
                { label: 'Teslim Edildi', active: false, icon: '🏠' }
            ];

            if (status === 'İptal Edildi') {
                return `<div class="progress-track"><div class="progress-bar-fill" style="width: 75%; background: #D32F2F;"></div><div class="progress-step cancel"><div class="step-icon">✕</div><div class="step-label">Sipariş İptal Edildi</div></div></div>`;
            }

            if (status === 'Onay Bekliyor') { fillWidth = '0%'; steps[0].active = true; }
            if (status === 'Hazırlanıyor') { fillWidth = '33.33%'; steps[0].active = true; steps[1].active = true; }
            if (status === 'Kargoya Verildi') { fillWidth = '66.66%'; steps[0].active = true; steps[1].active = true; steps[2].active = true; }
            if (status === 'Teslim Edildi') { fillWidth = '100%'; steps.forEach(s => s.active = true); }

            let stepsHtml = steps.map(s => `<div class="progress-step ${s.active ? 'active' : ''}"><div class="step-icon">${s.icon}</div><div class="step-label">${s.label}</div></div>`).join('');
            return `<div class="progress-track"><div class="progress-bar-fill" style="width: ${fillWidth};"></div>${stepsHtml}</div>`;
        }

        function toggleOrderDetails(orderId) {
            const card = document.getElementById('compact-order-' + orderId);
            if (card) {
                card.classList.toggle('open');
            }
        }

        async function fetchMyOrders() {
            try {
                // Önce tüm ürünleri çek ve ID -> image_url eşlemesi oluştur
                let productImageMap = {};
                try {
                    const productsRes = await fetch('http://localhost:5000/api/products');
                    const allProducts = await productsRes.json();
                    allProducts.forEach(p => { productImageMap[p.id] = p.image_url || ''; });
                } catch (e) { /* ürünler yüklenemezse harita boş kalır */ }

                const effectiveUserId = getAuthenticatedUserId() || Number(user.id);
                if (!Number.isInteger(effectiveUserId)) throw new Error('Oturum bilgisi dogrulanamadi.');

                const response = await fetch('http://localhost:5000/api/orders/user/' + effectiveUserId, { headers: authHeaders() });
                const orders = await response.json();
                if (!response.ok) throw new Error(orders.error || 'Siparişler getirilemedi.');
                const container = document.getElementById('orders-container');
                container.innerHTML = '';

                if (orders.length === 0) {
                    container.innerHTML = `<div style="text-align: center; padding: 40px 0;"><div style="font-size: 4rem; margin-bottom: 15px;">🛍️</div><p style="font-size: 1.1rem; color: #555; margin-bottom: 20px;">Henüz hiç sipariş vermemişsiniz.</p><a href="index.html" class="btn-action" style="text-decoration: none; display: inline-block;">Alışverişe Başla</a></div>`;
                    return;
                }

                const fallbackSvg = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 24 24' fill='none' stroke='%23CCC' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='3' y1='9' x2='21' y2='9'%3E%3C/line%3E%3Cline x1='9' y1='21' x2='9' y2='9'%3E%3C/line%3E%3C/svg%3E";

                orders.forEach(order => {
                    const dateObj = new Date(order.created_at);
                    const standardDateStr = dateObj.toLocaleString('tr-TR');
                    const options = { day: '2-digit', month: 'long', year: 'numeric' };
                    const dateStr = dateObj.toLocaleDateString('tr-TR', options);

                    let itemsHtml = '';
                    let products = [];
                    if (order.items) {
                        try {
                            products = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
                            if (!Array.isArray(products)) products = [];
                        } catch (e) { products = []; }

                        products.forEach(item => {
                            // Önce item.image'a bak; yoksa productImageMap'ten doldur; o da yoksa fallback
                            let itemImage = (item.image && item.image.trim() !== '') ? item.image : (productImageMap[item.id] || fallbackSvg);
                            itemsHtml += `
                                <div class="item-row" style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #F0F0F0;">
                                    <div style="width: 50px; height: 50px; flex-shrink: 0; border-radius: 6px; border: 1px solid #EEE; display: flex; align-items: center; justify-content: center; overflow: hidden; background: white;">
                                        <img src="${itemImage}" alt="Ürün" style="max-width: 90%; max-height: 90%; object-fit: contain;" onerror="this.onerror=null; this.src='${fallbackSvg}'">
                                    </div>
                                    <div class="item-name" style="flex: 1; display:flex; align-items: center;"><span class="item-qty" style="font-weight: bold; color: #F7941D; margin-right: 8px;">${item.quantity}x</span> ${item.name}</div>
                                    <div style="color: #666; font-weight: 600;">${(parseFloat(item.price) * parseInt(item.quantity)).toFixed(2)} TL</div>
                                </div>
                            `;
                        });
                    }

                    const isCompactOrder = order.status === 'Teslim Edildi' || order.status === 'İptal Edildi';
                    if (isCompactOrder) {
                        const isCancelled = order.status === 'İptal Edildi';
                        const firstItem = products.length > 0 ? products[0] : null;
                        const firstItemQty = firstItem ? firstItem.quantity : 1;
                        const firstItemImage = firstItem ? ((firstItem.image && firstItem.image.trim() !== '') ? firstItem.image : (productImageMap[firstItem.id] || fallbackSvg)) : fallbackSvg;
                        const compactCardClass = isCancelled ? 'compact-order-card is-cancelled' : 'compact-order-card';
                        const statusIcon = isCancelled ? '✕' : '✓';
                        const statusTitle = isCancelled ? 'Sipariş iptal edildi' : 'Sipariş tamamlandı';
                        const statusSubtitle = isCancelled
                            ? 'Detayları açıp iptal notunu ve ürünleri görebilirsiniz.'
                            : 'Detayları açıp sipariş içeriğini görebilirsiniz.';
                        const compactExtraHtml = isCancelled
                            ? `
                                <div style="margin-top:16px; display:grid; gap:12px;">
                                    <div style="padding:14px 16px; border-radius:10px; background:#FFF1F1; border:1px solid #F7C8C8; color:#8A1F1F;">
                                        <div style="font-weight:700; margin-bottom:6px;">İptal Notu</div>
                                        <div style="font-size:0.92rem; line-height:1.55;">${order.cancel_reason || 'Sipariş bu kayıt için iptal edildi.'}</div>
                                    </div>
                                    ${order.refund_status && order.refund_status !== 'NONE'
                                        ? `<div style="padding:12px 16px; border-radius:10px; background:#FFF8E7; border:1px solid #F5DEAE; color:#8A5A00; font-size:0.9rem;"><strong>İade / geri ödeme durumu:</strong> ${order.refund_status}</div>`
                                        : ''}
                                </div>
                            `
                            : `
                                <div style="margin-top:16px;">
                                    <button onclick="openReturnModal(${order.id}, ${order.total_amount})" style="background:#FFF0F0; color:#C62828; border:1px solid #FFCDD2; padding:10px 20px; border-radius:8px; font-weight:600; cursor:pointer; font-size:0.9rem; transition:0.2s;" onmouseover="this.style.background='#FFEBEE'" onmouseout="this.style.background='#FFF0F0'">
                                        İade Talebi Oluştur
                                    </button>
                                </div>
                            `;

                        container.innerHTML += `
                            <div class="${compactCardClass}" id="compact-order-${order.id}">
                                <div class="compact-order-header" onclick="toggleOrderDetails(${order.id})">
                                    <div class="compact-header-top">
                                        <div class="compact-image-box">
                                            <span class="compact-badge">x${firstItemQty}</span>
                                            <img src="${firstItemImage}" alt="Ürün" onerror="this.onerror=null; this.src='${fallbackSvg}'">
                                        </div>
                                        <div class="compact-right">
                                            <div class="compact-info">
                                                <div class="compact-date">${dateStr}</div>
                                                <div class="compact-total">${order.total_amount} TL</div>
                                            </div>
                                            <div class="compact-arrow">›</div>
                                        </div>
                                    </div>
                                    <div class="compact-status">
                                        <div class="compact-status-icon">${statusIcon}</div>
                                        <div class="compact-status-copy">
                                            <div class="compact-status-title">${statusTitle}</div>
                                            <div class="compact-status-subtitle">${statusSubtitle}</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="compact-order-details">
                                    <div style="padding-top:20px;">
                                        <div class="order-id" style="margin-bottom:15px; color:#0F2A43; font-weight:700;">Sipariş No: #000${order.id}</div>
                                        <div class="order-items-box"><div style="font-size: 0.85rem; color: #888; margin-bottom: 8px; font-weight: 600; text-transform: uppercase;">Paket İçeriği</div>${itemsHtml}</div>
                                        ${compactExtraHtml}
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                    else {
                        let trackingHtml = '';
                        if (order.status === 'Kargoya Verildi' && (order.tracking_url || order.tracking_no)) {
                            const trackUrl = order.tracking_url || '#';
                            const eta = order.eta_date || order.estimated_delivery_date;
                            const etaStr = eta ? new Date(eta).toLocaleDateString('tr-TR') : '';
                            trackingHtml = `
                                <div style="margin:10px 0 0; padding:12px 16px; background:#E8F5E9; border-radius:10px; border-left:3px solid #2E7D32;">
                                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            <span>🚚</span>
                                            <span style="font-weight:600; color:#1B5E20; font-size:0.9rem;">Kargoda</span>
                                            ${order.tracking_no ? `<span style="color:#555; font-size:0.82rem;">· Takip No: <strong>${order.tracking_no}</strong></span>` : ''}
                                        </div>
                                        ${etaStr ? `<div style="color:#2E7D32; font-size:0.82rem;"><strong>Tahmini Teslimat:</strong> ${etaStr}</div>` : ''}
                                    </div>
                                    <a href="${trackUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:8px; color:#1565C0; font-size:0.82rem; text-decoration:none; font-weight:600;">Kargonu Takip Et →</a>
                                </div>
                            `;
                        }

                        container.innerHTML += `
                        <div class="order-card">
                            <div class="order-header">
                                <div class="order-id-date"><span class="order-id">Sipariş No: #000${order.id}</span><span class="order-date">${standardDateStr}</span></div>
                                <div class="order-total">${order.total_amount} TL</div>
                            </div>
                            ${getProgressBarHtml(order.status)}
                            ${trackingHtml}
                            <div class="order-items-box"><div style="font-size: 0.85rem; color: #888; margin-bottom: 8px; font-weight: 600; text-transform: uppercase;">Paket İçeriği</div>${itemsHtml}</div>
                        </div>`;
                    }
                });
            } catch (error) {
                const rawMsg = error && error.message ? error.message : 'Sunucuya baglanilamadi!';
                const isAuthError = /Authentication required|Invalid or expired token|Access denied|403|401/i.test(rawMsg);
                const msg = isAuthError ? 'Oturum suresi dolmus. Lutfen tekrar giris yapin.' : rawMsg;
                document.getElementById('orders-container').innerHTML = '<p style="color:red; text-align:center;">' + msg + '</p>';
            }
        }

        // --- 4. ÇOKLU ADRES YÖNETİMİ ---
        let addresses = JSON.parse(localStorage.getItem('novastore_user_addresses')) || [];

        // Eski sistemdeki tek adresi (varsa) listeye dönüştür (Geriye dönük uyumluluk)
        const oldAddress = localStorage.getItem('nova_user_address');
        if (oldAddress && addresses.length === 0) {
            let data = JSON.parse(oldAddress);
            data.id = Date.now().toString();
            addresses.push(data);
            localStorage.setItem('novastore_user_addresses', JSON.stringify(addresses));
            localStorage.removeItem('nova_user_address');
        }

        function renderAddresses() {
            const container = document.getElementById('address-grid');
            container.innerHTML = '';

            addresses.forEach((addr, index) => {
                container.innerHTML += `
                    <div style="background: white; border: 1px solid #EAEAEA; border-radius: 12px; padding: 20px; transition: 0.3s; position: relative;">
                        <h3 style="margin-top: 0; color: #0F2A43; font-size: 1.1rem; display: flex; align-items: center; gap: 8px; margin-bottom: 15px;">
                            📍 ${addr.title}
                        </h3>
                        <p style="color: #666; font-size: 0.95rem; line-height: 1.5; margin: 0 0 10px 0; min-height: 65px;">
                            ${addr.detail}<br>
                            ${addr.district} / ${addr.city} ${addr.zip ? '- ' + addr.zip : ''}
                        </p>
                        <div style="display: flex; gap: 10px; margin-top: 20px; border-top: 1px dashed #EEE; padding-top: 15px;">
                            <button onclick="editAddress('${addr.id}')" style="flex: 1; background: #F8FBFF; color: #007BFF; border: none; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: 0.2s;">Düzenle</button>
                            <button onclick="deleteAddress('${addr.id}')" style="flex: 1; background: #FFF0F0; color: #E53935; border: none; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: 0.2s;">Sil</button>
                        </div>
                    </div>
                `;
            });

            // Yeni adres ekle butonu / kartı
            container.innerHTML += `
                <div onclick="openAddressModal()" style="background: #FAFAFA; border: 2px dashed #CCC; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; cursor: pointer; transition: 0.3s;" onmouseover="this.style.borderColor='#F7941D'; this.style.color='#F7941D';" onmouseout="this.style.borderColor='#CCC'; this.style.color='#666';">
                    <div style="font-size: 2.5rem; margin-bottom: 10px;">+</div>
                    <div style="font-weight: 600; font-size: 1.1rem;">Yeni Adres Ekle</div>
                </div>
            `;
        }

        function openAddressModal() {
            document.getElementById('address-form').reset();
            document.getElementById('addr-id').value = '';
            document.getElementById('btn-save-addr').innerText = 'Adresi Kaydet';
            document.getElementById('address-modal-overlay').style.display = 'flex';
        }

        function closeAddressModal() {
            document.getElementById('address-modal-overlay').style.display = 'none';
        }

        // Modal dışına tıklanırsa kapat
        document.getElementById('address-modal-overlay').addEventListener('click', function (e) {
            if (e.target === this) closeAddressModal();
        });

        function saveAddress(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-save-addr');
            btn.innerText = "Kaydediliyor...";

            const newId = document.getElementById('addr-id').value || Date.now().toString();

            const addressData = {
                id: newId,
                title: document.getElementById('addr-title').value,
                city: document.getElementById('addr-city').value,
                district: document.getElementById('addr-district').value,
                detail: document.getElementById('addr-detail').value,
                zip: document.getElementById('addr-zip').value
            };

            const existingIndex = addresses.findIndex(a => a.id === newId);
            if (existingIndex > -1) {
                addresses[existingIndex] = addressData; // Güncelle
            } else {
                addresses.push(addressData); // Yeni ekle
            }

            localStorage.setItem(_addrKey(), JSON.stringify(addresses));

            setTimeout(() => {
                btn.innerText = "Kaydedildi!";
                setTimeout(() => {
                    closeAddressModal();
                    renderAddresses();
                }, 500);
            }, 500);
        }

        function editAddress(id) {
            const addr = addresses.find(a => a.id === id);
            if (addr) {
                document.getElementById('addr-id').value = addr.id;
                document.getElementById('addr-title').value = addr.title || '';
                document.getElementById('addr-city').value = addr.city || '';
                document.getElementById('addr-district').value = addr.district || '';
                document.getElementById('addr-detail').value = addr.detail || '';
                document.getElementById('addr-zip').value = addr.zip || '';
                document.getElementById('btn-save-addr').innerText = 'Değişiklikleri Kaydet';
                document.getElementById('address-modal-overlay').style.display = 'flex';
            }
        }

        function deleteAddress(id) {
            if (confirm('Bu adresi silmek istediğinize emin misiniz?')) {
                addresses = addresses.filter(a => a.id !== id);
                localStorage.setItem(_addrKey(), JSON.stringify(addresses));
                renderAddresses();
            }
        }

        function loadAddress() {
            renderAddresses();
        }

        // Sayfa açıldığında siparişleri çek
        fetchMyOrders();
        // Sayfa yüklendiğinde favorileri de hazırla (eğer şu anki tab oysa)
        if (document.getElementById('tab-favorites').classList.contains('active')) {
            fetchMyFavorites();
        }

        // --- 5. FAVORİLERİ GETİRME ---
        function toggleFavoriteProfile(btn, event, productId) {
            event.preventDefault();
            event.stopPropagation();

            let favs = JSON.parse(localStorage.getItem(_favsKey())) || [];
            favs = favs.filter(id => id !== productId);
            localStorage.setItem(_favsKey(), JSON.stringify(favs));

            // Ekranda kartı gizle
            const card = btn.closest('.product-card');
            card.style.opacity = '0';
            setTimeout(() => {
                card.remove();
                if (favs.length === 0) {
                    document.getElementById('favorites-container').innerHTML = `
                        <div style="text-align: center; padding: 40px 0; color: #666;">
                            <span style="font-size: 3rem; display: block; margin-bottom: 15px;">❤️</span>
                            Favori listeniz şu an boş görünüyor. Vitrinden ürün eklemeye başlayın.
                        </div>`;
                }
            }, 300);
        }

        async function fetchMyFavorites() {
            let favs = JSON.parse(localStorage.getItem(_favsKey())) || [];
            const container = document.getElementById('favorites-container');

            if (favs.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px 0; color: #666;">
                        <span style="font-size: 3rem; display: block; margin-bottom: 15px;">❤️</span>
                        Favori listeniz şu an boş görünüyor. Vitrinden ürün eklemeye başlayın.
                    </div>`;
                return;
            }

            container.innerHTML = '<p style="text-align:center; color:#888;">Favorileriniz yükleniyor...</p>';

            try {
                // Tüm ürünleri çekip içinden favorileri filtreliyoruz.
                // Gerçek bir senaryoda sadece seçili ID'ler veritabanından çekilebilir.
                const response = await fetch('http://localhost:5000/api/products');
                const allProducts = await response.json();

                const favoriteProducts = allProducts.filter(p => favs.includes(p.id));

                if (favoriteProducts.length === 0) {
                    container.innerHTML = `<div style="text-align: center; padding: 40px 0; color: #666;">Geçerli bir favori ürün bulunamadı.</div>`;
                    return;
                }

                let html = '<div class="product-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 20px;">';

                favoriteProducts.forEach(product => {
                    const imageUrl = product.image_url || 'https://via.placeholder.com/250?text=Görsel+Yok';

                    // GERÇEK İNDİRİM ALGORİTMASI (YEŞİL VERSİYON)
                    let priceHtml = '';
                    let discountBadge = '';

                    if (product.old_price && parseFloat(product.old_price) > parseFloat(product.price)) {
                        const oldP = parseFloat(product.old_price);
                        const newP = parseFloat(product.price);
                        const discountRate = Math.round(((oldP - newP) / oldP) * 100);

                        discountBadge = '';

                        priceHtml = `
                            <div style="flex: 1; display: inline-flex; gap: 8px; align-items: center; background: #FAFAFA; padding: 4px 8px; border-radius: 8px; border: 1px solid #F0F0F0; margin-right: 10px;">
                                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: #00897B; font-size: 0.65rem; font-weight: 800; line-height: 1.1; padding-right: 6px; border-right: 1px solid #E0E0E0;">
                                    <span>Sepete</span>
                                    <span>Özel</span>
                                </div>
                                <div style="display: flex; flex-direction: column; justify-content: center;">
                                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                                        <span style="color: #777; text-decoration: line-through; font-size: 0.75rem;">${oldP.toFixed(2)} TL</span>
                                        <span style="background: #00897B; color: white; padding: 1px 4px; border-radius: 4px; font-weight: bold; font-size: 0.65rem;">%${discountRate}</span>
                                    </div>
                                    <div style="color: #00897B; font-weight: 800; font-size: 1.15rem; line-height: 1;">${newP.toFixed(2)} <span style="font-size: 0.8rem; font-weight: 600;">TL</span></div>
                                </div>
                            </div>
                        `;
                    } else {
                        priceHtml = `
                            <div style="flex: 1; display: inline-flex; align-items: flex-end; background: #FAFAFA; padding: 6px 10px; border-radius: 8px; border: 1px solid #F0F0F0; height: 100%; margin-right: 10px;">
                                <div style="color: #333; font-weight: 800; font-size: 1.15rem; line-height: 1;">${parseFloat(product.price).toFixed(2)} <span style="font-size: 0.8rem;">TL</span></div>
                            </div>
                        `;
                    }

                    // YILDIZ DEĞERLENDİRMESİ
                    let starsDiv = '';
                    const avgRating = parseFloat(product.average_rating || 0).toFixed(1);
                    const totalRev = parseInt(product.review_count) || 0;

                    if (totalRev > 0) {
                        starsDiv = `
                            <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 5px; font-size: 0.95rem; font-weight: 600; color: #333;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F7941D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="fill: #F7941D;">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                </svg>
                                <span>${avgRating.replace('.', ',')}</span> 
                                <span style="color: #888; font-weight: 400;">(${totalRev})</span>
                            </div>`;
                    } else {
                        starsDiv = `
                            <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 5px; font-size: 0.95rem; font-weight: 600; color: #888;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="fill: #CCC;">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                </svg>
                                <span style="font-weight: 400; font-size: 0.85rem;">Değerlendirme Yok</span>
                            </div>`;
                    }

                    html += `
                        <div class="product-card" style="box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #F0F0F0; transition: 0.3s; position: relative; display: flex; flex-direction: column; background: white; padding: 20px; border-radius: 12px;">
                            ${discountBadge}
                            <button class="btn-favorite active" style="top: 15px; right: 15px;" onclick="toggleFavoriteProfile(this, event, ${product.id})" title="Favorilerden Çıkar">
                                <svg class="heart-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                            </button>
                            <a href="product.html?id=${product.id}" style="text-decoration: none; color: inherit; flex-grow: 1;">
                                <img src="${imageUrl}" class="product-img" style="width: 100%; height: 220px; object-fit: cover; margin-bottom: 20px; border-radius: 8px;" alt="${product.name}">
                                <div class="product-title" style="font-size: 1.1rem; font-weight: 600; color: #222; margin-bottom: 10px; line-height: 1.4;">${product.name}</div>
                                ${starsDiv}
                            </a>
                            <div style="display: flex; align-items: stretch; margin-top: auto; padding-top: 15px;">
                                ${priceHtml}
                                <button class="btn-add" onclick="window.location.href='product.html?id=${product.id}'" style="background: #F4F7F6; border: 1px solid #EAEAEA; cursor: pointer; border-radius: 8px; width: 45px; height: 45px; display: flex; justify-content: center; align-items: center; transition: 0.2s;">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F2A43" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="9" cy="21" r="1"></circle>
                                        <circle cx="20" cy="21" r="1"></circle>
                                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        <line x1="12" y1="10" x2="16" y2="10"></line>
                                        <line x1="14" y1="8" x2="14" y2="12"></line>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `;
                });

                html += '</div>';
                container.innerHTML = html;

            } catch (error) {
                container.innerHTML = '<p style="color:red; text-align:center;">Sunucuya bağlanılamadı!</p>';
            }
        }

        // --- 6. DEĞERLENDİRMELERİMİ GETİRME ---
        async function fetchMyReviews() {
            const container = document.getElementById('reviews-container');
            container.innerHTML = '<p style="text-align:center; color:#888; padding: 40px 0;">Değerlendirmeleriniz yükleniyor...</p>';

            try {
                const effectiveUserId = getAuthenticatedUserId() || Number(user.id);
                if (!Number.isInteger(effectiveUserId)) throw new Error('Oturum bilgisi dogrulanamadi.');

                const response = await fetch('http://localhost:5000/api/reviews/user/' + effectiveUserId, {
                    headers: authHeaders()
                });
                const reviews = await response.json();
                if (!response.ok) throw new Error(reviews.error || 'Degerlendirmeler getirilemedi.');

                if (!reviews || reviews.length === 0) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 40px 0; color: #666;">
                            <span style="font-size: 3rem; display: block; margin-bottom: 15px;">⭐</span>
                            Henüz hiçbir ürüne yorum yapmamışsınız.
                        </div>`;
                    return;
                }

                let html = '<div style="display: flex; flex-direction: column; gap: 20px;">';

                reviews.forEach(review => {
                    const date = new Date(review.created_at).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
                    const imageUrl = review.image_url || 'https://via.placeholder.com/100?text=Görsel+Yok';

                    // Yıldızları oluştur
                    let starsHtml = '';
                    const rating = parseInt(review.rating);
                    for (let i = 1; i <= 5; i++) {
                        if (i <= rating) {
                            starsHtml += `<svg width="18" height="18" viewBox="0 0 24 24" fill="#F7941D" stroke="#F7941D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
                        } else {
                            starsHtml += `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DDD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
                        }
                    }

                    html += `
                        <div style="background: #FAFAFA; border: 1px solid #EAEAEA; border-radius: 12px; padding: 20px; display: flex; gap: 20px; align-items: flex-start; transition: 0.3s;">
                            <a href="product.html?id=${review.product_id}" style="flex-shrink: 0; display: block; border-radius: 8px; overflow: hidden; border: 1px solid #EEEEEE;">
                                <img src="${imageUrl}" alt="${review.product_name}" style="width: 100px; height: 100px; object-fit: cover; display: block;">
                            </a>
                            <div style="flex-grow: 1;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <a href="product.html?id=${review.product_id}" style="text-decoration: none; color: #0F2A43; font-weight: 700; font-size: 1.1rem; flex-grow: 1; margin-right: 15px;">${review.product_name}</a>
                                    <div style="font-size: 0.85rem; color: #888; white-space: nowrap;">${date}</div>
                                </div>
                                <div style="display: flex; gap: 3px; margin-bottom: 12px;">
                                    ${starsHtml}
                                </div>
                                <p style="color: #444; font-size: 0.95rem; line-height: 1.5; margin: 0; background: white; padding: 15px; border-radius: 8px; border: 1px solid #F0F0F0;">
                                    "${review.comment}"
                                </p>
                            </div>
                        </div>
                    `;
                });

                html += '</div>';
                container.innerHTML = html;

            } catch (error) {
                const rawMsg = error && error.message ? error.message : 'Degerlendirmeler alinamadi.';
                const isAuthError = /Authentication required|Invalid or expired token|Access denied|403|401/i.test(rawMsg);
                const msg = isAuthError ? 'Oturum suresi dolmus. Lutfen tekrar giris yapin.' : rawMsg;
                console.error(error);
                container.innerHTML = '<p style="color:red; text-align:center; padding: 40px 0;">' + msg + '</p>';

            }
        }
    