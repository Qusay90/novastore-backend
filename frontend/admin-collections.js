(function adminCollectionsModule(window, document) {
    'use strict';

    const RULE_LABELS = {
        new_arrivals: 'Yeni Gelenler · son 30 gün',
        discount: 'İndirim · eski fiyat yeni fiyattan yüksek',
        best_sellers: 'Çok Satanlar · son 30 gün · ödemesi alınmış ve teslim edilmiş'
    };
    const state = {
        collections: [],
        products: [],
        manualProducts: [],
        selectedManualId: null,
        initialized: false
    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    const api = async (url, options = {}, fallback = 'İşlem tamamlanamadı.') =>
        adminReadJson(await adminApiFetch(url, options), fallback);
    const root = () => document.getElementById('admin-collection-manager');
    const findCollection = (id) => state.collections.find((entry) => Number(entry.id) === Number(id));

    function shell() {
        return `
            <div id="admin-collection-error" class="catalog-admin-error" hidden></div>
            <div class="catalog-admin-toolbar">
                <div>
                    <strong>Koleksiyonlar</strong>
                    <div class="catalog-admin-meta">Boş ve pasif koleksiyonlar müşteri tarafında otomatik gizlenir.</div>
                </div>
                <button type="button" class="btn-add" data-collection-action="new">+ Koleksiyon</button>
            </div>
            <form id="admin-collection-form" class="catalog-admin-form" hidden>
                <input type="hidden" id="admin-collection-id">
                <div class="form-group"><label>Ad</label><input id="admin-collection-name" class="form-control" maxlength="160" required></div>
                <div class="form-group"><label>URL Adı</label><input id="admin-collection-slug" class="form-control" maxlength="180"></div>
                <div class="form-group"><label>Koleksiyon Türü</label>
                    <select id="admin-collection-type" class="form-control">
                        <option value="manual">Manuel</option><option value="dynamic">Dinamik</option>
                    </select>
                </div>
                <div class="form-group" id="admin-collection-rule-wrap" hidden><label>Dinamik kural</label>
                    <select id="admin-collection-rule" class="form-control">
                        <option value="new_arrivals">Yeni Gelenler</option>
                        <option value="discount">İndirim</option>
                        <option value="best_sellers">Çok Satanlar</option>
                    </select>
                </div>
                <div class="form-group span-2"><label>Açıklama</label><textarea id="admin-collection-description" class="form-control" rows="3"></textarea></div>
                <div class="form-group"><label>Görsel Adresi</label><input id="admin-collection-image" class="form-control"></div>
                <div class="form-group"><label>Büyük Görsel Adresi</label><input id="admin-collection-banner" class="form-control"></div>
                <div class="form-group"><label>Sıra</label><input id="admin-collection-sort" type="number" min="0" class="form-control" value="0"></div>
                <div class="form-group"><label>Arama Motoru Başlığı</label><input id="admin-collection-seo-title" class="form-control"></div>
                <div class="form-group span-2"><label>Arama Motoru Açıklaması</label><textarea id="admin-collection-seo-description" class="form-control" rows="2"></textarea></div>
                <label class="category-toggle"><input type="checkbox" id="admin-collection-home"> Ana sayfada göster</label>
                <label class="category-toggle"><input type="checkbox" id="admin-collection-active" checked> Aktif</label>
                <div class="catalog-admin-actions span-2">
                    <button class="btn-submit" type="submit">Koleksiyonu Kaydet</button>
                    <button class="btn-edit" type="button" data-collection-action="cancel">Vazgeç</button>
                </div>
            </form>
            <div class="catalog-admin-grid" style="margin-top:16px">
                <div id="admin-collection-list" class="catalog-admin-list"></div>
                <section id="admin-manual-products" class="catalog-admin-panel">
                    <div class="catalog-admin-warning">Manuel ürünleri yönetmek için manuel bir koleksiyon seçin.</div>
                </section>
            </div>`;
    }

    function showError(error) {
        const element = document.getElementById('admin-collection-error');
        if (!element) return;
        element.textContent = error?.message || String(error || '');
        element.hidden = !element.textContent;
    }

    function renderCollections() {
        const container = document.getElementById('admin-collection-list');
        container.innerHTML = state.collections.map((collection) => {
            const isManual = collection.collection_type === 'manual';
            const rule = isManual ? 'Manuel' : RULE_LABELS[collection.rule_code] || collection.rule_code;
            return `<article class="catalog-admin-card${collection.is_active ? '' : ' is-inactive'}">
                <div class="catalog-admin-card-head">
                    <div>
                        <strong>${escapeHtml(collection.name)}</strong>
                        <div class="catalog-admin-meta">URL Adı: /${escapeHtml(collection.slug)} · Sıra ${Number(collection.sort_order || 0)}</div>
                    </div>
                    <div>
                        <span class="catalog-admin-badge">${escapeHtml(rule)}</span>
                        ${collection.show_on_home ? '<span class="catalog-admin-badge">Ana sayfa</span>' : ''}
                    </div>
                </div>
                <p class="catalog-admin-meta">${escapeHtml(collection.description || 'Açıklama yok')}</p>
                ${isManual && Number(collection.manual_product_count || 0) === 0
                    ? '<div class="catalog-admin-warning">Boş: mağazada görünmez.</div>' : ''}
                <div class="catalog-admin-actions" style="margin-top:9px">
                    <button class="btn-edit" data-collection-action="edit" data-id="${Number(collection.id)}">Düzenle</button>
                    ${isManual ? `<button class="btn-edit" data-collection-action="products" data-id="${Number(collection.id)}">Ürünler (${Number(collection.manual_product_count || 0)})</button>` : ''}
                    <button class="btn-edit" data-collection-action="archive" data-id="${Number(collection.id)}">${collection.is_active ? 'Arşivle' : 'Arşivden Çıkar'}</button>
                </div>
            </article>`;
        }).join('') || '<div class="catalog-admin-warning">Henüz koleksiyon yok.</div>';
    }

    function productOptions(filter = '') {
        const needle = String(filter || '').trim().toLocaleLowerCase('tr-TR');
        const assigned = new Set(state.manualProducts.map((product) => Number(product.id)));
        return state.products
            .filter((product) => !assigned.has(Number(product.id)))
            .filter((product) => !needle || String(product.name || '').toLocaleLowerCase('tr-TR').includes(needle))
            .slice(0, 80)
            .map((product) => `<option value="${Number(product.id)}">${escapeHtml(product.name)} · stok ${Number(product.stock || 0)}</option>`)
            .join('');
    }

    function renderManualProducts(filter = '') {
        const panel = document.getElementById('admin-manual-products');
        const collection = findCollection(state.selectedManualId);
        if (!collection) {
            panel.innerHTML = '<div class="catalog-admin-warning">Manuel ürünleri yönetmek için manuel bir koleksiyon seçin.</div>';
            return;
        }
        panel.innerHTML = `
            <div class="catalog-admin-toolbar"><strong>${escapeHtml(collection.name)} ürünleri</strong>
                <span class="catalog-admin-badge">${state.manualProducts.length} ürün</span>
            </div>
            <div class="form-group"><label>Ürün ara</label><input id="admin-collection-product-search" class="form-control" value="${escapeHtml(filter)}" placeholder="Ürün adı"></div>
            <div class="catalog-admin-actions" style="margin:9px 0 14px">
                <select id="admin-collection-product-select" class="form-control" style="flex:1">
                    <option value="">Ürün seçin</option>${productOptions(filter)}
                </select>
                <button type="button" class="btn-add" data-collection-action="add-product">Ekle</button>
            </div>
            <div class="catalog-admin-list">
                ${state.manualProducts.map((product) => `<div class="catalog-admin-node">
                    <div class="catalog-admin-node-head">
                        <div><strong>${escapeHtml(product.name)}</strong>
                            <div class="catalog-admin-meta">${Number(product.price).toFixed(2)} TL · stok ${Number(product.stock || 0)} · sıra ${Number(product.sort_order || 0)}</div>
                        </div>
                        <button class="btn-edit" data-collection-action="remove-product" data-product-id="${Number(product.id)}">Çıkar</button>
                    </div>
                </div>`).join('') || '<div class="catalog-admin-warning">Bu manuel koleksiyon boş; mağazada gösterilmez.</div>'}
            </div>`;
    }

    async function loadManualProducts(id) {
        state.selectedManualId = Number(id);
        state.manualProducts = await api(`/api/admin/collections/${id}/products`, {}, 'Manuel ürünler yüklenemedi.');
        renderManualProducts();
    }

    async function load() {
        if (!root()) return;
        if (!state.initialized) {
            root().innerHTML = shell();
            bind();
            state.initialized = true;
        }
        showError('');
        try {
            [state.collections, state.products] = await Promise.all([
                api('/api/admin/collections', {}, 'Koleksiyonlar yüklenemedi.'),
                api('/api/products', {}, 'Ürünler yüklenemedi.')
            ]);
            renderCollections();
            if (state.selectedManualId && findCollection(state.selectedManualId)) {
                await loadManualProducts(state.selectedManualId);
            } else {
                state.selectedManualId = null;
                state.manualProducts = [];
                renderManualProducts();
            }
        } catch (error) {
            showError(error);
        }
    }

    function openForm(collection = null) {
        document.getElementById('admin-collection-form').hidden = false;
        document.getElementById('admin-collection-id').value = collection?.id || '';
        document.getElementById('admin-collection-name').value = collection?.name || '';
        document.getElementById('admin-collection-slug').value = collection?.slug || '';
        document.getElementById('admin-collection-type').value = collection?.collection_type || 'manual';
        document.getElementById('admin-collection-rule').value = collection?.rule_code || 'new_arrivals';
        document.getElementById('admin-collection-description').value = collection?.description || '';
        document.getElementById('admin-collection-image').value = collection?.image_url || '';
        document.getElementById('admin-collection-banner').value = collection?.banner_url || '';
        document.getElementById('admin-collection-sort').value = Number(collection?.sort_order || 0);
        document.getElementById('admin-collection-seo-title').value = collection?.seo_title || '';
        document.getElementById('admin-collection-seo-description').value = collection?.seo_description || '';
        document.getElementById('admin-collection-home').checked = collection?.show_on_home === true;
        document.getElementById('admin-collection-active').checked = collection?.is_active !== false;
        document.getElementById('admin-collection-rule-wrap').hidden =
            document.getElementById('admin-collection-type').value !== 'dynamic';
    }

    function bind() {
        root().addEventListener('change', (event) => {
            if (event.target.id === 'admin-collection-type') {
                document.getElementById('admin-collection-rule-wrap').hidden = event.target.value !== 'dynamic';
            }
        });
        root().addEventListener('input', (event) => {
            if (event.target.id === 'admin-collection-product-search') {
                const select = document.getElementById('admin-collection-product-select');
                select.innerHTML = `<option value="">Ürün seçin</option>${productOptions(event.target.value)}`;
            }
        });
        root().addEventListener('submit', async (event) => {
            if (event.target.id !== 'admin-collection-form') return;
            event.preventDefault();
            showError('');
            try {
                const id = document.getElementById('admin-collection-id').value;
                const type = document.getElementById('admin-collection-type').value;
                await api(id ? `/api/admin/collections/${id}` : '/api/admin/collections', {
                    method: id ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: document.getElementById('admin-collection-name').value,
                        slug: document.getElementById('admin-collection-slug').value,
                        collection_type: type,
                        rule_code: type === 'dynamic' ? document.getElementById('admin-collection-rule').value : null,
                        description: document.getElementById('admin-collection-description').value,
                        image_url: document.getElementById('admin-collection-image').value,
                        banner_url: document.getElementById('admin-collection-banner').value,
                        sort_order: Number(document.getElementById('admin-collection-sort').value) || 0,
                        show_on_home: document.getElementById('admin-collection-home').checked,
                        seo_title: document.getElementById('admin-collection-seo-title').value,
                        seo_description: document.getElementById('admin-collection-seo-description').value,
                        is_active: document.getElementById('admin-collection-active').checked
                    })
                });
                event.target.hidden = true;
                await load();
            } catch (error) {
                showError(error);
            }
        });
        root().addEventListener('click', async (event) => {
            const button = event.target.closest('[data-collection-action]');
            if (!button) return;
            const action = button.dataset.collectionAction;
            const id = Number(button.dataset.id);
            showError('');
            try {
                if (action === 'new') openForm();
                if (action === 'cancel') document.getElementById('admin-collection-form').hidden = true;
                if (action === 'edit') openForm(findCollection(id));
                if (action === 'archive') {
                    const collection = findCollection(id);
                    await api(`/api/admin/collections/${id}/archive`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ archived: collection.is_active })
                    });
                    await load();
                }
                if (action === 'products') await loadManualProducts(id);
                if (action === 'add-product') {
                    const productId = Number(document.getElementById('admin-collection-product-select').value);
                    if (!productId) throw new Error('Eklenecek ürünü seçin.');
                    await api(`/api/admin/collections/${state.selectedManualId}/products`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ product_id: productId, sort_order: state.manualProducts.length })
                    });
                    await load();
                }
                if (action === 'remove-product') {
                    await api(`/api/admin/collections/${state.selectedManualId}/products/${Number(button.dataset.productId)}`, {
                        method: 'DELETE'
                    });
                    await load();
                }
            } catch (error) {
                showError(error);
            }
        });
    }

    window.NovaStoreAdminCollections = {
        load,
        _test: { escapeHtml, ruleLabels: RULE_LABELS }
    };
})(window, document);
