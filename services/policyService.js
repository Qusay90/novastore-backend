const pool = require('../config/db');

const POLICY_COPY = {
    returns: {
        title: 'İade politikası',
        body: [
            'Teslim tarihinden itibaren 14 gün içinde iade talebi oluşturulabilir.',
            'Ürünün kullanılmamış, tekrar satılabilir durumda ve orijinal ambalajında olması gerekir.',
            'Onaylanan iade ödemeleri banka sürecine göre genelde 1-3 iş günü içinde tamamlanır.'
        ]
    },
    privacy: {
        title: 'Gizlilik sözleşmesi',
        body: [
            'Üyelik ve sipariş sürecinde paylaşılan veriler hizmet sunmak, teslimat ve destek sürecini yönetmek için kullanılır.',
            'Veriler operasyon ve yasal yükümlülükler dışında paylaşılmaz.'
        ]
    },
    kvkk: {
        title: 'KVKK aydınlatma',
        body: [
            'Kişisel veriler sipariş yönetimi, faturalama, teslimat ve müşteri desteği amaçlarıyla işlenir.',
            'Yasal saklama süreleri sonunda veriler güvenli şekilde silinir, yok edilir veya anonim hale getirilir.'
        ]
    },
    payment: {
        title: 'Ödeme',
        body: [
            'Sitede kart ödemesi ve havale/EFT seçeneği bulunur.',
            'Kart ödemeleri 3D doğrulama adımına yönlendirilir.',
            'Havale seçilirse sipariş numarasını açıklama alanına eklemek gerekir ve ödeme 24 saat içinde onaylanmazsa sipariş iptal edilebilir.'
        ]
    }
};

const detectPolicyTopic = (message) => {
    const text = String(message || '').toLowerCase();
    if (/kvkk|aydinlatma/.test(text)) return 'kvkk';
    if (/gizlilik|privacy/.test(text)) return 'privacy';
    if (/iade|iptal|refund|return/.test(text)) return 'returns';
    if (/odeme|kart|3d|havale|eft/.test(text)) return 'payment';
    if (/teslim|kargo|shipment|cargo/.test(text)) return 'shipping';
    if (/kampanya|kupon|indirim/.test(text)) return 'campaigns';
    return null;
};

const getConfigMap = async () => {
    try {
        const result = await pool.query('SELECT key, value FROM campaign_configs');
        return result.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
    } catch (_) {
        return {};
    }
};

const getActiveCoupons = async () => {
    try {
        const result = await pool.query(
            `SELECT code, discount_type, discount_value, min_order_amount, max_discount_amount
             FROM coupons
             WHERE is_active = TRUE
               AND (starts_at IS NULL OR starts_at <= NOW())
               AND (ends_at IS NULL OR ends_at >= NOW())
             ORDER BY created_at DESC
             LIMIT 5`
        );
        return result.rows;
    } catch (_) {
        return [];
    }
};

const getPolicyAnswer = async (message) => {
    const topic = detectPolicyTopic(message);
    const config = await getConfigMap();
    const freeShippingThreshold = Number(config.FREE_SHIPPING_THRESHOLD || process.env.FREE_SHIPPING_THRESHOLD || 1500);
    const defaultShippingFee = Number(config.DEFAULT_SHIPPING_FEE || process.env.DEFAULT_SHIPPING_FEE || 49.9);
    const defaultProvider = process.env.DEFAULT_SHIPMENT_PROVIDER || 'Yurtici Kargo';

    if (topic === 'shipping') {
        return {
            topic,
            title: 'Kargo ve teslimat',
            answer: `Varsayılan kargo partneri ${defaultProvider}. ${freeShippingThreshold.toFixed(0)} TL ve üzeri siparişlerde kargo ücretsiz, bunun altında varsayılan kargo ücreti ${defaultShippingFee.toFixed(2)} TL. Sistem tarafında tahmini teslimat 2-3 iş günü olarak yönetiliyor.`
        };
    }

    if (topic === 'campaigns') {
        const coupons = await getActiveCoupons();
        if (coupons.length === 0) {
            return {
                topic,
                title: 'Kampanyalar',
                answer: 'Şu anda doğrulanmış aktif kupon bilgisi göremiyorum. Sepette kupon kodu alanına kod girerek kontrol etmek en güvenli yöntem olur.'
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
            answer: `Doğrulanmış aktif kuponlar: ${couponText}. Sepette uygulayıp net toplam etkisini görebilirsiniz.`
        };
    }

    if (topic && POLICY_COPY[topic]) {
        return {
            topic,
            title: POLICY_COPY[topic].title,
            answer: POLICY_COPY[topic].body.join(' ')
        };
    }

    return {
        topic: null,
        title: 'Genel bilgi',
        answer: 'Ürün, kargo, iade, ödeme, kampanya veya KVKK konularından birini yazarsanız doğrudan net bilgi verebilirim.'
    };
};

module.exports = {
    detectPolicyTopic,
    getPolicyAnswer
};
