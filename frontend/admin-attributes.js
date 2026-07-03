(function adminAttributesModule(window, document) {
    'use strict';

    const state = { attributes: [], templates: [], categories: [], initialized: false };
    const ATTRIBUTE_TYPE_LABELS = {
        text: 'Metin',
        number: 'Sayı',
        boolean: 'Evet/Hayır',
        option: 'Tek Seçenek',
        multi_option: 'Çoklu Seçenek',
        range: 'Aralık'
    };
    const root = () => document.getElementById('admin-attribute-manager');
    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const api = async (url, options = {}, fallback = 'İşlem tamamlanamadı.') =>
        adminReadJson(await adminApiFetch(url, options), fallback);
    const findAttribute = (id) => state.attributes.find((item) => Number(item.id) === Number(id));
    const findTemplate = (id) => state.templates.find((item) => Number(item.id) === Number(id));
    const attributeTypeLabel = (type) => ATTRIBUTE_TYPE_LABELS[type] || type;

    function showError(error) {
        const element = document.getElementById('admin-attribute-error');
        if (!element) return;
        element.textContent = error?.message || String(error || '');
        element.hidden = !element.textContent;
    }

    function categoryOptions(selected = '') {
        return state.categories
            .filter((category) => !category.deleted_at)
            .map((category) => `<option value="${Number(category.id)}"${Number(selected) === Number(category.id) ? ' selected' : ''}>${escapeHtml('— '.repeat(Number(category.depth || 0)) + category.name)}</option>`)
            .join('');
    }

    function attributeOptions(selected = '') {
        return state.attributes
            .filter((attribute) => attribute.is_active)
            .map((attribute) => `<option value="${Number(attribute.id)}"${Number(selected) === Number(attribute.id) ? ' selected' : ''}>${escapeHtml(attribute.name)} · ${escapeHtml(attributeTypeLabel(attribute.type))}</option>`)
            .join('');
    }

    function shell() {
        return `
            <div id="admin-attribute-error" class="catalog-admin-error" hidden></div>
            <div class="catalog-admin-toolbar">
                <div><strong>Özellik tanımları</strong><div class="catalog-admin-meta">Fiziksel silme yerine pasifleştirme kullanılır.</div></div>
                <div class="catalog-admin-actions">
                    <button type="button" class="btn-add" data-attribute-action="new-attribute">+ Özellik</button>
                    <button type="button" class="btn-add" data-attribute-action="new-template">+ Şablon</button>
                </div>
            </div>
            <form id="admin-attribute-form" class="catalog-admin-form" hidden>
                <input type="hidden" id="admin-attribute-id">
                <div class="form-group"><label>Sistem Kodu</label><input id="admin-attribute-code" class="form-control" maxlength="80" pattern="[a-z][a-z0-9_]+" required></div>
                <div class="form-group"><label>Ad</label><input id="admin-attribute-name" class="form-control" maxlength="160" required></div>
                <div class="form-group"><label>Özellik Türü</label><select id="admin-attribute-type" class="form-control">
                    <option value="text">Metin</option><option value="number">Sayı</option>
                    <option value="boolean">Evet/Hayır</option><option value="option">Tek seçenek</option>
                    <option value="multi_option">Çoklu seçenek</option><option value="range">Aralık</option>
                </select></div>
                <div class="form-group"><label>Birim</label><input id="admin-attribute-unit" class="form-control" maxlength="40"></div>
                <div class="form-group"><label>Sıra</label><input id="admin-attribute-sort" type="number" class="form-control" value="0"></div>
                <div class="form-group"><label>Doğrulama Kuralları (JSON)</label><input id="admin-attribute-validation" class="form-control" value="{}" placeholder='{"min":0,"max":100}'></div>
                <label class="category-toggle"><input type="checkbox" id="admin-attribute-filterable"> Filtrede Göster</label>
                <label class="category-toggle"><input type="checkbox" id="admin-attribute-required"> Varsayılan Olarak Zorunlu</label>
                <label class="category-toggle"><input type="checkbox" id="admin-attribute-variant"> Varyantta Kullan</label>
                <label class="category-toggle"><input type="checkbox" id="admin-attribute-active" checked> Aktif</label>
                <div class="catalog-admin-actions span-2">
                    <button type="submit" class="btn-submit">Özelliği Kaydet</button>
                    <button type="button" class="btn-edit" data-attribute-action="cancel-attribute">Vazgeç</button>
                </div>
            </form>
            <form id="admin-template-form" class="catalog-admin-form" hidden>
                <input type="hidden" id="admin-template-id">
                <div class="form-group"><label>Şablon Adı</label><input id="admin-template-name" class="form-control" required></div>
                <div class="form-group"><label>Kategori</label><select id="admin-template-category" class="form-control" required></select></div>
                <div class="form-group"><label>Sıra</label><input id="admin-template-sort" type="number" class="form-control" value="0"></div>
                <label class="category-toggle"><input type="checkbox" id="admin-template-active" checked> Aktif</label>
                <div class="catalog-admin-actions span-2">
                    <button type="submit" class="btn-submit">Şablonu Kaydet</button>
                    <button type="button" class="btn-edit" data-attribute-action="cancel-template">Vazgeç</button>
                </div>
            </form>
            <div class="catalog-admin-grid" style="margin-top:16px">
                <section><h3>Özellikler</h3><div id="admin-attribute-list" class="catalog-admin-list"></div></section>
                <section><h3>Şablonlar</h3><div id="admin-template-list" class="catalog-admin-list"></div></section>
            </div>`;
    }

    function renderAttributes() {
        const target = document.getElementById('admin-attribute-list');
        target.innerHTML = state.attributes.map((attribute) => `
            <article class="catalog-admin-card${attribute.is_active ? '' : ' is-inactive'}">
                <div class="catalog-admin-card-head">
                    <div><strong>${escapeHtml(attribute.name)}</strong><div class="catalog-admin-meta">Sistem Kodu: ${escapeHtml(attribute.code)} · ${escapeHtml(attributeTypeLabel(attribute.type))}${attribute.unit ? ` · ${escapeHtml(attribute.unit)}` : ''}</div></div>
                    <span class="catalog-admin-badge">${attribute.is_filterable ? 'Filtre' : 'Ürün Bilgisi'}</span>
                </div>
                <div class="catalog-admin-meta">${attribute.is_required ? 'Zorunlu · ' : ''}${attribute.is_variant_relevant ? 'Varyantta Kullan · ' : ''}sıra ${Number(attribute.sort_order || 0)}</div>
                ${['option', 'multi_option'].includes(attribute.type) ? `
                    <form class="catalog-admin-actions" data-option-form="${Number(attribute.id)}" style="margin-top:9px">
                        <input class="form-control" name="value" placeholder="Sistem değeri" required>
                        <input class="form-control" name="label" placeholder="Görünen ad" required>
                        <button class="btn-edit" type="submit">Seçenek Ekle</button>
                    </form>
                    <div class="catalog-admin-meta">${(attribute.options || []).map((option) =>
                        `<button type="button" class="catalog-admin-badge" data-attribute-action="toggle-option" data-id="${Number(option.id)}" data-active="${option.is_active}">${escapeHtml(option.label)}${option.is_active ? '' : ' (pasif)'}</button>`
                    ).join(' ') || 'Henüz seçenek yok'}</div>` : ''}
                <div class="catalog-admin-actions" style="margin-top:9px">
                    <button class="btn-edit" data-attribute-action="edit-attribute" data-id="${Number(attribute.id)}">Düzenle</button>
                    <button class="btn-edit" data-attribute-action="archive-attribute" data-id="${Number(attribute.id)}">${attribute.is_active ? 'Pasifleştir' : 'Aktifleştir'}</button>
                </div>
            </article>`).join('') || '<div class="catalog-admin-warning">Henüz özellik yok.</div>';
    }

    function renderTemplates() {
        const target = document.getElementById('admin-template-list');
        target.innerHTML = state.templates.map((template) => `
            <article class="catalog-admin-card${template.is_active ? '' : ' is-inactive'}">
                <div class="catalog-admin-card-head">
                    <div><strong>${escapeHtml(template.name)}</strong><div class="catalog-admin-meta">${escapeHtml(template.category_name)} · sıra ${Number(template.sort_order || 0)}</div></div>
                    <button class="btn-edit" data-attribute-action="edit-template" data-id="${Number(template.id)}">Düzenle</button>
                </div>
                <form class="catalog-admin-form" data-template-link-form="${Number(template.id)}" style="margin-top:9px">
                    <select name="attribute_id" class="form-control" required><option value="">Özellik seçin</option>${attributeOptions()}</select>
                    <input name="sort_order" type="number" class="form-control" value="0" aria-label="Sıra">
                    <label class="category-toggle"><input name="is_required" type="checkbox"> Zorunlu</label>
                    <label class="category-toggle"><input name="is_filterable" type="checkbox"> Filtrede Göster</label>
                    <button class="btn-edit" type="submit">Bağla / Güncelle</button>
                </form>
                <div class="catalog-admin-list" style="margin-top:9px">
                    ${(template.attributes || []).map((attribute) => `<div class="catalog-admin-node">
                        <div><strong>${escapeHtml(attribute.name)}</strong><div class="catalog-admin-meta">Sistem Kodu: ${escapeHtml(attribute.code)} · ${escapeHtml(attributeTypeLabel(attribute.type))}${attribute.is_required ? ' · zorunlu' : ''}${attribute.is_filterable ? ' · filtrede göster' : ''}</div></div>
                        <button class="btn-edit" data-attribute-action="unlink-attribute" data-template-id="${Number(template.id)}" data-attribute-id="${Number(attribute.attribute_id)}">Kaldır</button>
                    </div>`).join('') || '<div class="catalog-admin-warning">Şablon henüz boş.</div>'}
                </div>
            </article>`).join('') || '<div class="catalog-admin-warning">Henüz şablon yok.</div>';
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
            [state.attributes, state.templates, state.categories] = await Promise.all([
                api('/api/admin/attributes', {}, 'Özellik listesi yüklenemedi.'),
                api('/api/admin/attribute-templates', {}, 'Şablon listesi yüklenemedi.'),
                api('/api/admin/categories?format=flat', {}, 'Kategoriler yüklenemedi.')
            ]);
            renderAttributes();
            renderTemplates();
        } catch (error) {
            showError(error);
        }
    }

    function openAttributeForm(attribute = null) {
        const form = document.getElementById('admin-attribute-form');
        form.hidden = false;
        document.getElementById('admin-attribute-id').value = attribute?.id || '';
        document.getElementById('admin-attribute-code').value = attribute?.code || '';
        document.getElementById('admin-attribute-name').value = attribute?.name || '';
        document.getElementById('admin-attribute-type').value = attribute?.type || 'text';
        document.getElementById('admin-attribute-unit').value = attribute?.unit || '';
        document.getElementById('admin-attribute-sort').value = Number(attribute?.sort_order || 0);
        document.getElementById('admin-attribute-validation').value = JSON.stringify(attribute?.validation_metadata || {});
        document.getElementById('admin-attribute-filterable').checked = attribute?.is_filterable === true;
        document.getElementById('admin-attribute-required').checked = attribute?.is_required === true;
        document.getElementById('admin-attribute-variant').checked = attribute?.is_variant_relevant === true;
        document.getElementById('admin-attribute-active').checked = attribute?.is_active !== false;
    }

    function openTemplateForm(template = null) {
        const form = document.getElementById('admin-template-form');
        form.hidden = false;
        document.getElementById('admin-template-id').value = template?.id || '';
        document.getElementById('admin-template-name').value = template?.name || '';
        document.getElementById('admin-template-category').innerHTML =
            `<option value="">Kategori seçin</option>${categoryOptions(template?.category_id)}`;
        document.getElementById('admin-template-sort').value = Number(template?.sort_order || 0);
        document.getElementById('admin-template-active').checked = template?.is_active !== false;
    }

    function jsonHeaders(payload) {
        return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
    }

    function bind() {
        root().addEventListener('submit', async (event) => {
            event.preventDefault();
            showError('');
            try {
                if (event.target.id === 'admin-attribute-form') {
                    const id = document.getElementById('admin-attribute-id').value;
                    const validation = document.getElementById('admin-attribute-validation').value;
                    JSON.parse(validation);
                    await api(id ? `/api/admin/attributes/${id}` : '/api/admin/attributes', {
                        method: id ? 'PATCH' : 'POST',
                        ...jsonHeaders({
                            code: document.getElementById('admin-attribute-code').value,
                            name: document.getElementById('admin-attribute-name').value,
                            type: document.getElementById('admin-attribute-type').value,
                            unit: document.getElementById('admin-attribute-unit').value,
                            sort_order: Number(document.getElementById('admin-attribute-sort').value) || 0,
                            validation_metadata: JSON.parse(validation),
                            is_filterable: document.getElementById('admin-attribute-filterable').checked,
                            is_required: document.getElementById('admin-attribute-required').checked,
                            is_variant_relevant: document.getElementById('admin-attribute-variant').checked,
                            is_active: document.getElementById('admin-attribute-active').checked
                        })
                    });
                    event.target.hidden = true;
                } else if (event.target.id === 'admin-template-form') {
                    const id = document.getElementById('admin-template-id').value;
                    await api(id ? `/api/admin/attribute-templates/${id}` : '/api/admin/attribute-templates', {
                        method: id ? 'PATCH' : 'POST',
                        ...jsonHeaders({
                            name: document.getElementById('admin-template-name').value,
                            category_id: Number(document.getElementById('admin-template-category').value),
                            sort_order: Number(document.getElementById('admin-template-sort').value) || 0,
                            is_active: document.getElementById('admin-template-active').checked
                        })
                    });
                    event.target.hidden = true;
                } else if (event.target.dataset.optionForm) {
                    const data = new FormData(event.target);
                    await api('/api/admin/attribute-options', {
                        method: 'POST',
                        ...jsonHeaders({
                            attribute_id: Number(event.target.dataset.optionForm),
                            value: data.get('value'),
                            label: data.get('label')
                        })
                    });
                } else if (event.target.dataset.templateLinkForm) {
                    const data = new FormData(event.target);
                    await api(`/api/admin/attribute-templates/${event.target.dataset.templateLinkForm}/attributes`, {
                        method: 'POST',
                        ...jsonHeaders({
                            attribute_id: Number(data.get('attribute_id')),
                            sort_order: Number(data.get('sort_order')) || 0,
                            is_required: data.get('is_required') === 'on',
                            is_filterable: data.get('is_filterable') === 'on'
                        })
                    });
                }
                await load();
            } catch (error) {
                showError(error instanceof SyntaxError ? new Error('Doğrulama kuralları alanı geçerli JSON olmalıdır.') : error);
            }
        });

        root().addEventListener('click', async (event) => {
            const button = event.target.closest('[data-attribute-action]');
            if (!button) return;
            const action = button.dataset.attributeAction;
            const id = Number(button.dataset.id);
            showError('');
            try {
                if (action === 'new-attribute') openAttributeForm();
                if (action === 'edit-attribute') openAttributeForm(findAttribute(id));
                if (action === 'cancel-attribute') document.getElementById('admin-attribute-form').hidden = true;
                if (action === 'new-template') openTemplateForm();
                if (action === 'edit-template') openTemplateForm(findTemplate(id));
                if (action === 'cancel-template') document.getElementById('admin-template-form').hidden = true;
                if (action === 'archive-attribute') {
                    const attribute = findAttribute(id);
                    await api(`/api/admin/attributes/${id}/archive`, {
                        method: 'PATCH',
                        ...jsonHeaders({ archived: attribute.is_active })
                    });
                    await load();
                }
                if (action === 'toggle-option') {
                    await api(`/api/admin/attribute-options/${id}/archive`, {
                        method: 'PATCH',
                        ...jsonHeaders({ archived: button.dataset.active === 'true' })
                    });
                    await load();
                }
                if (action === 'unlink-attribute') {
                    await api(`/api/admin/attribute-templates/${Number(button.dataset.templateId)}/attributes/${Number(button.dataset.attributeId)}`, {
                        method: 'DELETE'
                    });
                    await load();
                }
            } catch (error) {
                showError(error);
            }
        });
    }

    window.NovaStoreAdminAttributes = {
        load,
        _test: { escapeHtml, attributeTypeLabel }
    };
})(window, document);
