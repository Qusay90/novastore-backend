const pool = require('../config/db');

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const toNumericMap = (rows) => {
    const map = new Map();
    rows.forEach((row) => map.set(Number(row.id), row));
    return map;
};

const readCartProductId = (item, index) => {
    const suppliedIds = ['id', 'product_id', 'productId']
        .filter((field) => Object.prototype.hasOwnProperty.call(item, field))
        .map((field) => ({ field, value: item[field] }))
        .filter(({ value }) => value !== undefined && value !== null && value !== '');

    if (suppliedIds.length === 0) {
        throw new Error(`Geçersiz ürün kimliği (index ${index}).`);
    }

    const numericIds = suppliedIds.map(({ field, value }) => {
        const numeric = Number(value);
        if (!Number.isInteger(numeric) || numeric <= 0) {
            throw new Error(`Geçersiz ürün kimliği (${field}, index ${index}).`);
        }
        return numeric;
    });

    if (new Set(numericIds).size > 1) {
        throw new Error(`Çelişkili ürün kimliği alanları (index ${index}).`);
    }

    return numericIds[0];
};

const normalizeCartItems = (cartItems) => {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
        throw new Error('Sepet boş olamaz.');
    }

    return cartItems.map((item, index) => {
        const productId = readCartProductId(item, index);
        const quantity = Number(item.quantity || 1);

        if (!Number.isInteger(productId) || productId <= 0) {
            throw new Error(`Geçersiz ürün kimliği (index ${index}).`);
        }
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new Error(`Geçersiz ürün adedi (ürün ${productId}).`);
        }

        return {
            id: productId,
            quantity,
            image: item.image || item.image_url || item.imageUrl || null,
            nameHint: item.name || null
        };
    });
};

const loadProductsForCart = async (cartItems, client = pool) => {
    const normalized = normalizeCartItems(cartItems);
    const ids = [...new Set(normalized.map((item) => item.id))];

    const result = await client.query(
        `SELECT id, name, price, old_price, stock, image_url
         FROM products
         WHERE id = ANY($1::int[])`,
        [ids]
    );

    const productMap = toNumericMap(result.rows);

    if (productMap.size !== ids.length) {
        throw new Error('Sepetteki bazı ürünler bulunamadı.');
    }

    return { normalized, productMap };
};

const resolveCoupon = async (couponCode, subtotal, client = pool) => {
    if (!couponCode || !couponCode.trim()) {
        return { applied: false, code: null, discountAmount: 0, reason: null, couponId: null };
    }

    const code = couponCode.trim().toUpperCase();
    const result = await client.query(
        `SELECT *
         FROM coupons
         WHERE code = $1
           AND is_active = TRUE
           AND (starts_at IS NULL OR starts_at <= NOW())
           AND (ends_at IS NULL OR ends_at >= NOW())`,
        [code]
    );

    if (result.rows.length === 0) {
        return { applied: false, code, discountAmount: 0, reason: 'Kupon bulunamadı veya aktif değil.', couponId: null };
    }

    const coupon = result.rows[0];

    if (coupon.usage_limit !== null && Number(coupon.used_count) >= Number(coupon.usage_limit)) {
        return { applied: false, code, discountAmount: 0, reason: 'Kupon kullanım limiti dolmuş.', couponId: coupon.id };
    }

    const minAmount = Number(coupon.min_order_amount || 0);
    if (subtotal < minAmount) {
        return {
            applied: false,
            code,
            discountAmount: 0,
            reason: `Bu kupon için minimum sepet tutarı ${minAmount.toFixed(2)} TL.`,
            couponId: coupon.id
        };
    }

    let discountAmount = 0;
    const discountType = String(coupon.discount_type || '').toUpperCase();
    const discountValue = Number(coupon.discount_value || 0);

    if (discountType === 'PERCENT') {
        discountAmount = subtotal * (discountValue / 100);
    } else {
        discountAmount = discountValue;
    }

    if (coupon.max_discount_amount !== null) {
        discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
    }

    discountAmount = Math.max(0, round2(discountAmount));

    return {
        applied: discountAmount > 0,
        code,
        discountAmount,
        reason: discountAmount > 0 ? null : 'Kupon indirimi uygulanamadı.',
        couponId: coupon.id
    };
};

const calculatePricing = async ({ cartItems, couponCode = null, client = pool }) => {
    const { normalized, productMap } = await loadProductsForCart(cartItems, client);

    let subtotal = 0;
    let totalQuantity = 0;

    const pricedItems = normalized.map((cartItem) => {
        const product = productMap.get(cartItem.id);
        const unitPrice = Number(product.price);

        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            throw new Error(`Ürün fiyat verisi geçersiz (${product.id}).`);
        }

        if (Number(product.stock) < cartItem.quantity) {
            throw new Error(`${product.name} için yeterli stok yok.`);
        }

        const lineTotal = round2(unitPrice * cartItem.quantity);
        subtotal = round2(subtotal + lineTotal);
        totalQuantity += cartItem.quantity;

        return {
            id: Number(product.id),
            name: product.name,
            quantity: cartItem.quantity,
            price: unitPrice,
            old_price: product.old_price !== null ? Number(product.old_price) : null,
            image: cartItem.image || product.image_url || '',
            line_total: lineTotal
        };
    });

    const uniqueProductCount = pricedItems.length;
    const rawBundleDiscount = uniqueProductCount >= 2 && totalQuantity >= 3
        ? round2(Math.min(subtotal * 0.05, 300))
        : 0;

    const coupon = await resolveCoupon(couponCode, subtotal, client);

    const preShippingTotal = round2(Math.max(0, subtotal - rawBundleDiscount - coupon.discountAmount));

    const freeShippingThreshold = Number(process.env.FREE_SHIPPING_THRESHOLD || 1500);
    const defaultShippingFee = Number(process.env.DEFAULT_SHIPPING_FEE || 49.9);
    const shippingFee = preShippingTotal >= freeShippingThreshold ? 0 : round2(defaultShippingFee);

    const total = round2(preShippingTotal + shippingFee);

    return {
        items: pricedItems,
        totals: {
            currency: 'TRY',
            subtotal,
            bundleDiscount: rawBundleDiscount,
            couponDiscount: coupon.discountAmount,
            shippingFee,
            total
        },
        coupon,
        campaigns: {
            freeShippingThreshold,
            freeShippingApplied: shippingFee === 0,
            bundleApplied: rawBundleDiscount > 0
        }
    };
};

module.exports = {
    round2,
    normalizeCartItems,
    loadProductsForCart,
    calculatePricing
};
