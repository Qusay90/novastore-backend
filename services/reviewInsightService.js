const pool = require('../config/db');
const { normalizeSearchText } = require('./catalogSearchService');

const POSITIVE_SIGNALS = [
    { key: 'kalite', label: 'kalite' },
    { key: 'hizli', label: 'hızlı teslimat veya kullanım' },
    { key: 'rahat', label: 'rahat kullanım' },
    { key: 'guzel', label: 'tasarım ve genel memnuniyet' },
    { key: 'performans', label: 'performans' },
    { key: 'fiyat performans', label: 'fiyat performans dengesi' },
    { key: 'memnun', label: 'genel memnuniyet' }
];

const NEGATIVE_SIGNALS = [
    { key: 'yavas', label: 'beklenen hız veya akıcılık' },
    { key: 'isindi', label: 'ısınma' },
    { key: 'agir', label: 'ağırlık veya taşınabilirlik' },
    { key: 'pahali', label: 'fiyat algısı' },
    { key: 'sorun', label: 'teknik sorun' },
    { key: 'eksik', label: 'beklenti eksiği' },
    { key: 'iade', label: 'iade ihtiyacı' }
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
            summary: 'Yorum özeti çıkarmak için ürün bilgisi eksik.',
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

    let summary = `${product.name} için ${rows.length} değerlendirme var. Ortalama puan ${averageRating.toFixed(1)}/5.`;
    if (strengths.length > 0) {
        summary += ` Kullananlar en çok ${strengths.join(', ')} tarafını övüyor.`;
    }
    if (concerns.length > 0) {
        summary += ` En sık dikkat çeken çekince alanları: ${concerns.join(', ')}.`;
    }
    if (rows.length === 0) {
        summary = `${product.name} için henüz kullanıcı yorumu yok. Bu nedenle puan ve yorum bazlı net bir yönlendirme yapamam.`;
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
