(function categoryAdminModule(window, document) {
    'use strict';

    const state = {
        apiFetch: null,
        onCategoriesChanged: null,
        tree: [],
        flat: [],
        editingId: null,
        originalParentId: null,
        originalSortOrder: 0,
        originalPayload: null,
        initialized: false
    };

    const FIELD_IDS = {
        name: 'cat-name',
        parentId: 'cat-parent',
        slug: 'cat-slug',
        imageUrl: 'cat-image-url',
        bannerUrl: 'cat-banner-url',
        icon: 'cat-icon',
        accentColor: 'cat-accent-color',
        description: 'cat-description',
        seoTitle: 'cat-seo-title',
        seoDescription: 'cat-seo-description',
        sortOrder: 'cat-sort-order',
        isActive: 'cat-is-active',
        isCustomerVisible: 'cat-is-customer-visible',
        showInMenu: 'cat-show-in-menu',
        showOnHome: 'cat-show-on-home',
        hideWhenEmpty: 'cat-hide-when-empty',
        googleTaxonomyId: 'cat-google-taxonomy-id'
    };

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeNullableId(value) {
        if (value === '' || value === null || value === undefined) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function flattenTree(nodes, depth = 0, result = []) {
        for (const node of Array.isArray(nodes) ? nodes : []) {
            result.push({ ...node, depth });
            flattenTree(node.children, depth + 1, result);
        }
        return result;
    }

    function fieldValue(fields, name) {
        return String(fields[name] ?? '').trim();
    }

    function buildCategoryPayload(fields) {
        const sortOrder = Number.parseInt(fields.sortOrder, 10);
        return {
            name: fieldValue(fields, 'name'),
            parent_id: normalizeNullableId(fields.parentId),
            slug: fieldValue(fields, 'slug') || null,
            image_url: fieldValue(fields, 'imageUrl') || null,
            banner_url: fieldValue(fields, 'bannerUrl') || null,
            icon: fieldValue(fields, 'icon') || null,
            accent_color: fieldValue(fields, 'accentColor') || null,
            description: fieldValue(fields, 'description') || null,
            seo_title: fieldValue(fields, 'seoTitle') || null,
            seo_description: fieldValue(fields, 'seoDescription') || null,
            sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
            is_active: Boolean(fields.isActive),
            is_customer_visible: Boolean(fields.isCustomerVisible),
            show_in_menu: Boolean(fields.showInMenu),
            show_on_home: Boolean(fields.showOnHome),
            hide_when_empty: Boolean(fields.hideWhenEmpty),
            google_taxonomy_id: fieldValue(fields, 'googleTaxonomyId') || null
        };
    }

    function buildMovePayload(fields) {
        const payload = buildCategoryPayload(fields);
        return {
            parent_id: payload.parent_id,
            sort_order: payload.sort_order
        };
    }

    function configure(options = {}) {
        if (typeof options.apiFetch === 'function') state.apiFetch = options.apiFetch;
        if (typeof options.onCategoriesChanged === 'function') {
            state.onCategoriesChanged = options.onCategoriesChanged;
        }
        initialize();
    }

    function element(id) {
        return document.getElementById(id);
    }

    function setError(message) {
        const error = element('category-form-error');
        if (!error) return;
        error.textContent = message || '';
        error.hidden = !message;
    }

    async function readResponse(response) {
        let body = {};
        try {
            body = await response.json();
        } catch (_) {
            body = {};
        }
        if (!response.ok) {
            throw new Error(body.message || body.error || `İstek başarısız (${response.status})`);
        }
        return body;
    }

    async function request(url, options) {
        if (!state.apiFetch) throw new Error('Admin API istemcisi hazırlanmadı.');
        return readResponse(await state.apiFetch(url, options));
    }

    function publicState(category) {
        if (category.deleted_at) return { label: 'Arşiv', className: 'archived' };
        if (category.is_active === false) return { label: 'Pasif', className: 'inactive' };
        if (category.is_customer_visible === false) return { label: 'Gizli', className: 'hidden' };
        if (Number(category.subtree_visible_product_count || 0) === 0) {
            return { label: 'Public boş', className: 'empty' };
        }
        return { label: 'Yayında', className: 'active' };
    }

    function renderTree() {
        const tbody = element('categories-table-body');
        if (!tbody) return;

        if (state.flat.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="category-empty-state">Henüz kategori bulunmuyor.</td></tr>';
            return;
        }

        tbody.innerHTML = state.flat.map((category) => {
            const status = publicState(category);
            const depth = Number(category.depth || 0);
            const indent = Math.min(depth, 12) * 22;
            const archiveAction = category.deleted_at ? 'restore' : 'archive';
            const archiveLabel = category.deleted_at ? 'Geri Yükle' : 'Arşivle';
            const parentName = category.parent_id
                ? state.flat.find((item) => Number(item.id) === Number(category.parent_id))?.name || '—'
                : 'Kök';

            return `
                <tr class="category-tree-row ${category.deleted_at ? 'is-archived' : ''}">
                    <td>${escapeHtml(category.id)}</td>
                    <td>
                        <div class="category-tree-name" style="padding-left:${indent}px">
                            <span class="category-tree-branch" aria-hidden="true">${depth ? '↳' : '●'}</span>
                            <strong>${escapeHtml(category.name)}</strong>
                            <small>/${escapeHtml(category.path || category.slug || '')}</small>
                        </div>
                    </td>
                    <td>${escapeHtml(parentName)}</td>
                    <td><span class="category-status ${status.className}">${escapeHtml(status.label)}</span></td>
                    <td>${escapeHtml(category.direct_product_count || 0)}</td>
                    <td>${escapeHtml(category.visible_product_count || 0)}</td>
                    <td>${escapeHtml(category.sellable_product_count || 0)}</td>
                    <td>${escapeHtml(category.descendant_visible_product_count || 0)}</td>
                    <td>${escapeHtml(category.descendant_sellable_product_count || 0)}</td>
                    <td>${escapeHtml(category.subtree_visible_product_count || 0)}</td>
                    <td>${escapeHtml(category.subtree_sellable_product_count || 0)}</td>
                    <td class="category-actions">
                        <button type="button" class="btn-edit" onclick="NovaStoreAdminCategories.openEdit(${Number(category.id)})">Düzenle</button>
                        <button type="button" class="${category.deleted_at ? 'btn-restore' : 'btn-delete'}"
                            onclick="NovaStoreAdminCategories.toggleArchive(${Number(category.id)}, '${archiveAction}')">${archiveLabel}</button>
                    </td>
                </tr>`;
        }).join('');
    }

    async function load() {
        initialize();
        const body = await request('/api/admin/categories?format=tree');
        state.tree = Array.isArray(body) ? body : (body.categories || body.data || []);
        state.flat = flattenTree(state.tree);
        renderTree();
        if (state.onCategoriesChanged) state.onCategoriesChanged(state.flat.map(({ children, ...item }) => item));
        return state.flat;
    }

    function descendantsOf(categoryId) {
        const excluded = new Set([Number(categoryId)]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const category of state.flat) {
                if (excluded.has(Number(category.parent_id)) && !excluded.has(Number(category.id))) {
                    excluded.add(Number(category.id));
                    changed = true;
                }
            }
        }
        return excluded;
    }

    function populateParentOptions(selectedId, editingId) {
        const select = element('cat-parent');
        if (!select) return;
        const excluded = editingId ? descendantsOf(editingId) : new Set();
        const options = ['<option value="">Ana kategori (kök)</option>'];
        for (const category of state.flat) {
            if (excluded.has(Number(category.id)) || category.deleted_at) continue;
            const selected = Number(selectedId) === Number(category.id) ? ' selected' : '';
            const prefix = '— '.repeat(Math.max(0, Number(category.depth || 0)));
            options.push(`<option value="${Number(category.id)}"${selected}>${escapeHtml(prefix + category.name)}</option>`);
        }
        select.innerHTML = options.join('');
    }

    function setField(name, value) {
        const input = element(FIELD_IDS[name]);
        if (!input) return;
        if (input.type === 'checkbox') {
            input.checked = Boolean(value);
        } else {
            input.value = value ?? '';
        }
    }

    function categoryToFields(category = {}) {
        return {
            name: category.name || '',
            parentId: category.parent_id ?? '',
            slug: category.slug || '',
            imageUrl: category.image_url || '',
            bannerUrl: category.banner_url || '',
            icon: category.icon || '',
            accentColor: category.accent_color || '',
            description: category.description || '',
            seoTitle: category.seo_title || '',
            seoDescription: category.seo_description || '',
            sortOrder: category.sort_order ?? 0,
            isActive: category.is_active !== false,
            isCustomerVisible: category.is_customer_visible !== false,
            showInMenu: category.show_in_menu !== false,
            showOnHome: Boolean(category.show_on_home),
            hideWhenEmpty: category.hide_when_empty !== false,
            googleTaxonomyId: category.google_taxonomy_id || ''
        };
    }

    function fillForm(category) {
        const fields = categoryToFields(category);
        Object.entries(fields).forEach(([name, value]) => setField(name, value));
        populateParentOptions(fields.parentId, category?.id);
    }

    function showModal() {
        const modal = element('category-modal');
        if (modal) modal.style.display = 'flex';
    }

    function openCreate() {
        state.editingId = null;
        state.originalParentId = null;
        state.originalSortOrder = 0;
        state.originalPayload = null;
        setError('');
        const title = element('category-modal-title');
        if (title) title.textContent = 'Yeni Kategori';
        fillForm({});
        showModal();
    }

    function openEdit(categoryId) {
        const category = state.flat.find((item) => Number(item.id) === Number(categoryId));
        if (!category) return;
        state.editingId = Number(category.id);
        state.originalParentId = normalizeNullableId(category.parent_id);
        state.originalSortOrder = Number(category.sort_order || 0);
        state.originalPayload = buildCategoryPayload(categoryToFields(category));
        setError('');
        const title = element('category-modal-title');
        if (title) title.textContent = `Kategori Düzenle: ${category.name}`;
        fillForm(category);
        showModal();
    }

    function collectFields() {
        const fields = {};
        Object.entries(FIELD_IDS).forEach(([name, id]) => {
            const input = element(id);
            fields[name] = input?.type === 'checkbox' ? Boolean(input.checked) : (input?.value ?? '');
        });
        return fields;
    }

    async function submit(event) {
        event.preventDefault();
        setError('');
        const saveButton = element('category-save-button');
        if (saveButton) saveButton.disabled = true;

        try {
            const fields = collectFields();
            const payload = buildCategoryPayload(fields);
            if (!payload.name) throw new Error('Kategori adı zorunludur.');

            if (state.editingId) {
                const { parent_id, sort_order, ...metadata } = payload;
                const originalMetadata = { ...(state.originalPayload || {}) };
                delete originalMetadata.parent_id;
                delete originalMetadata.sort_order;
                const changedMetadata = Object.fromEntries(
                    Object.entries(metadata).filter(([key, value]) => value !== originalMetadata[key])
                );
                if (Object.keys(changedMetadata).length > 0) {
                    await request(`/api/admin/categories/${state.editingId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(changedMetadata)
                    });
                }

                const parentChanged = parent_id !== state.originalParentId;
                const sortChanged = sort_order !== state.originalSortOrder;
                if (parentChanged || sortChanged) {
                    await request(`/api/admin/categories/${state.editingId}/move`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ parent_id, sort_order })
                    });
                }
            } else {
                await request('/api/admin/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (typeof window.closeCategoryModal === 'function') window.closeCategoryModal();
            await load();
        } catch (error) {
            setError(error.message || 'Kategori kaydedilemedi.');
        } finally {
            if (saveButton) saveButton.disabled = false;
        }
    }

    async function toggleArchive(categoryId, action) {
        const archived = action !== 'restore';
        const verb = archived ? 'arşivlemek' : 'geri yüklemek';
        if (typeof window.confirm === 'function' && !window.confirm(`Bu kategoriyi ${verb} istiyor musunuz?`)) return;
        try {
            await request(`/api/admin/categories/${Number(categoryId)}/archive`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ archived })
            });
            await load();
        } catch (error) {
            if (typeof window.showNotification === 'function') {
                window.showNotification(error.message || 'Kategori durumu güncellenemedi.', 'error');
            } else {
                window.alert(error.message || 'Kategori durumu güncellenemedi.');
            }
        }
    }

    function initialize() {
        if (state.initialized) return;
        const form = element('add-category-form');
        if (!form) return;
        form.addEventListener('submit', submit);
        state.initialized = true;
    }

    window.NovaStoreAdminCategories = {
        configure,
        load,
        openCreate,
        openEdit,
        toggleArchive,
        _test: {
            escapeHtml,
            flattenTree,
            buildCategoryPayload,
            buildMovePayload,
            publicState
        }
    };
})(window, document);
