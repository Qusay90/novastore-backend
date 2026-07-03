(function catalogNavigationModule(window, document) {
    'use strict';

    let categoryTreePromise = null;
    let publicNavigationPromise = null;

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function safeUrl(value, fallback = '') {
        const raw = String(value || '').trim();
        if (!raw) return fallback;
        if (/^(https?:\/\/|\/(?!\/))/i.test(raw)) return raw;
        if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith('//')) return raw;
        return fallback;
    }

    function safeAccentColor(value) {
        const color = String(value || '').trim();
        return /^#[0-9a-f]{3,8}$/i.test(color) ? color : '';
    }

    function flattenTree(nodes, result = []) {
        for (const category of Array.isArray(nodes) ? nodes : []) {
            result.push(category);
            flattenTree(category.children, result);
        }
        return result;
    }

    function categoryUrl(category) {
        return `/kategori/${encodeURIComponent(String(category?.slug || ''))}`;
    }

    function categorySlugFromPath(pathname) {
        const match = String(pathname || '').match(/^\/(?:kategori|category)\/([^/?#]+)\/?$/i);
        if (!match) return null;
        try {
            return decodeURIComponent(match[1]);
        } catch (_) {
            return match[1];
        }
    }

    function replaceWithCanonicalPath(category, locationLike = window.location) {
        if (!category?.slug || !window.history?.replaceState) return;
        const path = categoryUrl(category);
        if (String(locationLike.pathname || '').toLocaleLowerCase('tr-TR') === path.toLocaleLowerCase('tr-TR') &&
            !locationLike.search) return;
        window.history.replaceState({}, '', `${path}${locationLike.hash || ''}`);
    }

    function updateCategoryMetadata(category) {
        if (!category?.slug) return;
        let canonical = document.querySelector('link[rel="canonical"]');
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.rel = 'canonical';
            document.head.appendChild(canonical);
        }
        canonical.href = new URL(categoryUrl(category), window.location.origin).href;

        let description = document.querySelector('meta[name="description"]');
        if (!description) {
            description = document.createElement('meta');
            description.name = 'description';
            document.head.appendChild(description);
        }
        description.content = String(category.seo_description || category.description || '').trim();
        document.title = `${category.seo_title || category.name} | NovaStore`;
    }

    async function readJson(response, fallbackMessage) {
        let body = {};
        try {
            body = await response.json();
        } catch (_) {
            body = {};
        }
        if (!response.ok) {
            const error = new Error(body.error || fallbackMessage);
            error.status = response.status;
            error.code = body.code;
            throw error;
        }
        return body;
    }

    async function fetchCategoryTree({ force = false } = {}) {
        if (force || !categoryTreePromise) {
            categoryTreePromise = fetch('/api/public/categories')
                .then((response) => readJson(response, 'Kategoriler yüklenemedi.'))
                .catch((error) => {
                    categoryTreePromise = null;
                    throw error;
                });
        }
        return categoryTreePromise;
    }

    async function fetchPublicNavigation(code = 'main', { force = false } = {}) {
        if (force || !publicNavigationPromise) {
            publicNavigationPromise = fetch(`/api/public/navigation/${encodeURIComponent(code)}`)
                .then((response) => readJson(response, 'Navigasyon yüklenemedi.'))
                .catch((error) => {
                    publicNavigationPromise = null;
                    throw error;
                });
        }
        return publicNavigationPromise;
    }

    function renderTreeItems(categories, level = 0) {
        return (Array.isArray(categories) ? categories : []).map((category) => {
            const children = Array.isArray(category.children) ? category.children : [];
            const hasChildren = children.length > 0;
            return `
                <li class="catalog-nav-item level-${level}${hasChildren ? ' has-children' : ''}">
                    <div class="catalog-nav-row">
                        <a class="catalog-nav-link" href="${escapeHtml(categoryUrl(category))}">
                            ${escapeHtml(category.icon || '')}
                            <span>${escapeHtml(category.name)}</span>
                        </a>
                        ${hasChildren ? `
                            <button type="button" class="catalog-nav-toggle"
                                aria-expanded="false"
                                aria-label="${escapeHtml(category.name)} alt kategorilerini aç">
                                <span aria-hidden="true">⌄</span>
                            </button>` : ''}
                    </div>
                    ${hasChildren ? `<ul class="catalog-nav-children">${renderTreeItems(children, level + 1)}</ul>` : ''}
                </li>`;
        }).join('');
    }

    function navigationItemUrl(item) {
        const targetUrl = safeUrl(item?.target?.url);
        return targetUrl && targetUrl.startsWith('/') && !targetUrl.startsWith('//') ? targetUrl : '';
    }

    function renderNavigationItems(items, level = 0) {
        return (Array.isArray(items) ? items : []).map((item) => {
            const children = Array.isArray(item.children) ? item.children : [];
            const hasChildren = children.length > 0;
            const url = navigationItemUrl(item);
            const label = `${escapeHtml(item.icon || '')}<span>${escapeHtml(item.title || '')}</span>`;
            return `
                <li class="catalog-nav-item level-${level}${hasChildren ? ' has-children' : ''}">
                    <div class="catalog-nav-row">
                        ${url
                            ? `<a class="catalog-nav-link" href="${escapeHtml(url)}">${label}</a>`
                            : `<span class="catalog-nav-link catalog-nav-group">${label}</span>`}
                        ${hasChildren ? `
                            <button type="button" class="catalog-nav-toggle"
                                aria-expanded="false"
                                aria-label="${escapeHtml(item.title || '')} alt menüsünü aç">
                                <span aria-hidden="true">⌄</span>
                            </button>` : ''}
                    </div>
                    ${hasChildren ? `<ul class="catalog-nav-children">${renderNavigationItems(children, level + 1)}</ul>` : ''}
                </li>`;
        }).join('');
    }

    function bindMenu(menu) {
        menu.querySelectorAll('.catalog-nav-toggle').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const item = button.closest('.catalog-nav-item');
                const open = !item.classList.contains('is-open');
                if (item.parentElement === menu) {
                    menu.querySelectorAll(':scope > .catalog-nav-item.is-open').forEach((other) => {
                        if (other !== item) {
                            other.classList.remove('is-open');
                            other.querySelector(':scope > .catalog-nav-row .catalog-nav-toggle')
                                ?.setAttribute('aria-expanded', 'false');
                        }
                    });
                }
                item.classList.toggle('is-open', open);
                button.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        });

        document.addEventListener('click', (event) => {
            if (menu.contains(event.target)) return;
            menu.querySelectorAll('.catalog-nav-item.is-open').forEach((item) => item.classList.remove('is-open'));
            menu.querySelectorAll('.catalog-nav-toggle[aria-expanded="true"]')
                .forEach((button) => button.setAttribute('aria-expanded', 'false'));
        });
    }

    async function mountMenu({ menuId = 'category-menu' } = {}) {
        const menu = document.getElementById(menuId);
        if (!menu) return [];
        menu.classList.add('catalog-nav-menu');
        menu.innerHTML = '<li class="catalog-nav-loading">Kategoriler yükleniyor…</li>';
        try {
            let navigation = null;
            try {
                navigation = await fetchPublicNavigation('main');
            } catch (_) {
                navigation = null;
            }
            if (Array.isArray(navigation?.items) && navigation.items.length > 0) {
                menu.innerHTML = renderNavigationItems(navigation.items);
                bindMenu(menu);
                return navigation.items;
            }
            const tree = await fetchCategoryTree();
            if (!Array.isArray(tree) || tree.length === 0) {
                menu.innerHTML = '<li class="catalog-nav-fallback"><a href="/categories.html">Kategoriler</a></li>';
                return [];
            }
            menu.innerHTML = renderTreeItems(tree);
            bindMenu(menu);
            return tree;
        } catch (error) {
            console.error('Public kategori navigasyonu yüklenemedi:', error);
            menu.innerHTML = '<li class="catalog-nav-fallback"><a href="/categories.html">Kategorilere göz at</a></li>';
            return [];
        }
    }

    async function resolveCategoryFromLocation(locationLike = window.location, { replaceHistory = true } = {}) {
        const params = new URLSearchParams(locationLike.search || '');
        const pathSlug = categorySlugFromPath(locationLike.pathname);
        const canonicalSlug = pathSlug || params.get('categorySlug') || params.get('slug');
        const legacyName = params.get('category');
        const tree = await fetchCategoryTree();
        const flat = flattenTree(tree);

        if (canonicalSlug) {
            const category = flat.find((item) =>
                String(item.slug || '').toLocaleLowerCase('tr-TR') ===
                String(canonicalSlug).toLocaleLowerCase('tr-TR')
            );
            if (category) {
                if (replaceHistory && (!pathSlug || locationLike.pathname?.startsWith('/category/'))) {
                    replaceWithCanonicalPath(category, locationLike);
                }
                return { category, legacy: false, error: null };
            }
            try {
                const detail = await fetchCategoryDetail(canonicalSlug);
                if (replaceHistory) replaceWithCanonicalPath(detail.category, locationLike);
                return { category: detail.category, legacy: true, error: null };
            } catch (_) {
                return { category: null, legacy: false, error: 'Kategori bulunamadı veya yayında değil.' };
            }
        }

        if (!legacyName) return { category: null, legacy: false, error: null };
        const normalized = String(legacyName).trim().toLocaleLowerCase('tr-TR');
        const matches = flat.filter((item) =>
            String(item.name || '').trim().toLocaleLowerCase('tr-TR') === normalized
        );
        if (matches.length !== 1) {
            return {
                category: null,
                legacy: true,
                error: matches.length > 1
                    ? 'Eski kategori bağlantısı birden fazla kategoriyle eşleşiyor.'
                    : 'Eski kategori bağlantısı artık geçerli değil.'
            };
        }

        if (replaceHistory) replaceWithCanonicalPath(matches[0], locationLike);
        return { category: matches[0], legacy: true, error: null };
    }

    async function fetchCategoryDetail(slug) {
        const response = await fetch(`/api/public/categories/${encodeURIComponent(slug)}`);
        return readJson(response, 'Kategori bulunamadı veya yayında değil.');
    }

    function renderBreadcrumb(items) {
        return `<nav class="catalog-breadcrumb" aria-label="Kategori yolu">
            <a href="/index.html">Ana Sayfa</a>
            ${(Array.isArray(items) ? items : []).map((item, index, all) =>
                `${index < all.length ? '<span aria-hidden="true">›</span>' : ''}` +
                `<a href="${escapeHtml(categoryUrl(item))}"${index === all.length - 1 ? ' aria-current="page"' : ''}>` +
                `${escapeHtml(item.name)}</a>`
            ).join('')}
        </nav>`;
    }

    function renderCategoryCards(categories) {
        if (!Array.isArray(categories) || categories.length === 0) return '';
        return `<section class="catalog-child-section">
            <h2>Alt Kategoriler</h2>
            <div class="catalog-child-grid">
                ${categories.map((category) => `
                    <a class="catalog-child-card" href="${escapeHtml(categoryUrl(category))}">
                        ${safeUrl(category.image_url) ? `<img src="${escapeHtml(safeUrl(category.image_url))}" alt="">` : ''}
                        <strong>${escapeHtml(category.name)}</strong>
                        <span>${escapeHtml(category.description || 'Ürünleri görüntüle')}</span>
                    </a>`).join('')}
            </div>
        </section>`;
    }

    function renderCategoryProducts(products) {
        if (!Array.isArray(products) || products.length === 0) {
            return '<div class="catalog-empty-state">Bu kategoride gösterilebilir ürün bulunamadı.</div>';
        }
        return `<section class="catalog-page-products">
            <h2>Ürünler</h2>
            <div class="catalog-product-grid">
                ${products.map((product) => {
                    const soldOut = Number(product.stock || 0) <= 0;
                    const image = safeUrl(product.image_url, 'https://via.placeholder.com/320?text=NovaStore');
                    return `<article class="catalog-product-card${soldOut ? ' is-sold-out' : ''}">
                        <a href="/product.html?id=${Number(product.id)}">
                            <div class="catalog-product-image">
                                <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}">
                                ${soldOut ? '<span class="catalog-sold-out-badge">Stokta Yok</span>' : ''}
                            </div>
                            <strong>${escapeHtml(product.name)}</strong>
                        </a>
                        <span class="catalog-product-price">${escapeHtml(product.price)} TL</span>
                        ${soldOut
                            ? '<button type="button" disabled>Stokta Yok</button>'
                            : `<a class="catalog-product-action" href="/product.html?id=${Number(product.id)}">Detayları Gör</a>`}
                    </article>`;
                }).join('')}
            </div>
        </section>`;
    }

    function renderCategoryFilters(filters) {
        if (!Array.isArray(filters) || filters.length === 0) return '';
        return `<aside class="catalog-filter-panel" aria-label="Ürün filtreleri">
            <div class="catalog-filter-head"><h2>Filtreler</h2><button type="button" data-filter-reset>Temizle</button></div>
            <form id="catalog-attribute-filters">
                ${filters.map((filter) => {
                    if (['number', 'range'].includes(filter.type)) {
                        return `<fieldset class="catalog-filter-group" data-filter-code="${escapeHtml(filter.code)}" data-filter-type="${escapeHtml(filter.type)}">
                            <legend>${escapeHtml(filter.name)}${filter.unit ? ` (${escapeHtml(filter.unit)})` : ''}</legend>
                            <div class="catalog-filter-range">
                                <input type="number" step="any" data-filter-min placeholder="En az ${escapeHtml(filter.min ?? '')}">
                                <input type="number" step="any" data-filter-max placeholder="En fazla ${escapeHtml(filter.max ?? '')}">
                            </div>
                        </fieldset>`;
                    }
                    if (filter.type === 'boolean') {
                        return `<fieldset class="catalog-filter-group" data-filter-code="${escapeHtml(filter.code)}" data-filter-type="boolean">
                            <legend>${escapeHtml(filter.name)}</legend>
                            <select data-filter-boolean><option value="">Tümü</option>
                                ${(filter.options || []).map((option) => `<option value="${option.value ? 'true' : 'false'}">${escapeHtml(option.label)}</option>`).join('')}
                            </select>
                        </fieldset>`;
                    }
                    return `<fieldset class="catalog-filter-group" data-filter-code="${escapeHtml(filter.code)}" data-filter-type="${escapeHtml(filter.type)}">
                        <legend>${escapeHtml(filter.name)}</legend>
                        ${(filter.options || []).map((option) => `<label>
                            <input type="checkbox" value="${escapeHtml(option.value ?? option.id)}">
                            <span>${escapeHtml(option.label)}</span>
                        </label>`).join('')}
                    </fieldset>`;
                }).join('')}
            </form>
        </aside>`;
    }

    function collectCategoryFilters(form) {
        const values = {};
        if (!form) return values;
        form.querySelectorAll('[data-filter-code]').forEach((group) => {
            const code = group.dataset.filterCode;
            const type = group.dataset.filterType;
            if (['number', 'range'].includes(type)) {
                const min = group.querySelector('[data-filter-min]').value;
                const max = group.querySelector('[data-filter-max]').value;
                if (min !== '' || max !== '') values[code] = { min, max };
            } else if (type === 'boolean') {
                const selected = group.querySelector('[data-filter-boolean]').value;
                if (selected !== '') values[code] = selected === 'true';
            } else {
                const selected = [...group.querySelectorAll('input:checked')].map((input) => input.value);
                if (selected.length) values[code] = selected;
            }
        });
        return values;
    }

    function bindCategoryFilters(container, category) {
        const form = container.querySelector('#catalog-attribute-filters');
        if (!form) return;
        const refresh = async () => {
            const filters = collectCategoryFilters(form);
            const current = container.querySelector('.catalog-page-products, .catalog-empty-state');
            if (current) current.classList.add('is-loading');
            try {
                const url = `/api/products?categorySlug=${encodeURIComponent(category.slug)}&attributes=${encodeURIComponent(JSON.stringify(filters))}`;
                const response = await fetch(url);
                const products = await readJson(response, 'Filtrelenmiş ürünler yüklenemedi.');
                const replacement = document.createElement('div');
                replacement.innerHTML = renderCategoryProducts(products);
                const next = replacement.firstElementChild;
                const target = container.querySelector('.catalog-page-products, .catalog-empty-state');
                if (target && next) target.replaceWith(next);
            } catch (error) {
                const target = container.querySelector('.catalog-page-products, .catalog-empty-state');
                if (target) target.outerHTML = `<div class="catalog-error-state">${escapeHtml(error.message || 'Filtre uygulanamadı.')}</div>`;
            }
        };
        form.addEventListener('change', refresh);
        container.querySelector('[data-filter-reset]')?.addEventListener('click', () => {
            form.reset();
            refresh();
        });
    }

    async function loadCategoryPage({ containerId = 'native-categories-list' } = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '<div class="catalog-page-loading">Kategoriler yükleniyor…</div>';

        try {
            const resolution = await resolveCategoryFromLocation(window.location);
            if (resolution.error) {
                container.innerHTML = `<div class="catalog-error-state">${escapeHtml(resolution.error)} <a href="/categories.html">Tüm kategoriler</a></div>`;
                return;
            }
            if (!resolution.category) {
                const tree = await fetchCategoryTree();
                container.innerHTML = `
                    <header class="catalog-directory-header"><h1>Kategoriler</h1><p>Görünür ürün bulunan kategorileri keşfedin.</p></header>
                    ${renderCategoryCards(tree)}`;
                return;
            }

            const detail = await fetchCategoryDetail(resolution.category.slug);
            const category = detail.category;
            const productsResponse = await fetch(`/api/products?categorySlug=${encodeURIComponent(category.slug)}`);
            const filtersResponse = await fetch(`/api/public/categories/${encodeURIComponent(category.slug)}/filters`);
            const products = await readJson(productsResponse, 'Kategori ürünleri yüklenemedi.');
            const filterPayload = await readJson(filtersResponse, 'Kategori filtreleri yüklenemedi.');
            const banner = safeUrl(category.banner_url || category.image_url);
            const accentColor = safeAccentColor(category.accent_color);
            updateCategoryMetadata(category);
            container.innerHTML = `
                ${renderBreadcrumb(detail.breadcrumb)}
                <header class="catalog-category-hero"${accentColor ? ` style="--catalog-accent:${accentColor}"` : ''}>
                    ${banner ? `<img src="${escapeHtml(banner)}" alt="">` : ''}
                    <div><h1>${escapeHtml(category.name)}</h1><p>${escapeHtml(category.description || '')}</p></div>
                </header>
                ${renderCategoryCards(detail.children)}
                <div class="catalog-category-content">
                    ${renderCategoryFilters(filterPayload.filters)}
                    <div class="catalog-category-results">${renderCategoryProducts(products)}</div>
                </div>`;
            bindCategoryFilters(container, category);
        } catch (error) {
            const message = error.status === 404
                ? 'Kategori bulunamadı veya artık yayında değil.'
                : 'Kategori içeriği şu anda yüklenemiyor.';
            container.innerHTML = `<div class="catalog-error-state">${escapeHtml(message)} <a href="/categories.html">Tüm kategoriler</a></div>`;
        }
    }

    async function renderProductBreadcrumb(product, { containerId = 'product-category-breadcrumb' } = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const primaryId = Number(product?.primaryCategoryId);
        if (!Number.isInteger(primaryId)) {
            container.innerHTML = '';
            return;
        }
        try {
            const flat = flattenTree(await fetchCategoryTree());
            const primary = flat.find((category) => Number(category.id) === primaryId);
            if (!primary) {
                container.innerHTML = '';
                return;
            }
            const detail = await fetchCategoryDetail(primary.slug);
            container.innerHTML = renderBreadcrumb(detail.breadcrumb);
        } catch (_) {
            container.innerHTML = '';
        }
    }

    window.NovaStoreCatalogNavigation = {
        mountMenu,
        fetchPublicNavigation,
        fetchCategoryTree,
        resolveCategoryFromLocation,
        fetchCategoryDetail,
        loadCategoryPage,
        renderProductBreadcrumb,
        categoryUrl,
        _test: {
            escapeHtml,
            safeUrl,
            safeAccentColor,
            categorySlugFromPath,
            updateCategoryMetadata,
            flattenTree,
            renderTreeItems,
            navigationItemUrl,
            renderNavigationItems,
            renderBreadcrumb,
            renderCategoryCards,
            renderCategoryProducts,
            renderCategoryFilters,
            collectCategoryFilters
        }
    };
})(window, document);
