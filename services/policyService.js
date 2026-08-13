const pool = require('../config/db');

const POLICY_TOPIC_CONFIG = Object.freeze({
    returns: Object.freeze({ title: 'İade ve değişim', envKey: 'RETURNS' }),
    privacy: Object.freeze({ title: 'Gizlilik', envKey: 'PRIVACY' }),
    kvkk: Object.freeze({ title: 'KVKK aydınlatma', envKey: 'KVKK' }),
    payment: Object.freeze({ title: 'Ödeme koşulları', envKey: 'PAYMENT' }),
    shipping: Object.freeze({ title: 'Kargo ve teslimat', envKey: 'SHIPPING' })
});

const exactTrue = (value) => String(value || '').trim().toLowerCase() === 'true';

const detectPolicyTopic = (message) => {
    const text = String(message || '').toLocaleLowerCase('tr-TR');
    if (/kvkk|aydınlatma|aydinlatma/.test(text)) return 'kvkk';
    if (/gizlilik|privacy/.test(text)) return 'privacy';
    if (/iade|değişim|degisim|iptal|refund|return/.test(text)) return 'returns';
    if (/ödeme|odeme|kart|3d|havale|eft/.test(text)) return 'payment';
    if (/teslim|kargo|shipment|cargo/.test(text)) return 'shipping';
    if (/kampanya|kupon|indirim/.test(text)) return 'campaigns';
    return null;
};

const getActiveCoupons = async () => {
    try {
        const result = await pool.query(
            `SELECT code, discount_type, discount_value, min_order_amount, max_discount_amount
             FROM coupons
             WHERE is_active = TRUE
               AND (starts_at IS NULL OR starts_at <= NOW())
               AND (ends_at IS NULL OR ends_at >= NOW())
               AND (usage_limit IS NULL OR used_count < usage_limit)
             ORDER BY created_at DESC
             LIMIT 5`
        );
        return result.rows;
    } catch (_) {
        return [];
    }
};

const getApprovedPolicyContent = (topic, env = process.env) => {
    const config = POLICY_TOPIC_CONFIG[topic];
    if (!config) return null;
    const prefix = `NOVASTORE_POLICY_${config.envKey}`;
    const approved = exactTrue(env[`${prefix}_APPROVED`]);
    const version = String(env[`${prefix}_VERSION`] || '').trim();
    const text = String(env[`${prefix}_TEXT`] || '').trim();

    if (
        !approved ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(version) ||
        !text ||
        text.length > 8000 ||
        /[\u0000\u000b\u000c\u007f]/.test(text)
    ) {
        return null;
    }
    return Object.freeze({ title: config.title, version, text });
};

const unpublishedPolicyAnswer = (topic) => ({
    topic,
    title: POLICY_TOPIC_CONFIG[topic]?.title || 'Politika bilgisi',
    answer: 'Bu konuya ait şirket ve hukuk onaylı metin henüz yayımlanmadı. Destek ekibi doğrulanmamış süre, koşul veya şirket bilgisi taahhüt edemez.',
    published: false,
    contentVersion: null,
    requiresLegalCompanyInput: true
});

const getPolicyAnswer = async (message, { env = process.env } = {}) => {
    const topic = detectPolicyTopic(message);

    if (topic === 'campaigns') {
        const coupons = await getActiveCoupons();
        if (coupons.length === 0) {
            return {
                topic,
                title: 'Kampanyalar',
                answer: 'Şu anda doğrulanmış aktif kupon bilgisi bulunmuyor. Kupon uygunluğu ve net toplam yalnız sunucu tarafındaki sepet doğrulamasında kesinleşir.',
                published: true,
                contentVersion: 'live-coupon-query'
            };
        }

        const couponText = coupons.map((coupon) => {
            const type = String(coupon.discount_type || '').toUpperCase() === 'PERCENT'
                ? `%${Number(coupon.discount_value).toFixed(0)} indirim`
                : `${Number(coupon.discount_value).toFixed(2)} TL indirim`;
            const minAmount = Number(coupon.min_order_amount || 0);
            return `${coupon.code}: ${type}${minAmount > 0 ? `, min sepet ${minAmount.toFixed(0)} TL` : ''}`;
        }).join(' | ');

        return {
            topic,
            title: 'Kampanyalar',
            answer: `Doğrulanmış aktif kuponlar: ${couponText}. Kesin uygunluk ve tutar sepet doğrulamasında belirlenir.`,
            published: true,
            contentVersion: 'live-coupon-query'
        };
    }

    if (topic && POLICY_TOPIC_CONFIG[topic]) {
        const approved = getApprovedPolicyContent(topic, env);
        if (!approved) return unpublishedPolicyAnswer(topic);
        return {
            topic,
            title: approved.title,
            answer: approved.text,
            published: true,
            contentVersion: approved.version,
            requiresLegalCompanyInput: false
        };
    }

    return {
        topic: null,
        title: 'Genel bilgi',
        answer: 'Ürün veya kampanya konusunda yardımcı olabilirim. İade, teslimat, ödeme, gizlilik ve KVKK metinleri yalnız şirket ve hukuk onayıyla yayımlanır.',
        published: false,
        contentVersion: null
    };
};

module.exports = {
    POLICY_TOPIC_CONFIG,
    detectPolicyTopic,
    exactTrue,
    getApprovedPolicyContent,
    getPolicyAnswer,
    unpublishedPolicyAnswer
};
