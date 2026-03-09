const pool = require('../config/db');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5000';

const STOPWORDS = new Set([
    've', 'veya', 'ile', 'icin', 'ama', 'gibi', 'bir', 'bu', 'su', 'bana', 'beni', 'olan', 'olanlar',
    'en', 'daha', 'cok', 'az', 'mi', 'midir', 'var', 'yok', 'uygun', 'fiyat', 'urun', 'urunu', 'urunler',
    'isterim', 'ariyorum', 'ararim', 'gore', 'hangi', 'nasil', 'olsun'
]);

const normalizeSearchText = (value) => String(value || '')
    .toLowerCase()
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toTokens = (value) => normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));

const safeNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const buildProductUrl = (productId) => `${APP_BASE_URL}/product.html?id=${productId}`;

const runCatalogQuery = async () => {
    const primaryQuery = `
        SELECT
            p.id,
            p.name,
            p.description,
            p.price,
            p.old_price,
            p.stock,
            p.image_url,
            COALESCE(p.category, 'Kategorisiz') AS category,
            ROUND(COALESCE(AVG(r.rating), 0), 1) AS average_rating,
            CAST(COUNT(r.id) AS INTEGER) AS review_count
        FROM products p
        LEFT JOIN reviews r ON r.product_id = p.id
        GROUP BY p.id
        ORDER BY p.created_at DESC
    `;

    const fallbackQuery = `
        SELECT
            p.id,
            p.name,
            p.description,
            p.price,
            NULL::numeric AS old_price,
            p.stock,
            p.image_url,
            'Kategorisiz' AS category,
            ROUND(COALESCE(AVG(r.rating), 0), 1) AS average_rating,
            CAST(COUNT(r.id) AS INTEGER) AS review_count
        FROM products p
        LEFT JOIN reviews r ON r.product_id = p.id
        GROUP BY p.id
        ORDER BY p.created_at DESC
    `;

    try {
        const result = await pool.query(primaryQuery);
        return result.rows;
    } catch (err) {
        const message = String(err.message || '');
        const isSchemaMismatch = String(err.code || '').startsWith('42') && /(category|old_price)/i.test(message);
        if (!isSchemaMismatch) throw err;
        const fallbackResult = await pool.query(fallbackQuery);
        return fallbackResult.rows;
    }
};

const parseSearchFilters = (message) => {
    const raw = String(message || '');
    const normalized = normalizeSearchText(raw);
    const maxPriceMatch = raw.match(/(?:en fazla|max|maksimum|butce)\s*(\d+[\.,]?\d*)\s*tl/i) || raw.match(/(\d+[\.,]?\d*)\s*tl\s*(?:alti|altinda)/i);
    const minPriceMatch = raw.match(/(\d+[\.,]?\d*)\s*tl\s*(?:ustu|ustunde|uzeri)/i);

    return {
        maxPrice: maxPriceMatch ? safeNumber(String(maxPriceMatch[1]).replace(',', '.')) : null,
        minPrice: minPriceMatch ? safeNumber(String(minPriceMatch[1]).replace(',', '.')) : null,
        inStockOnly: /stokta|hazir|hemen teslim|mevcut/.test(normalized),
        sortByCheap: /uygun fiyat|fiyat performans|en ucuz|butce dostu|hesapli/.test(normalized),
        sortByPopular: /en iyi|en cok tercih|populer|yorum/.test(normalized),
        queryTokens: toTokens(raw)
    };
};

const scoreProduct = (product, queryTokens, filters) => {
    const haystack = normalizeSearchText(`${product.name} ${product.category} ${product.description || ''}`);
    let score = 0;

    queryTokens.forEach((token) => {
        if (normalizeSearchText(product.name).includes(token)) score += 8;
        if (normalizeSearchText(product.category).includes(token)) score += 4;
        if (haystack.includes(token)) score += 2;
    });

    const stock = safeNumber(product.stock);
    const averageRating = safeNumber(product.average_rating);
    const reviewCount = safeNumber(product.review_count);

    if (stock > 0) score += 2;
    score += Math.min(averageRating, 5);
    score += Math.min(reviewCount, 20) * 0.15;

    if (filters.sortByCheap) score += Math.max(0, 5 - Math.min(safeNumber(product.price) / 1000, 5));
    if (filters.sortByPopular) score += averageRating + Math.min(reviewCount / 5, 4);

    return score;
};

