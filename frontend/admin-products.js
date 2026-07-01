(function adminProductCategoryModule(window, document) {
    'use strict';

    const state = {
        categories: [],
        byId: new Map(),
        leafIds: new Set(),
        selectedIds: [],
        primaryId: null,
        legacyWarning: ''
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
        setError('');
        render();
        return resolution;
    }

    function reset() {
        state.selectedIds = [];
        state.primaryId = null;
        state.legacyWarning = '';
        setError('');
        render();
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
            setError('Ürünler yalnızca leaf kategorilere atanabilir; parent kategori seçilemez.');
            return false;
        }
        setError('');
        if (!state.selectedIds.includes(id)) state.selectedIds.push(id);
        if (!state.primaryId) state.primaryId = id;
        render();
        return true;
    }

    function removeCategory(rawId) {
        const id = Number(rawId);
        state.selectedIds = state.selectedIds.filter((item) => item !== id);
        if (state.primaryId === id) state.primaryId = state.selectedIds[0] || null;
        render();
    }

    function setPrimary(rawId) {
        const id = Number(rawId);
        if (!state.selectedIds.includes(id)) {
            setError('Primary kategori, seçili kategoriler içinde olmalıdır.');
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
        const options = ['<option value="">Leaf kategori ekleyin</option>'];
        state.categories.forEach((category) => {
            if (category.deleted_at || state.selectedIds.includes(Number(category.id))) return;
            const isLeaf = state.leafIds.has(Number(category.id));
            options.push(
                `<option value="${Number(category.id)}"${isLeaf ? '' : ' disabled'}>` +
                `${escapeHtml(categoryLabel(category))}${isLeaf ? '' : ' · parent'}</option>`
            );
        });
        select.innerHTML = options.join('');
        select.value = '';
    }

    function renderChips() {
        const container = document.getElementById('selected-product-categories');
        if (!container) return;
        if (!state.selectedIds.length) {
            container.innerHTML = '<span class="selected-category-empty">Henüz leaf kategori eklenmedi.</span>';
            return;
        }
        container.innerHTML = state.selectedIds.map((id) => {
            const category = state.byId.get(id);
            const primary = id === state.primaryId ? '<strong class="primary-category-mark">Primary</strong>' : '';
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
        const options = ['<option value="">Primary kategori seçin</option>'];
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

    function getSubmission(publicationStatus) {
        const status = String(publicationStatus || 'active').trim().toLowerCase();
        if (state.selectedIds.length === 0) {
            if (status === 'active') {
                const message = 'Aktif ürün için en az bir leaf kategori ve primary kategori zorunludur.';
                setError(message);
                throw new Error(message);
            }
            return { hasAssignment: false, categoryIds: [], primaryCategoryId: null, categoryNames: [] };
        }
        if (!state.primaryId || !state.selectedIds.includes(state.primaryId)) {
            const message = 'Primary kategori, seçili categoryIds içinde olmalıdır.';
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
            `${escapeHtml(category.name)}${category.primary ? ' · Primary' : ''}</span>`
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
