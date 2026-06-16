const {
    compareProductsByText,
    getProductDetails,
    searchProducts
} = require('./catalogSearchService');

const byPriceAsc = (left, right) => Number(left.price || 0) - Number(right.price || 0);

const byRatingDesc = (left, right) => {
    const ratingDiff = Number(right.averageRating || 0) - Number(left.averageRating || 0);
    if (ratingDiff !== 0) return ratingDiff;
    return Number(right.reviewCount || 0) - Number(left.reviewCount || 0);
};

const uniqueProducts = (products) => {
    const seen = new Set();
    return products.filter((product) => {
        if (!product || seen.has(product.id)) return false;
        seen.add(product.id);
        return true;
    });
};

const resolveProductsByIds = async (ids = []) => {
    const resolved = await Promise.all(
        ids
            .map((id) => Number(id))
            .filter(Number.isInteger)
            .map((id) => getProductDetails(id))
    );
    return uniqueProducts(resolved.filter(Boolean));
};

const searchProductsTool = async (query, filters = {}, limit = 4) => {
    return searchProducts({ query, filters, limit });
};

const getProductDetailsTool = async (productId) => {
    return getProductDetails(Number(productId));
};

const compareProductsTool = async ({ message, productIds = [] }) => {
    const contextProducts = await resolveProductsByIds(productIds);
    if (contextProducts.length >= 2) return contextProducts.slice(0, 3);
    return compareProductsByText(message, 3);
};

const getRecommendationsTool = async ({ message, limit = 4 }) => {
    const products = await searchProducts({ query: message, limit: Math.max(limit, 6) });
    const sorted = [...products].sort((left, right) => {
        const stockDiff = Number(right.stock > 0) - Number(left.stock > 0);
        if (stockDiff !== 0) return stockDiff;
        return byRatingDesc(left, right);
    });
    return sorted.slice(0, limit);
};

const getSimilarProductsTool = async (productId, limit = 4) => {
    const product = await getProductDetailsTool(productId);
    if (!product) return [];
    const query = `${product.category || ''} ${product.name || ''}`;
    const products = await searchProducts({ query, limit: limit + 1 });
    return products.filter((item) => item.id !== product.id).slice(0, limit);
};

const getCheaperProductsTool = async ({ message, limit = 4 }) => {
    const products = await searchProducts({ query: message, filters: { sortByCheap: true }, limit: Math.max(limit, 8) });
    return [...products].sort(byPriceAsc).slice(0, limit);
};

const getCartTool = () => ({
    availableInClient: true,
    message: 'Sepet bilgisi Android uygulamasında yerel sepet üzerinden gösterilir.'
});

module.exports = {
    compareProductsTool,
    getCartTool,
    getCheaperProductsTool,
    getProductDetailsTool,
    getRecommendationsTool,
    getSimilarProductsTool,
    resolveProductsByIds,
    searchProductsTool
};
