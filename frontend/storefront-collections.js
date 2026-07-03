(function storefrontCollectionsModule(window, document) {
    'use strict';

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const safeUrl = (value, fallback = '') => {
        const raw = String(value || '').trim();
        if (!raw) return fallback;
        if (/^(https?:\/\/|\/(?!\/))/i.test(raw)) return raw;
        return fallback;
    };

    const collectionUrl = (collection) =>
        `/koleksiyon/${encodeURIComponent(String(collection?.slug || ''))}`;

    const collectionSlugFromPath = (pathname) => {
        const match = String(pathname || '').match(/^\/koleksiyon\/([^/?#]+)\/?$/i);
        if (!match) return null;
        try {
            return decodeURIComponent(match[1]);
        } catch (_) {
            return match[1];
        }
    };

    const readJson = async (response, fallback) => {
        let payload = {};
        try {
            payload = await response.json();
        } catch (_) {}
        if (!response.ok) {
            const error = new Error(payload.error || fallback);
            error.status = response.status;
            throw error;
        }
        return payload;
    };

    const fetchCollections = async () =>
        readJson(await fetch('/api/public/collections'), 'Koleksiyonlar yüklenemedi.');

    const fetchCollection = async (slug, { page = 1, limit = 24 } = {}) =>
        readJson(
            await fetch(`/api/public/collections/${encodeURIComponent(slug)}?page=${Number(page)}&limit=${Number(limit)}`),
            'Koleksiyon yüklenemedi.'
        );

    function renderProductCard(product) {
        const soldOut = product.is_purchasable === false || Number(product.stock || 0) <= 0;
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
    }

    function renderCollectionBlock(detail) {
        const collection = detail.collection;
        const products = Array.isArray(detail.products) ? detail.products : [];
        if (!collection || products.length === 0) return '';
        return `<section class="storefront-collection-block">
            <div class="storefront-collection-heading">
                <div>
                    <span class="storefront-collection-kicker">${escapeHtml(collection.collection_type === 'dynamic' ? 'Güncel Seçki' : 'Seçili ürünler')}</span>
                    <h2>${escapeHtml(collection.name)}</h2>
                    <p>${escapeHtml(collection.description || '')}</p>
                </div>
                <a href="${escapeHtml(collectionUrl(collection))}">Tümünü gör →</a>
            </div>
            <div class="catalog-product-grid">${products.map(renderProductCard).join('')}</div>
        </section>`;
    }

    async function mountHomeCollections({ containerId = 'home-collections' } = {}) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        try {
            const collections = (await fetchCollections())
                .filter((collection) => collection.show_on_home === true)
                .slice(0, 4);
            const details = await Promise.all(collections.map((collection) =>
                fetchCollection(collection.slug, { page: 1, limit: 4 }).catch(() => null)
            ));
            const blocks = details.filter(Boolean).map(renderCollectionBlock).filter(Boolean);
            container.innerHTML = blocks.join('');
            container.hidden = blocks.length === 0;
            return details.filter(Boolean);
        } catch (_) {
            container.innerHTML = '';
            container.hidden = true;
            return [];
        }
    }

    function updateMetadata(collection) {
        document.title = `${collection.seo_title || collection.name} | NovaStore`;
        let canonical = document.querySelector('link[rel="canonical"]');
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.rel = 'canonical';
            document.head.appendChild(canonical);
        }
        canonical.href = new URL(collectionUrl(collection), window.location.origin).href;
        let description = document.querySelector('meta[name="description"]');
        if (!description) {
            description = document.createElement('meta');
            description.name = 'description';
            document.head.appendChild(description);
        }
        description.content = String(collection.seo_description || collection.description || '').trim();
    }

    function renderPagination(collection, pagination) {
        if (Number(pagination.total_pages || 0) <= 1) return '';
        const links = [];
        for (let page = 1; page <= Math.min(Number(pagination.total_pages), 20); page += 1) {
            links.push(`<a href="${escapeHtml(collectionUrl(collection))}?page=${page}"${page === Number(pagination.page) ? ' aria-current="page"' : ''}>${page}</a>`);
        }
        return `<nav class="collection-pagination" aria-label="Koleksiyon sayfaları">${links.join('')}</nav>`;
    }

    async function loadCollectionPage({ containerId = 'collection-page-content' } = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const params = new URLSearchParams(window.location.search);
        const slug = collectionSlugFromPath(window.location.pathname) || params.get('slug');
        const page = Math.max(1, Number(params.get('page')) || 1);
        if (!slug) {
            container.innerHTML = '<div class="catalog-error-state">Koleksiyon bağlantısı geçersiz.</div>';
            return;
        }
        container.innerHTML = '<div class="catalog-page-loading">Koleksiyon yükleniyor…</div>';
        try {
            const detail = await fetchCollection(slug, { page, limit: 24 });
            const collection = detail.collection;
            updateMetadata(collection);
            if (!collectionSlugFromPath(window.location.pathname) && window.history?.replaceState) {
                window.history.replaceState({}, '', `${collectionUrl(collection)}${page > 1 ? `?page=${page}` : ''}`);
            }
            const banner = safeUrl(collection.banner_url || collection.image_url);
            container.innerHTML = `
                <nav class="catalog-breadcrumb" aria-label="Koleksiyon yolu">
                    <a href="/index.html">Ana Sayfa</a><span aria-hidden="true">›</span>
                    <a href="${escapeHtml(collectionUrl(collection))}" aria-current="page">${escapeHtml(collection.name)}</a>
                </nav>
                <header class="catalog-category-hero">
                    ${banner ? `<img src="${escapeHtml(banner)}" alt="">` : ''}
                    <div><h1>${escapeHtml(collection.name)}</h1><p>${escapeHtml(collection.description || '')}</p></div>
                </header>
                <section class="catalog-page-products">
                    <h2>Ürünler</h2>
                    <div class="catalog-product-grid">${detail.products.map(renderProductCard).join('')}</div>
                </section>
                ${renderPagination(collection, detail.pagination)}`;
        } catch (error) {
            const message = error.status === 404
                ? 'Koleksiyon bulunamadı, boş veya yayında değil.'
                : 'Koleksiyon şu anda yüklenemiyor.';
            container.innerHTML = `<div class="catalog-error-state">${escapeHtml(message)} <a href="/index.html">Ana sayfaya dön</a></div>`;
        }
    }

    window.NovaStorefrontCollections = {
        mountHomeCollections,
        loadCollectionPage,
        fetchCollections,
        fetchCollection,
        collectionUrl,
        _test: {
            escapeHtml,
            safeUrl,
            collectionSlugFromPath,
            renderProductCard,
            renderCollectionBlock,
            renderPagination,
            updateMetadata
        }
    };

    const boot = () => {
        if (document.getElementById('home-collections')) mountHomeCollections();
        if (document.getElementById('collection-page-content')) loadCollectionPage();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(window, document);
