const pool = require('../config/db');
const { normalizeSearchText } = require('./catalogSearchService');

const POSITIVE_SIGNALS = [
    { key: 'kalite', label: 'kalite' },
    { key: 'hizli', label: 'hizli teslimat veya kullanim' },
    { key: 'rahat', label: 'rahat kullanim' },
    { key: 'guzel', label: 'tasarim ve genel memnuniyet' },
    { key: 'performans', label: 'performans' },
    { key: 'fiyat performans', label: 'fiyat performans dengesi' },
    { key: 'memnun', label: 'genel memnuniyet' }
];

const NEGATIVE_SIGNALS = [
    { key: 'yavas', label: 'beklenen hiz veya akicilik' },
    { key: 'isindi', label: 'isinma' },
    { key: 'agir', label: 'agirlik veya tasinabilirlik' },
    { key: 'pahali', label: 'fiyat algisi' },
    { key: 'sorun', label: 'teknik sorun' },
    { key: 'eksik', label: 'beklenti eksigi' },
    { key: 'iade', label: 'iade ihtiyaci' }
];

const loadReviewRows = async (productId) => {
    const result = await pool.query(
        `SELECT rating, comment, created_at
         FROM reviews
         WHERE product_id = $1
         ORDER BY created_at DESC`,
        [productId]
    );
    return result.rows;
};

const collectSignals = (comments, dictionary) => {
    const counts = new Map();

    comments.forEach((comment) => {
        const normalized = normalizeSearchText(comment);
        dictionary.forEach((signal) => {
            if (normalized.includes(signal.key)) {
                counts.set(signal.label, (counts.get(signal.label) || 0) + 1);
            }
        });
    });

    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([label]) => label);
};

const summarizeProductReviews = async (product) => {
    if (!product || !Number.isInteger(Number(product.id))) {
        return {
            averageRating: 0,
            totalReviews: 0,
            summary: 'Yorum ozeti cikarmak icin urun bilgisi eksik.',
            strengths: [],
            concerns: [],
            recentComments: []
        };
    }

    const rows = await loadReviewRows(product.id);
    const comments = rows.map((row) => String(row.comment || '').trim()).filter(Boolean);
    const averageRating = rows.length > 0
        ? Math.round((rows.reduce((sum, row) => sum + Number(row.rating || 0), 0) / rows.length) * 10) / 10
        : Number(product.averageRating || 0);

    const strengths = collectSignals(comments, POSITIVE_SIGNALS);
    const concerns = collectSignals(comments, NEGATIVE_SIGNALS);
    const recentComments = comments.slice(0, 3);

    let summary = `${product.name} icin ${rows.length} degerlendirme var. Ortalama puan ${averageRating.toFixed(1)}/5.`;
    if (strengths.length > 0) {
        summary += ` Kullananlar en cok ${strengths.join(', ')} tarafini ovuyor.`;
    }
    if (concerns.length > 0) {
        summary += ` En sik dikkat ceken cekince alanlari: ${concerns.join(', ')}.`;
    }
    if (rows.length === 0) {
        summary = `${product.name} icin henuz kullanici yorumu yok. Bu nedenle puan ve yorum bazli net bir yonlendirme yapamam.`;
    }

    return {
        averageRating,
        totalReviews: rows.length,
        summary,
        strengths,
        concerns,
        recentComments
    };
};

module.exports = {
    summarizeProductReviews
};
