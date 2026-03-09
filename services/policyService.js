const pool = require('../config/db');

const POLICY_COPY = {
    returns: {
        title: 'Iade politikasi',
        body: [
            'Teslim tarihinden itibaren 14 gun icinde iade talebi olusturulabilir.',
            'Urunun kullanilmamis, tekrar satilabilir durumda ve orijinal ambalajinda olmasi gerekir.',
            'Onaylanan iade odemeleri banka surecine gore genelde 1-3 is gunu icinde tamamlanir.'
        ]
    },
    privacy: {
        title: 'Gizlilik sozlesmesi',
        body: [
            'Uyelik ve siparis surecinde paylasilan veriler hizmet sunmak, teslimat ve destek surecini yonetmek icin kullanilir.',
            'Veriler operasyon ve yasal yukumlulukler disinda paylasilmaz.'
        ]
    },
    kvkk: {
        title: 'KVKK aydinlatma',
        body: [
            'Kisisel veriler siparis yonetimi, faturalama, teslimat ve musteri destegi amaclariyla islenir.',
            'Yasal saklama sureleri sonunda veriler guvenli sekilde silinir, yok edilir veya anonim hale getirilir.'
        ]
    },
    payment: {
        title: 'Odeme',
        body: [
            'Sitede kart odemesi ve havale/EFT secenegi bulunur.',
            'Kart odemeleri 3D dogrulama adimina yonlendirilir.',
            'Havale secilirse siparis numarasini aciklama alanina eklemek gerekir ve odeme 24 saat icinde onaylanmazsa siparis iptal edilebilir.'
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
            answer: `Varsayilan kargo partneri ${defaultProvider}. ${freeShippingThreshold.toFixed(0)} TL ve uzeri siparislerde kargo ucretsiz, bunun altinda varsayilan kargo ucreti ${defaultShippingFee.toFixed(2)} TL. Sistem tarafinda tahmini teslimat 2-3 is gunu olarak yonetiliyor.`
        };
    }

    if (topic === 'campaigns') {
        const coupons = await getActiveCoupons();
        if (coupons.length === 0) {
            return {
                topic,
                title: 'Kampanyalar',
                answer: 'Su anda dogrulanmis aktif kupon bilgisi goremiyorum. Sepette kupon kodu alanina kod girerek kontrol etmek en guvenli yontem olur.'
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
            answer: `Dogrulanmis aktif kuponlar: ${couponText}. Sepette uygulayip net toplam etkisini gorebilirsiniz.`
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
        answer: 'Urun, kargo, iade, odeme, kampanya veya KVKK konularindan birini yazarsaniz dogrudan net bilgi verebilirim.'
    };
};

module.exports = {
    detectPolicyTopic,
    getPolicyAnswer
};
