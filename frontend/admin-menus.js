(function adminMenusModule(window, document) {
    'use strict';

    const state = {
        menus: [],
        items: [],
        categories: [],
        collections: [],
        selectedMenuId: null,
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

    const root = () => document.getElementById('admin-menu-manager');
    const byId = (id) => state.items.find((item) => Number(item.id) === Number(id));
    const selectedMenu = () => state.menus.find((menu) => Number(menu.id) === Number(state.selectedMenuId));

    function formMarkup() {
        return `
            <div id="admin-menu-error" class="catalog-admin-error" hidden></div>
            <div class="catalog-admin-grid">
                <section>
                    <div class="catalog-admin-toolbar">
                        <select id="admin-menu-select" class="form-control" aria-label="Yönetilecek menü"></select>
                        <button type="button" class="btn-add" data-menu-action="new-menu">+ Menü</button>
                    </div>
                    <form id="admin-menu-form" class="catalog-admin-form" hidden>
                        <input type="hidden" id="admin-menu-id">
                        <div class="form-group">
                            <label for="admin-menu-code">Sistem Kodu</label>
                            <select id="admin-menu-code" class="form-control" required>
                                <option value="main">Ana Menü</option><option value="footer">Alt Bilgi Menüsü</option>
                                <option value="mobile">Mobil Menü</option><option value="home">Ana Sayfa Menüsü</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="admin-menu-name">Ad</label>
                            <input id="admin-menu-name" class="form-control" maxlength="120" required>
                        </div>
                        <label class="category-toggle"><input type="checkbox" id="admin-menu-active" checked> Aktif</label>
                        <div class="catalog-admin-actions span-2">
                            <button class="btn-submit" type="submit">Menüyü Kaydet</button>
                            <button class="btn-edit" type="button" data-menu-action="cancel-menu">Vazgeç</button>
                        </div>
                    </form>
                    <div id="admin-menu-summary"></div>
                </section>
                <section>
                    <div class="catalog-admin-toolbar">
                        <strong>Menü Öğeleri</strong>
                        <button type="button" class="btn-add" data-menu-action="new-item">+ Öğe</button>
                    </div>
                    <form id="admin-menu-item-form" class="catalog-admin-form" hidden>
                        <input type="hidden" id="admin-menu-item-id">
                        <div class="form-group"><label>Başlık</label><input id="admin-menu-item-title" class="form-control" maxlength="160" required></div>
                        <div class="form-group"><label>Alt başlık</label><input id="admin-menu-item-subtitle" class="form-control" maxlength="240"></div>
                        <div class="form-group"><label>Hedef Türü</label>
                            <select id="admin-menu-target-type" class="form-control">
                                <option value="">Sadece grup</option>
                                <option value="category">Kategori</option>
                                <option value="collection">Koleksiyon</option>
                                <option value="internal_url">Site İçi Bağlantı</option>
                            </select>
                        </div>
                        <div class="form-group" id="admin-menu-target-select-wrap"><label>Hedef</label>
                            <select id="admin-menu-target-id" class="form-control"></select>
                        </div>
                        <div class="form-group" id="admin-menu-url-wrap" hidden><label>Site İçi Yol</label>
                            <input id="admin-menu-internal-url" class="form-control" placeholder="/kampanyalar">
                        </div>
                        <div class="form-group"><label>Üst Menü Öğesi</label><select id="admin-menu-parent" class="form-control"></select></div>
                        <div class="form-group"><label>Sıra</label><input id="admin-menu-sort" type="number" min="0" class="form-control" value="0"></div>
                        <div class="form-group"><label>İkon</label><input id="admin-menu-icon" class="form-control" maxlength="120"></div>
                        <div class="form-group"><label>Görsel Adresi</label><input id="admin-menu-image" class="form-control"></div>
                        <div class="form-group"><label>Vurgu rengi</label><input id="admin-menu-accent" class="form-control" placeholder="#F7941D"></div>
                        <label class="category-toggle"><input type="checkbox" id="admin-menu-item-active" checked> Aktif</label>
                        <div class="catalog-admin-actions span-2">
                            <button class="btn-submit" type="submit">Öğeyi Kaydet</button>
                            <button class="btn-edit" type="button" data-menu-action="cancel-item">Vazgeç</button>
                        </div>
                    </form>
                    <div id="admin-menu-tree" class="catalog-admin-tree"></div>
                </section>
            </div>`;
    }

    function showError(error) {
        const element = document.getElementById('admin-menu-error');
        if (!element) return;
        element.textContent = error?.message || String(error || '');
        element.hidden = !element.textContent;
    }

    function populateMenuSelect() {
        const select = document.getElementById('admin-menu-select');
        select.innerHTML = state.menus.length
            ? state.menus.map((menu) => `<option value="${Number(menu.id)}">${escapeHtml(menu.name)} (Sistem Kodu: ${escapeHtml(menu.code)})</option>`).join('')
            : '<option value="">Henüz menü yok</option>';
        if (!state.selectedMenuId && state.menus[0]) state.selectedMenuId = Number(state.menus[0].id);
        select.value = state.selectedMenuId ? String(state.selectedMenuId) : '';
        const menu = selectedMenu();
        document.getElementById('admin-menu-summary').innerHTML = menu
            ? `<div class="catalog-admin-card${menu.is_active ? '' : ' is-inactive'}">
                <strong>${escapeHtml(menu.name)}</strong>
                <div class="catalog-admin-meta">Sistem Kodu: ${escapeHtml(menu.code)} · ${Number(menu.item_count || 0)} öğe · ${menu.is_active ? 'Aktif' : 'Pasif'}</div>
                <div class="catalog-admin-actions" style="margin-top:9px">
                    <button class="btn-edit" data-menu-action="edit-menu" data-id="${Number(menu.id)}">Düzenle</button>
                    <button class="btn-edit" data-menu-action="toggle-menu" data-id="${Number(menu.id)}">${menu.is_active ? 'Pasifleştir' : 'Aktifleştir'}</button>
                </div>
            </div>`
            : '<div class="catalog-admin-warning">Öğe eklemek için önce menü oluşturun.</div>';
    }

    function populateItemOptions(editingId = null) {
        const type = document.getElementById('admin-menu-target-type').value;
        const target = document.getElementById('admin-menu-target-id');
        const targetWrap = document.getElementById('admin-menu-target-select-wrap');
        const urlWrap = document.getElementById('admin-menu-url-wrap');
        const options = type === 'category'
            ? state.categories.map((item) => ({ id: item.id, name: item.name }))
            : type === 'collection'
                ? state.collections.map((item) => ({ id: item.id, name: item.name }))
                : [];
        target.innerHTML = '<option value="">Seçin</option>' +
            options.map((item) => `<option value="${Number(item.id)}">${escapeHtml(item.name)}</option>`).join('');
        targetWrap.hidden = !['category', 'collection'].includes(type);
        urlWrap.hidden = type !== 'internal_url';

        const parent = document.getElementById('admin-menu-parent');
        parent.innerHTML = '<option value="">Kök seviye</option>' +
            state.items.filter((item) => Number(item.id) !== Number(editingId))
                .map((item) => `<option value="${Number(item.id)}">${escapeHtml(item.title)}</option>`).join('');
    }

    function targetLabel(item) {
        if (item.target_type === 'category') {
            return `Kategori: ${state.categories.find((entry) => Number(entry.id) === Number(item.category_id))?.name || item.category_id}`;
        }
        if (item.target_type === 'collection') {
            return `Koleksiyon: ${state.collections.find((entry) => Number(entry.id) === Number(item.collection_id))?.name || item.collection_id}`;
        }
        if (item.target_type === 'internal_url') return `Site İçi Yol: ${item.internal_url}`;
        return 'Hedefsiz grup';
    }

    function renderTree() {
        const container = document.getElementById('admin-menu-tree');
        if (!state.selectedMenuId) {
            container.innerHTML = '';
            return;
        }
        const children = new Map();
        state.items.forEach((item) => {
            const key = item.parent_id === null ? 'root' : Number(item.parent_id);
            if (!children.has(key)) children.set(key, []);
            children.get(key).push(item);
        });
        children.forEach((items) => items.sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id)));
        const render = (parent, depth = 0) => (children.get(parent) || []).map((item, index, siblings) => `
            <div class="catalog-admin-node${item.is_active ? '' : ' is-inactive'}" style="margin-left:${Math.min(depth, 4) * 20}px">
                <div class="catalog-admin-node-head">
                    <div><strong>${escapeHtml(item.title)}</strong>
                        <div class="catalog-admin-meta">${escapeHtml(targetLabel(item))} · Sıra ${Number(item.sort_order)} · Seviye ${depth + 1}</div>
                    </div>
                    <div class="catalog-admin-actions">
                        <button class="btn-edit" data-menu-action="move-up" data-id="${Number(item.id)}" ${index === 0 ? 'disabled' : ''}>↑</button>
                        <button class="btn-edit" data-menu-action="move-down" data-id="${Number(item.id)}" ${index === siblings.length - 1 ? 'disabled' : ''}>↓</button>
                        <button class="btn-edit" data-menu-action="edit-item" data-id="${Number(item.id)}">Düzenle</button>
                        <button class="btn-edit" data-menu-action="archive-item" data-id="${Number(item.id)}">${item.is_active ? 'Pasifleştir' : 'Aktifleştir'}</button>
                    </div>
                </div>
                ${render(Number(item.id), depth + 1)}
            </div>`).join('');
        container.innerHTML = render('root') || '<div class="catalog-admin-warning">Bu menüde henüz öğe yok.</div>';
    }

    async function loadItems() {
        state.items = state.selectedMenuId
            ? await api(`/api/admin/menu-items?menu_id=${state.selectedMenuId}&format=flat`, {}, 'Menü öğeleri yüklenemedi.')
            : [];
        populateMenuSelect();
        renderTree();
    }

    async function load() {
        const container = root();
        if (!container) return;
        if (!state.initialized) {
            container.innerHTML = formMarkup();
            bind();
            state.initialized = true;
        }
        showError('');
        try {
            const [menus, categories, collections] = await Promise.all([
                api('/api/admin/menus', {}, 'Menüler yüklenemedi.'),
                api('/api/admin/categories?format=flat', {}, 'Kategoriler yüklenemedi.'),
                api('/api/admin/collections', {}, 'Koleksiyonlar yüklenemedi.')
            ]);
            state.menus = menus;
            state.categories = categories;
            state.collections = collections;
            if (!state.menus.some((menu) => Number(menu.id) === Number(state.selectedMenuId))) {
                state.selectedMenuId = state.menus[0] ? Number(state.menus[0].id) : null;
            }
            await loadItems();
        } catch (error) {
            showError(error);
        }
    }

    function openMenuForm(menu = null) {
        const form = document.getElementById('admin-menu-form');
        form.hidden = false;
        document.getElementById('admin-menu-id').value = menu?.id || '';
        document.getElementById('admin-menu-code').value = menu?.code || 'main';
        document.getElementById('admin-menu-name').value = menu?.name || '';
        document.getElementById('admin-menu-active').checked = menu?.is_active !== false;
    }

    function openItemForm(item = null) {
        const form = document.getElementById('admin-menu-item-form');
        form.hidden = false;
        document.getElementById('admin-menu-item-id').value = item?.id || '';
        document.getElementById('admin-menu-item-title').value = item?.title || '';
        document.getElementById('admin-menu-item-subtitle').value = item?.subtitle || '';
        document.getElementById('admin-menu-target-type').value = item?.target_type || '';
        populateItemOptions(item?.id);
        document.getElementById('admin-menu-target-id').value = item?.category_id || item?.collection_id || '';
        document.getElementById('admin-menu-internal-url').value = item?.internal_url || '';
        document.getElementById('admin-menu-parent').value = item?.parent_id || '';
        document.getElementById('admin-menu-sort').value = Number(item?.sort_order || 0);
        document.getElementById('admin-menu-icon').value = item?.icon || '';
        document.getElementById('admin-menu-image').value = item?.image_url || '';
        document.getElementById('admin-menu-accent').value = item?.accent_color || '';
        document.getElementById('admin-menu-item-active').checked = item?.is_active !== false;
    }

    async function reorder(id, direction) {
        const item = byId(id);
        const siblings = state.items.filter((entry) => entry.parent_id === item.parent_id)
            .sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));
        const index = siblings.findIndex((entry) => Number(entry.id) === Number(id));
        const other = siblings[index + direction];
        if (!other) return;
        await api('/api/admin/menu-items/reorder', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: [
                    { id: item.id, sort_order: Number(other.sort_order) },
                    { id: other.id, sort_order: Number(item.sort_order) }
                ]
            })
        }, 'Sıralama güncellenemedi.');
        await loadItems();
    }

    function bind() {
        root().addEventListener('change', async (event) => {
            if (event.target.id === 'admin-menu-select') {
                state.selectedMenuId = Number(event.target.value) || null;
                await loadItems();
            }
            if (event.target.id === 'admin-menu-target-type') populateItemOptions(document.getElementById('admin-menu-item-id').value);
        });
        root().addEventListener('submit', async (event) => {
            event.preventDefault();
            showError('');
            try {
                if (event.target.id === 'admin-menu-form') {
                    const id = document.getElementById('admin-menu-id').value;
                    await api(id ? `/api/admin/menus/${id}` : '/api/admin/menus', {
                        method: id ? 'PATCH' : 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            code: document.getElementById('admin-menu-code').value,
                            name: document.getElementById('admin-menu-name').value,
                            is_active: document.getElementById('admin-menu-active').checked
                        })
                    });
                    event.target.hidden = true;
                    await load();
                    return;
                }
                const id = document.getElementById('admin-menu-item-id').value;
                const type = document.getElementById('admin-menu-target-type').value || null;
                const targetId = Number(document.getElementById('admin-menu-target-id').value) || null;
                await api(id ? `/api/admin/menu-items/${id}` : '/api/admin/menu-items', {
                    method: id ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        menu_id: state.selectedMenuId,
                        title: document.getElementById('admin-menu-item-title').value,
                        subtitle: document.getElementById('admin-menu-item-subtitle').value,
                        target_type: type,
                        category_id: type === 'category' ? targetId : null,
                        collection_id: type === 'collection' ? targetId : null,
                        internal_url: type === 'internal_url' ? document.getElementById('admin-menu-internal-url').value : null,
                        parent_id: Number(document.getElementById('admin-menu-parent').value) || null,
                        sort_order: Number(document.getElementById('admin-menu-sort').value) || 0,
                        icon: document.getElementById('admin-menu-icon').value,
                        image_url: document.getElementById('admin-menu-image').value,
                        accent_color: document.getElementById('admin-menu-accent').value,
                        is_active: document.getElementById('admin-menu-item-active').checked
                    })
                });
                event.target.hidden = true;
                await loadItems();
            } catch (error) {
                showError(error);
            }
        });
        root().addEventListener('click', async (event) => {
            const button = event.target.closest('[data-menu-action]');
            if (!button) return;
            const action = button.dataset.menuAction;
            const id = Number(button.dataset.id);
            showError('');
            try {
                if (action === 'new-menu') openMenuForm();
                if (action === 'cancel-menu') document.getElementById('admin-menu-form').hidden = true;
                if (action === 'edit-menu') openMenuForm(state.menus.find((menu) => Number(menu.id) === id));
                if (action === 'toggle-menu') {
                    const menu = state.menus.find((entry) => Number(entry.id) === id);
                    await api(`/api/admin/menus/${id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ is_active: !menu.is_active })
                    });
                    await load();
                }
                if (action === 'new-item') openItemForm();
                if (action === 'cancel-item') document.getElementById('admin-menu-item-form').hidden = true;
                if (action === 'edit-item') openItemForm(byId(id));
                if (action === 'archive-item') {
                    const item = byId(id);
                    await api(`/api/admin/menu-items/${id}/archive`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ archived: item.is_active })
                    });
                    await loadItems();
                }
                if (action === 'move-up') await reorder(id, -1);
                if (action === 'move-down') await reorder(id, 1);
            } catch (error) {
                showError(error);
            }
        });
    }

    window.NovaStoreAdminMenus = {
        load,
        _test: { escapeHtml, targetLabel }
    };
})(window, document);
