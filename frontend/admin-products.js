(function adminProductCategoryModule(window, document) {
    'use strict';

    const state = {
        categories: [],
        byId: new Map(),
        leafIds: new Set(),
        selectedIds: [],
        primaryId: null,
        legacyWarning: '',
        attributeDefinitions: [],
        productAttributeValues: new Map(),
        attributeLoadToken: 0
    };

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeName(value) {
        return String(value || '').trim().toLocaleLowerCase('tr-TR');
    }

    function parseIds(value) {
        let values = value;
        if (typeof values === 'string') {
            try {
                values = JSON.parse(values);
            } catch (_) {
                values = values.split(',');
            }
        }
        if (!Array.isArray(values)) values = values === undefined || values === null ? [] : [values];
        return [...new Set(values.map(Number).filter(Number.isInteger))];
    }

    function legacyNames(product = {}) {
        const values = Array.isArray(product.categories) && product.categories.length
            ? product.categories
            : [product.category];
        const seen = new Set();
        return values
            .map((value) => String(value || '').trim())
            .filter((value) => {
                const key = normalizeName(value);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function rebuildIndex() {
        state.byId = new Map(state.categories.map((category) => [Number(category.id), category]));
        const parentIds = new Set(
            state.categories
                .filter((category) => !category.deleted_at && category.parent_id !== null)
                .map((category) => Number(category.parent_id))
        );
        state.leafIds = new Set(
            state.categories
                .filter((category) => !category.deleted_at && !parentIds.has(Number(category.id)))
                .map((category) => Number(category.id))
        );
    }

    function setCategories(categories) {
        state.categories = Array.isArray(categories) ? categories.map((category) => ({ ...category })) : [];
        rebuildIndex();
        state.selectedIds = state.selectedIds.filter((id) => state.leafIds.has(id));
        if (!state.selectedIds.includes(state.primaryId)) state.primaryId = state.selectedIds[0] || null;
        render();
    }

    function setText(id, message) {
        const target = document.getElementById(id);
        if (!target) return;
        target.textContent = message || '';
        target.hidden = !message;
    }

    function setError(message) {
        setText('product-category-error', message);
    }

    function resolveProductSelection(product = {}) {
        const warnings = [];
        const explicitIds = parseIds(product.categoryIds ?? product.category_ids);
        const selectedIds = [];
        let primaryId = Number(product.primaryCategoryId ?? product.primary_category_id);

        if (explicitIds.length > 0) {
            explicitIds.forEach((id) => {
                if (state.leafIds.has(id)) selectedIds.push(id);
                else warnings.push(`Kategori #${id} artık seçilebilir bir leaf kategori değil.`);
            });
            if (!selectedIds.includes(primaryId)) {
                if (Number.isInteger(primaryId)) warnings.push('Kayıtlı primary kategori seçili kategoriler içinde değil.');
                primaryId = selectedIds[0] || null;
            }
        } else {
            const allByName = new Map();
            state.categories
                .filter((category) => !category.deleted_at)
                .forEach((category) => {
                    const key = normalizeName(category.name);
                    if (!allByName.has(key)) allByName.set(key, []);
                    allByName.get(key).push(category);
                });

            legacyNames(product).forEach((name) => {
                const candidates = allByName.get(normalizeName(name)) || [];
                const leafCandidates = candidates.filter((category) => state.leafIds.has(Number(category.id)));
                if (leafCandidates.length === 1) {
                    const id = Number(leafCandidates[0].id);
                    if (!selectedIds.includes(id)) selectedIds.push(id);
                } else if (leafCandidates.length > 1) {
                    warnings.push(`“${name}” birden fazla leaf kategoriyle eşleşiyor; manuel seçim gerekli.`);
                } else if (candidates.length > 0) {
                    warnings.push(`“${name}” bir parent kategori; manuel leaf seçimi gerekli.`);
                } else {
                    warnings.push(`“${name}” için v2 eşleşmesi bulunamadı; manuel seçim gerekli.`);
                }
            });
            primaryId = selectedIds[0] || null;
        }

        return { selectedIds, primaryId, warnings };
    }

    function loadProduct(product = {}) {
        const resolution = resolveProductSelection(product);
        state.selectedIds = resolution.selectedIds;
        state.primaryId = resolution.primaryId;
        state.legacyWarning = resolution.warnings.join(' ');
        state.productAttributeValues = new Map(
            (Array.isArray(product.attributes) ? product.attributes : [])
                .map((attribute) => [String(attribute.code), attribute.value])
        );
        setError('');
        render();
        refreshAttributeFields();
        return resolution;
    }

    function reset() {
        state.selectedIds = [];
        state.primaryId = null;
        state.legacyWarning = '';
        state.attributeDefinitions = [];
        state.productAttributeValues = new Map();
        setError('');
        setText('product-attributes-error', '');
        render();
        renderAttributeFields();
    }

    function selectCategory(rawId) {
        const id = Number(rawId);
        if (!Number.isInteger(id)) return false;
        const category = state.byId.get(id);
        if (!category || category.deleted_at) {
            setError('Seçilen kategori mevcut değil veya arşivlenmiş.');
            return false;
        }
        if (!state.leafIds.has(id)) {
            setError('Ürünler yalnızca ürün atanabilir son kategorilere atanabilir; üst kategori seçilemez.');
            return false;
        }
        setError('');
        if (!state.selectedIds.includes(id)) state.selectedIds.push(id);
        if (!state.primaryId) state.primaryId = id;
        render();
        refreshAttributeFields();
        return true;
    }

    function removeCategory(rawId) {
        const id = Number(rawId);
        state.selectedIds = state.selectedIds.filter((item) => item !== id);
        if (state.primaryId === id) state.primaryId = state.selectedIds[0] || null;
        render();
        refreshAttributeFields();
    }

    function setPrimary(rawId) {
        const id = Number(rawId);
        if (!state.selectedIds.includes(id)) {
            setError('Ana ürün kategorisi, seçili kategoriler içinde olmalıdır.');
            return false;
        }
        state.primaryId = id;
        setError('');
        render();
        return true;
    }

    function categoryLabel(category) {
        const prefix = '— '.repeat(Math.max(0, Number(category.depth || 0)));
        const suffix = category.is_active === false || category.is_customer_visible === false
            ? ' (pasif/gizli)'
            : '';
        return `${prefix}${category.name}${suffix}`;
    }

    function renderCategorySelect() {
        const select = document.getElementById('prod-category');
        if (!select) return;
        const options = ['<option value="">Ürün atanabilir son kategori ekleyin</option>'];
        state.categories.forEach((category) => {
            if (category.deleted_at || state.selectedIds.includes(Number(category.id))) return;
            const isLeaf = state.leafIds.has(Number(category.id));
            options.push(
                `<option value="${Number(category.id)}"${isLeaf ? '' : ' disabled'}>` +
                `${escapeHtml(categoryLabel(category))}${isLeaf ? '' : ' · üst kategori'}</option>`
            );
        });
        select.innerHTML = options.join('');
        select.value = '';
    }

    function renderChips() {
        const container = document.getElementById('selected-product-categories');
        if (!container) return;
        if (!state.selectedIds.length) {
            container.innerHTML = '<span class="selected-category-empty">Henüz ürün atanabilir son kategori eklenmedi.</span>';
            return;
        }
        container.innerHTML = state.selectedIds.map((id) => {
            const category = state.byId.get(id);
            const primary = id === state.primaryId ? '<strong class="primary-category-mark">Ana Ürün Kategorisi</strong>' : '';
            return `<span class="selected-category-chip">
                <span>${escapeHtml(category?.name || `Kategori #${id}`)}</span>
                ${primary}
                <button type="button" class="selected-category-remove"
                    onclick="NovaStoreAdminProducts.removeCategory(${id})"
                    aria-label="Kategoriyi kaldır">&times;</button>
            </span>`;
        }).join('');
    }

    function renderPrimarySelect() {
        const select = document.getElementById('prod-primary-category');
        if (!select) return;
        const options = ['<option value="">Ana ürün kategorisi seçin</option>'];
        state.selectedIds.forEach((id) => {
            const category = state.byId.get(id);
            options.push(
                `<option value="${id}"${id === state.primaryId ? ' selected' : ''}>` +
                `${escapeHtml(category?.name || `Kategori #${id}`)}</option>`
            );
        });
        select.innerHTML = options.join('');
        select.value = state.primaryId ? String(state.primaryId) : '';
    }

    function render() {
        renderCategorySelect();
        renderChips();
        renderPrimarySelect();
        setText('product-category-warning', state.legacyWarning);
    }

    function attributeValue(code) {
        return state.productAttributeValues.get(String(code));
    }

    function renderAttributeInput(definition) {
        const code = definition.code;
        const value = attributeValue(code);
        const required = definition.effective_required ? ' <strong aria-label="zorunlu">*</strong>' : '';
        const unit = definition.unit ? ` <small>${escapeHtml(definition.unit)}</small>` : '';
        let input = '';
        if (definition.type === 'text') {
            input = `<input class="form-control" data-attribute-code="${code}" data-attribute-type="text" value="${escapeHtml(value ?? '')}">`;
        } else if (definition.type === 'number') {
            input = `<input type="number" step="any" class="form-control" data-attribute-code="${code}" data-attribute-type="number" value="${escapeHtml(value ?? '')}">`;
        } else if (definition.type === 'boolean') {
            input = `<select class="form-control" data-attribute-code="${code}" data-attribute-type="boolean">
                <option value="">Seçin</option><option value="true"${value === true ? ' selected' : ''}>Evet</option>
                <option value="false"${value === false ? ' selected' : ''}>Hayır</option></select>`;
        } else if (definition.type === 'option') {
            const selectedId = Number(value?.id ?? value);
            input = `<select class="form-control" data-attribute-code="${code}" data-attribute-type="option">
                <option value="">Seçin</option>${(definition.options || []).map((option) =>
                    `<option value="${Number(option.id)}"${selectedId === Number(option.id) ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
                ).join('')}</select>`;
        } else if (definition.type === 'multi_option') {
            const selectedIds = new Set((Array.isArray(value) ? value : []).map((item) => Number(item?.id ?? item)));
            input = `<div class="category-toggle-grid" data-attribute-code="${code}" data-attribute-type="multi_option">
                ${(definition.options || []).map((option) => `<label class="category-toggle">
                    <input type="checkbox" value="${Number(option.id)}"${selectedIds.has(Number(option.id)) ? ' checked' : ''}>
                    ${escapeHtml(option.label)}
                </label>`).join('') || '<small>Aktif seçenek bulunmuyor.</small>'}
            </div>`;
        } else if (definition.type === 'range') {
            input = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" data-attribute-code="${code}" data-attribute-type="range">
                <input type="number" step="any" class="form-control" data-range-part="min" placeholder="En az" value="${escapeHtml(value?.min ?? '')}">
                <input type="number" step="any" class="form-control" data-range-part="max" placeholder="En fazla" value="${escapeHtml(value?.max ?? '')}">
            </div>`;
        }
        return `<div class="form-group"><label>${escapeHtml(definition.name)}${required}${unit}</label>${input}</div>`;
    }

    function renderAttributeFields() {
        const container = document.getElementById('product-attributes-fields');
        if (!container) return;
        if (!state.selectedIds.length) {
            container.innerHTML = '<p class="catalog-admin-empty">Özellik alanları seçilen ürün atanabilir son kategorilere göre yüklenir.</p>';
            return;
        }
        if (!state.attributeDefinitions.length) {
            container.innerHTML = '<p class="catalog-admin-empty">Seçilen kategoriler için aktif özellik / filtre şablonu bulunmuyor.</p>';
            return;
        }
        container.innerHTML = `<div class="catalog-admin-form">${state.attributeDefinitions.map(renderAttributeInput).join('')}</div>`;
    }

    async function refreshAttributeFields() {
        const container = document.getElementById('product-attributes-fields');
        if (!container) return;
        const token = ++state.attributeLoadToken;
        setText('product-attributes-error', '');
        if (!state.selectedIds.length) {
            state.attributeDefinitions = [];
            renderAttributeFields();
            return;
        }
        container.innerHTML = '<p class="catalog-admin-empty">Kategori özellikleri yükleniyor…</p>';
        try {
            const response = await adminApiFetch(
                `/api/admin/attribute-templates/resolve?categoryIds=${encodeURIComponent(JSON.stringify(state.selectedIds))}`
            );
            const payload = await adminReadJson(response, 'Kategori özellikleri yüklenemedi.');
            if (token !== state.attributeLoadToken) return;
            state.attributeDefinitions = Array.isArray(payload.attributes) ? payload.attributes : [];
            renderAttributeFields();
        } catch (error) {
            if (token !== state.attributeLoadToken) return;
            state.attributeDefinitions = [];
            renderAttributeFields();
            setText('product-attributes-error', error.message || 'Kategori özellikleri yüklenemedi.');
        }
    }

    function getAttributeSubmission(publicationStatus) {
        const values = {};
        for (const definition of state.attributeDefinitions) {
            const code = definition.code;
            const element = document.querySelector(`[data-attribute-code="${code}"]`);
            let value = null;
            if (!element) continue;
            if (definition.type === 'multi_option') {
                value = [...element.querySelectorAll('input:checked')].map((input) => Number(input.value));
            } else if (definition.type === 'range') {
                const min = element.querySelector('[data-range-part="min"]').value;
                const max = element.querySelector('[data-range-part="max"]').value;
                value = min === '' && max === '' ? null : { min, max };
            } else if (definition.type === 'boolean') {
                value = element.value === '' ? null : element.value === 'true';
            } else if (definition.type === 'number') {
                value = element.value === '' ? null : Number(element.value);
            } else if (definition.type === 'option') {
                value = element.value === '' ? null : Number(element.value);
            } else {
                value = element.value.trim() || null;
            }
            const empty = value === null || value === '' || (Array.isArray(value) && value.length === 0);
            if (String(publicationStatus).toLowerCase() === 'active' && definition.effective_required && empty) {
                const message = `Aktif ürün için ${definition.name} zorunludur.`;
                setText('product-attributes-error', message);
                throw new Error(message);
            }
            values[code] = value;
        }
        setText('product-attributes-error', '');
        return values;
    }

    function getSubmission(publicationStatus) {
        const status = String(publicationStatus || 'active').trim().toLowerCase();
        if (state.selectedIds.length === 0) {
            if (status === 'active') {
                const message = 'Aktif ürün için en az bir ürün atanabilir son kategori ve ana ürün kategorisi zorunludur.';
                setError(message);
                throw new Error(message);
            }
            return { hasAssignment: false, categoryIds: [], primaryCategoryId: null, categoryNames: [] };
        }
        if (!state.primaryId || !state.selectedIds.includes(state.primaryId)) {
            const message = 'Ana ürün kategorisi, seçili kategoriler içinde olmalıdır.';
            setError(message);
            throw new Error(message);
        }
        const orderedIds = [
            state.primaryId,
            ...state.selectedIds.filter((id) => id !== state.primaryId)
        ];
        setError('');
        return {
            hasAssignment: true,
            categoryIds: orderedIds,
            primaryCategoryId: state.primaryId,
            categoryNames: orderedIds.map((id) => state.byId.get(id)?.name).filter(Boolean)
        };
    }

    function productCategoryNames(product = {}) {
        const ids = parseIds(product.categoryIds ?? product.category_ids);
        if (ids.length) {
            return ids.map((id) => ({
                id,
                name: state.byId.get(id)?.name || `Kategori #${id}`,
                primary: id === Number(product.primaryCategoryId ?? product.primary_category_id)
            }));
        }
        return legacyNames(product).map((name, index) => ({ id: null, name, primary: index === 0 }));
    }

    function renderProductBadges(product = {}) {
        const categories = productCategoryNames(product);
        if (!categories.length) return '<span class="cat-badge">Manuel seçim gerekli</span>';
        return categories.map((category) =>
            `<span class="cat-badge${category.primary ? ' is-primary' : ''}">` +
            `${escapeHtml(category.name)}${category.primary ? ' · Ana Ürün Kategorisi' : ''}</span>`
        ).join(' ');
    }

    window.NovaStoreAdminProducts = {
        setCategories,
        loadProduct,
        reset,
        selectCategory,
        removeCategory,
        setPrimary,
        getSubmission,
        getAttributeSubmission,
        refreshAttributeFields,
        renderProductBadges,
        _test: {
            escapeHtml,
            parseIds,
            legacyNames,
            resolveProductSelection,
            productCategoryNames,
            getState: () => ({
                selectedIds: [...state.selectedIds],
                primaryId: state.primaryId,
                leafIds: [...state.leafIds],
                legacyWarning: state.legacyWarning
            })
        }
    };
})(window, document);
