(function (root) {
    const PUBLIC_TREE_ENDPOINT = '/api/public/categories?format=tree';
    const PRODUCTS_ENDPOINT = '/api/products';
    const DEFAULT_TITLE = 'NovaStore | Kategoriler';

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizePath(value) {
        return String(value || '')
            .trim()
            .replace(/^\/+|\/+$/g, '')
            .replace(/\/+/g, '/')
            .toLocaleLowerCase('tr-TR');
    }

    function encodePathForUrl(path) {
        return normalizePath(path)
            .split('/')
            .filter(Boolean)
            .map(encodeURIComponent)
            .join('/');
    }

    function decodePathFromUrl(value) {
        return String(value || '')
            .split('/')
            .filter(Boolean)
            .map((segment) => {
                try {
                    return decodeURIComponent(segment);
                } catch (_) {
                    return segment;
                }
            })
            .join('/');
    }

    function parseCategoryPath(locationRef = root.location) {
        if (!locationRef) return '';
        const params = new URLSearchParams(String(locationRef.search || '').replace(/^\?/, ''));
        const queryCategory = params.get('category');
        if (queryCategory) return normalizePath(queryCategory);

        const pathname = String(locationRef.pathname || '');
        const match = pathname.match(/^\/(?:kategori|category)\/(.+)$/i);
        return match ? normalizePath(decodePathFromUrl(match[1])) : '';
    }

    function categoryQueryUrl(categoryPath) {
        return `categories.html?category=${encodeURIComponent(normalizePath(categoryPath))}`;
    }

    function canonicalCategoryPath(categoryPath) {
        const encoded = encodePathForUrl(categoryPath);
        return encoded ? `/kategori/${encoded}` : '/categories.html';
    }

    function categoryProductsUrl(categoryPath) {
        const params = new URLSearchParams();
        params.set('category', normalizePath(categoryPath));
        params.set('includeDescendants', 'true');
        return `${PRODUCTS_ENDPOINT}?${params.toString()}`;
    }

    async function fetchJson(fetcher, url) {
        const response = await fetcher(url);
        const text = response && typeof response.text === 'function'
            ? await response.text()
            : '';
        let body = null;
        if (text) {
            try {
                body = JSON.parse(text);
            } catch (_) {
                body = null;
            }
        }
        if (!response || !response.ok) {
            const error = new Error(body?.error || 'İstek tamamlanamadı.');
            error.status = response?.status || 500;
            error.code = body?.code;
            throw error;
        }
        return body;
    }

    function normalizeCategoryNode(node = {}, parentTrail = []) {
        const name = String(node.name || 'Kategori').trim() || 'Kategori';
        const path = normalizePath(node.path || node.fullSlugPath || node.full_slug_path || node.slug || name);
        const trail = parentTrail.concat({
            id: Number(node.id || 0),
            name,
            slug: String(node.slug || '').trim(),
            path
        });
        const children = Array.isArray(node.children)
            ? node.children.map((child) => normalizeCategoryNode(child, trail))
            : [];
        return {
            ...node,
            id: Number(node.id || 0),
            name,
            slug: String(node.slug || '').trim(),
            path,
            pathLabel: trail.map((item) => item.name).join(' > '),
            breadcrumb: trail,
            children,
            visibleProductCount: Number(
                node.subtree_visible_product_count
                ?? node.visible_product_count
                ?? node.visibleProductCount
                ?? 0
            )
        };
    }

    function normalizePublicTree(payload) {
        const rawTree = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.categories)
                ? payload.categories
                : Array.isArray(payload?.tree)
                    ? payload.tree
                    : [];
        return rawTree.map((node) => normalizeCategoryNode(node));
    }

    function flattenTree(tree = []) {
        const rows = [];
        const visit = (node) => {
            rows.push(node);
            (node.children || []).forEach(visit);
        };
        tree.forEach(visit);
        return rows;
    }

    function findCategoryDetail(tree, categoryPath) {
        const normalized = normalizePath(categoryPath);
        if (!normalized) return null;
        const rows = flattenTree(tree);
        return rows.find((node) => normalizePath(node.path) === normalized)
            || rows.find((node) => normalizePath(node.slug) === normalized)
            || null;
    }

    function normalizeProductsPayload(payload) {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.products)) return payload.products;
        return [];
    }

    function productImageUrl(product = {}) {
        if (product.image_url) return product.image_url;
        if (product.imageUrl) return product.imageUrl;
        if (Array.isArray(product.media) && product.media[0]) {
            return product.media[0].media_url || product.media[0].url || '';
        }
        return '';
    }

    function formatPrice(value) {
        const number = Number(value || 0);
        return number.toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    async function loadFavoriteIds() {
        if (root.NovaStoreFavorites?.loadFavoriteIds) {
            return root.NovaStoreFavorites.loadFavoriteIds();
        }
        return new Set();
    }

    function userId() {
        try {
            return JSON.parse(root.localStorage.getItem('nova_user_info') || '{}')?.id || 'guest';
        } catch (_) {
            return 'guest';
        }
    }

    function cartKey() {
        return `novastore_cart_${userId()}`;
    }

    function readCart() {
        try {
            const value = JSON.parse(root.localStorage.getItem(cartKey()) || '[]');
            return Array.isArray(value) ? value : [];
        } catch (_) {
            return [];
        }
    }

    async function addProductToCart(product) {
        const id = Number(product.id);
        if (!Number.isInteger(id) || id <= 0) return false;
        const previousCart = readCart();
        const nextCart = previousCart.map((item) => ({ ...item }));
        const existing = nextCart.find((item) => Number(item.id || item.productId) === id);
        if (existing) {
            existing.quantity = Number(existing.quantity || 1) + 1;
        } else {
            nextCart.push({
                id,
                productId: id,
                name: product.name,
                price: Number(product.price || 0),
                old_price: product.old_price || product.oldPrice || null,
                image: productImageUrl(product),
                quantity: 1
            });
        }

        try {
            if (root.NovaStoreSharedState?.isAuthenticated?.()) {
                await root.NovaStoreSharedState.saveCart(nextCart);
                root.NovaStoreSharedState.writeCartLocal(nextCart);
            } else {
                root.localStorage.setItem(cartKey(), JSON.stringify(nextCart));
            }
            root.dispatchEvent?.(new CustomEvent('novastore:shared-cart-updated', { detail: { items: nextCart } }));
            return true;
        } catch (error) {
            root.NovaStoreSharedState?.reportError?.(
                'cart',
                error,
                'Sepet şu anda senkronlanamadı. Değişikliğiniz uygulanmadı.'
            );
            return false;
        }
    }

    function buildBreadcrumbHtml(category) {
        const items = [{ name: 'Ana Sayfa', href: 'index.html' }].concat(
            (category?.breadcrumb || []).map((item) => ({
                name: item.name,
                href: item.path ? categoryQueryUrl(item.path) : ''
            }))
        );

        return `
            <nav class="category-plp-breadcrumb" aria-label="Kategori yolu">
                ${items.map((item, index) => {
                    const current = index === items.length - 1;
                    const label = escapeHtml(item.name);
                    return `<span class="category-plp-breadcrumb-item">${
                        current || !item.href
                            ? `<span aria-current="${current ? 'page' : 'false'}">${label}</span>`
                            : `<a href="${escapeHtml(item.href)}">${label}</a>`
                    }</span>`;
                }).join('<span class="category-plp-breadcrumb-separator">&gt;</span>')}
            </nav>
        `;
    }

    function buildChildCategoryHtml(children = []) {
        if (!children.length) return '';
        return `
            <div class="category-plp-children" aria-label="Alt kategoriler">
                ${children.map((child) => `
                    <a class="category-plp-child" href="${escapeHtml(categoryQueryUrl(child.path))}">
                        <strong>${escapeHtml(child.name)}</strong>
                        <span>${Number(child.visibleProductCount || 0)} ürün</span>
                    </a>
                `).join('')}
            </div>
        `;
    }

    function buildPriceHtml(product = {}) {
        const price = Number(product.price || 0);
        const oldPrice = Number(product.old_price || product.oldPrice || 0);
        if (oldPrice > price && price > 0) {
            return `<div class="category-plp-price is-discounted"><span>${formatPrice(oldPrice)} TL</span><strong>${formatPrice(price)} TL</strong></div>`;
        }
        return `<div class="category-plp-price"><strong>${formatPrice(price)} TL</strong></div>`;
    }

    function buildProductCardHtml(product = {}, favoriteIds = new Set()) {
        const id = Number(product.id || 0);
        const name = String(product.name || 'Ürün').trim() || 'Ürün';
        const image = productImageUrl(product);
        const isFavorite = favoriteIds.has(id) ? ' active' : '';
        const soldOut = Number(product.stock || 0) <= 0;
        return `
            <article class="product-card category-plp-product" data-product-id="${id}">
                <button type="button" class="btn-favorite${isFavorite}" data-plp-favorite="${id}" title="Favorilere Ekle" aria-label="${escapeHtml(name)} ürününü favorilere ekle">
                    <svg class="heart-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                <a class="category-plp-product-link" href="product.html?id=${id}">
                    <div class="category-plp-product-media">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy">` : ''}</div>
                    <h2 class="product-title">${escapeHtml(name)}</h2>
                </a>
                <div class="category-plp-product-actions">
                    ${buildPriceHtml(product)}
                    <button type="button" class="btn-add" data-plp-add-to-cart="${id}" ${soldOut ? 'disabled aria-disabled="true" title="Stokta Yok"' : 'title="Sepete Ekle"'} aria-label="${escapeHtml(name)} ürününü sepete ekle">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#222" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <circle cx="8" cy="21" r="2"></circle>
                            <circle cx="20" cy="21" r="2"></circle>
                            <path d="M5.67 6H23l-3.2 9H8.55L5.67 6z"></path>
                        </svg>
                    </button>
                </div>
            </article>
        `;
    }

    function buildEmptyStateHtml(type) {
        const messages = {
            notFound: 'Kategori bulunamadı.',
            categoryEmpty: 'Bu kategoride henüz ürün yok.',
            filterEmpty: 'Seçili filtrelere uygun ürün bulunamadı.',
            loadError: 'Kategori ürünleri şu anda yüklenemedi.'
        };
        return `<div class="category-plp-empty">${escapeHtml(messages[type] || messages.loadError)}</div>`;
    }

    function filterProducts(products = [], query = '') {
        const normalizedQuery = String(query || '').trim().toLocaleLowerCase('tr-TR');
        if (!normalizedQuery) return products;
        return products.filter((product) => {
            const haystack = [
                product.name,
                product.description,
                product.category,
                ...(Array.isArray(product.categories) ? product.categories : [])
            ].join(' ').toLocaleLowerCase('tr-TR');
            return haystack.includes(normalizedQuery);
        });
    }

    function buildProductsHtml(products = [], favoriteIds = new Set(), emptyType = 'categoryEmpty') {
        if (!products.length) return buildEmptyStateHtml(emptyType);
        return `<div class="category-plp-grid">${products.map((product) => buildProductCardHtml(product, favoriteIds)).join('')}</div>`;
    }

    function buildSeo(category) {
        const name = category?.name || 'Kategoriler';
        return {
            title: `${name} Ürünleri | NovaStore`,
            description: `${name} kategorisindeki ürünleri NovaStore'da keşfet.`,
            canonicalPath: canonicalCategoryPath(category?.path || '')
        };
    }

    function ensureMetaDescription(documentRef) {
        let meta = documentRef.querySelector('meta[name="description"]');
        if (!meta) {
            meta = documentRef.createElement('meta');
            meta.setAttribute('name', 'description');
            documentRef.head.appendChild(meta);
        }
        return meta;
    }

    function ensureCanonicalLink(documentRef) {
        let link = documentRef.querySelector('link[rel="canonical"]');
        if (!link) {
            link = documentRef.createElement('link');
            link.setAttribute('rel', 'canonical');
            documentRef.head.appendChild(link);
        }
        return link;
    }

    function absoluteUrl(path, locationRef = root.location) {
        if (!locationRef) return path;
        return new URL(path, locationRef.origin || `${locationRef.protocol}//${locationRef.host}`).toString();
    }

    function updateSeo(documentRef, category, locationRef = root.location) {
        if (!documentRef || !category) return null;
        const seo = buildSeo(category);
        documentRef.title = seo.title;
        ensureMetaDescription(documentRef).setAttribute('content', seo.description);
        ensureCanonicalLink(documentRef).setAttribute('href', absoluteUrl(seo.canonicalPath, locationRef));
        return seo;
    }

    function replaceCanonicalHistory(historyRef, locationRef, category) {
        if (!historyRef || typeof historyRef.replaceState !== 'function' || !locationRef || !category?.path) return null;
        const canonicalPath = canonicalCategoryPath(category.path);
        const currentPath = `${locationRef.pathname || ''}${locationRef.search || ''}`;
        if (canonicalPath && currentPath !== canonicalPath) {
            historyRef.replaceState({}, '', canonicalPath);
            return canonicalPath;
        }
        return null;
    }

    function bindProductActions(container, products) {
        if (!container || container.dataset.categoryPlpActionsBound === 'true') return;
        container.dataset.categoryPlpActionsBound = 'true';
        container.addEventListener('click', async (event) => {
            const favoriteButton = event.target.closest('[data-plp-favorite]');
            if (favoriteButton && container.contains(favoriteButton)) {
                event.preventDefault();
                const productId = Number(favoriteButton.dataset.plpFavorite);
                const nextState = !favoriteButton.classList.contains('active');
                favoriteButton.classList.toggle('active', nextState);
                try {
                    await root.NovaStoreFavorites?.setFavorite?.(productId, nextState);
                } catch (error) {
                    favoriteButton.classList.toggle('active', !nextState);
                    root.NovaStoreFavorites?.reportError?.(error);
                }
                return;
            }

            const cartButton = event.target.closest('[data-plp-add-to-cart]');
            if (cartButton && container.contains(cartButton)) {
                event.preventDefault();
                const productId = Number(cartButton.dataset.plpAddToCart);
                const product = products.find((item) => Number(item.id) === productId);
                if (product) await addProductToCart(product);
            }
        });
    }

    function renderPlp(container, category, products, favoriteIds) {
        const state = { query: '' };
        const renderProducts = () => {
            const displayed = filterProducts(products, state.query);
            const target = container.querySelector('[data-plp-products]');
            if (target) {
                target.innerHTML = buildProductsHtml(
                    displayed,
                    favoriteIds,
                    state.query ? 'filterEmpty' : 'categoryEmpty'
                );
            }
        };

        container.innerHTML = `
            <section class="category-plp-shell">
                ${buildBreadcrumbHtml(category)}
                <header class="category-plp-header">
                    <div>
                        <p class="category-plp-kicker">Kategori</p>
                        <h1>${escapeHtml(category.name)} Ürünleri</h1>
                    </div>
                    <strong class="category-plp-count">${Number(category.visibleProductCount || products.length || 0)} ürün</strong>
                </header>
                ${buildChildCategoryHtml(category.children)}
                <div class="category-plp-tools">
                    <label>
                        <span>Arama</span>
                        <input type="search" data-plp-search placeholder="Kategori içinde ara">
                    </label>
                </div>
                <div class="category-plp-products" data-plp-products>
                    ${buildProductsHtml(products, favoriteIds)}
                </div>
            </section>
        `;
        bindProductActions(container, products);
        const search = container.querySelector('[data-plp-search]');
        if (search) {
            search.addEventListener('input', () => {
                state.query = search.value;
                renderProducts();
            });
        }
    }

    async function mountCategoryPlp(options = {}) {
        const documentRef = options.document || root.document;
        const locationRef = options.location || root.location;
        const historyRef = options.history || root.history;
        const fetcher = options.fetch || root.fetch?.bind(root);
        const container = options.container || documentRef?.getElementById('native-categories-list');
        const title = options.title || documentRef?.querySelector('.native-categories-title');
        const lead = options.lead || documentRef?.querySelector('.native-categories-lead');
        const categoryPath = normalizePath(options.categoryPath || parseCategoryPath(locationRef));

        if (!categoryPath || !container || !fetcher) return false;

        try {
            const tree = normalizePublicTree(await fetchJson(fetcher, PUBLIC_TREE_ENDPOINT));
            const category = findCategoryDetail(tree, categoryPath);
            if (!category) {
                if (title) title.textContent = 'Kategori bulunamadı';
                if (lead) lead.textContent = 'Aradığınız kategori yayında değil veya kaldırılmış olabilir.';
                container.innerHTML = buildEmptyStateHtml('notFound');
                return { category: null, products: [] };
            }

            const products = normalizeProductsPayload(await fetchJson(fetcher, categoryProductsUrl(category.path)));
            const favoriteIds = await loadFavoriteIds();
            if (title) title.textContent = `${category.name} Ürünleri`;
            if (lead) lead.textContent = `${Number(category.visibleProductCount || products.length || 0)} ürün listeleniyor.`;
            updateSeo(documentRef, category, locationRef);
            replaceCanonicalHistory(historyRef, locationRef, category);
            renderPlp(container, category, products, favoriteIds);
            return { category, products };
        } catch (error) {
            if (title) title.textContent = 'Kategori ürünleri';
            if (lead) lead.textContent = 'Kategori sayfası şu anda gösterilemiyor.';
            container.innerHTML = buildEmptyStateHtml(error.status === 404 ? 'notFound' : 'loadError');
            return false;
        }
    }

    const api = {
        PUBLIC_TREE_ENDPOINT,
        PRODUCTS_ENDPOINT,
        addProductToCart,
        buildBreadcrumbHtml,
        buildChildCategoryHtml,
        buildEmptyStateHtml,
        buildProductCardHtml,
        buildProductsHtml,
        buildSeo,
        canonicalCategoryPath,
        categoryProductsUrl,
        categoryQueryUrl,
        encodePathForUrl,
        findCategoryDetail,
        filterProducts,
        flattenTree,
        mountCategoryPlp,
        normalizeCategoryNode,
        normalizePath,
        normalizeProductsPayload,
        normalizePublicTree,
        parseCategoryPath,
        replaceCanonicalHistory,
        updateSeo
    };

    root.NovaStoreCategoryPlp = api;
})(typeof window !== 'undefined' ? window : globalThis);