const formatProduct = (row) => ({
    id: Number(row.id),
    name: row.name,
    description: row.description || '',
    price: safeNumber(row.price),
    oldPrice: row.old_price !== null && row.old_price !== undefined ? safeNumber(row.old_price) : null,
    stock: safeNumber(row.stock),
    imageUrl: row.image_url || '',
    category: row.category || 'Kategorisiz',
    averageRating: safeNumber(row.average_rating),
    reviewCount: safeNumber(row.review_count),
    productUrl: buildProductUrl(row.id)
});

const applyStructuredFilters = (products, filters) => products.filter((product) => {
    if (filters.inStockOnly && product.stock <= 0) return false;
    if (filters.maxPrice !== null && product.price > filters.maxPrice) return false;
    if (filters.minPrice !== null && product.price < filters.minPrice) return false;
    return true;
});

const searchProducts = async ({ query, limit = 4, filters = {}, productId = null } = {}) => {
    const rows = await runCatalogQuery();
    const mergedFilters = { ...parseSearchFilters(query), ...filters };
    const normalizedProducts = rows.map(formatProduct);

    if (productId && Number.isInteger(Number(productId))) {
        const direct = normalizedProducts.find((product) => product.id === Number(productId));
        if (direct) return [direct];
    }

    const filtered = applyStructuredFilters(normalizedProducts, mergedFilters);
    const queryTokens = mergedFilters.queryTokens || [];

    const scored = filtered
        .map((product) => ({ product, score: scoreProduct(product, queryTokens, mergedFilters) }))
        .filter((item) => queryTokens.length === 0 || item.score > 0)
        .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            if (mergedFilters.sortByCheap) return left.product.price - right.product.price;
            if (mergedFilters.sortByPopular) {
                if (right.product.reviewCount !== left.product.reviewCount) {
                    return right.product.reviewCount - left.product.reviewCount;
                }
                return right.product.averageRating - left.product.averageRating;
            }
            return left.product.price - right.product.price;
        })
        .slice(0, limit)
        .map((item) => item.product);

    if (scored.length > 0) return scored;

    return normalizedProducts
        .sort((left, right) => {
            if (right.reviewCount !== left.reviewCount) return right.reviewCount - left.reviewCount;
            return right.averageRating - left.averageRating;
        })
        .slice(0, limit);
};

const getProductDetails = async (productId) => {
    if (!Number.isInteger(Number(productId))) return null;
    const products = await searchProducts({ productId: Number(productId), limit: 1 });
    return products[0] || null;
};

const extractComparisonCandidates = (message) => {
    const separators = [' vs ', ' ve ', ' ile ', ','];
    const normalized = normalizeSearchText(message);

    for (const separator of separators) {
        if (normalized.includes(separator.trim())) {
            return normalized
                .split(separator)
                .map((part) => part.trim())
                .filter(Boolean);
        }
    }

    return toTokens(message);
};

const compareProductsByText = async (message, limit = 3) => {
    const rows = await runCatalogQuery();
    const catalog = rows.map(formatProduct);
    const candidates = extractComparisonCandidates(message);
    const picked = [];

    candidates.forEach((candidate) => {
        const match = catalog.find((product) => normalizeSearchText(product.name).includes(candidate));
        if (match && !picked.some((product) => product.id === match.id)) {
            picked.push(match);
        }
    });

    if (picked.length >= 2) {
        return picked.slice(0, limit);
    }

    return searchProducts({ query: message, limit });
};

module.exports = {
    buildProductUrl,
    compareProductsByText,
    getProductDetails,
    normalizeSearchText,
    searchProducts,
    toTokens
};
