const {
    ORDER_STATUS,
    PAYMENT_STATUS,
    REFUND_STATUS,
    resolveOrderStatus
} = require('../constants/orderStatus');

const ORDER_COMMAND = Object.freeze({
    PAYMENT_SUCCESS: 'payment_success',
    PAYMENT_FAILURE: 'payment_failure',
    CANCEL: 'cancel',
    SHIPMENT_CREATE: 'shipment_create',
    DELIVERY_CONFIRM: 'delivery_confirm',
    RETURN_COMPLETE: 'return_complete'
});

const ORDER_TRANSITION_MATRIX = Object.freeze({
    [ORDER_COMMAND.PAYMENT_SUCCESS]: Object.freeze([
        Object.freeze([ORDER_STATUS.ODEME_BEKLIYOR, ORDER_STATUS.HAZIRLANIYOR])
    ]),
    [ORDER_COMMAND.PAYMENT_FAILURE]: Object.freeze([
        Object.freeze([ORDER_STATUS.ODEME_BEKLIYOR, ORDER_STATUS.IPTAL_EDILDI])
    ]),
    [ORDER_COMMAND.CANCEL]: Object.freeze([
        Object.freeze([ORDER_STATUS.ODEME_BEKLIYOR, ORDER_STATUS.IPTAL_EDILDI]),
        Object.freeze([ORDER_STATUS.ONAY_BEKLIYOR, ORDER_STATUS.IPTAL_EDILDI]),
        Object.freeze([ORDER_STATUS.HAZIRLANIYOR, ORDER_STATUS.IPTAL_EDILDI])
    ]),
    [ORDER_COMMAND.SHIPMENT_CREATE]: Object.freeze([
        Object.freeze([ORDER_STATUS.HAZIRLANIYOR, ORDER_STATUS.KARGOYA_VERILDI])
    ]),
    [ORDER_COMMAND.DELIVERY_CONFIRM]: Object.freeze([
        Object.freeze([ORDER_STATUS.KARGOYA_VERILDI, ORDER_STATUS.TESLIM_EDILDI])
    ]),
    [ORDER_COMMAND.RETURN_COMPLETE]: Object.freeze([
        Object.freeze([ORDER_STATUS.TESLIM_EDILDI, ORDER_STATUS.IADE_EDILDI])
    ])
});

const STATUS_COMMAND_OWNER = Object.freeze({
    [ORDER_STATUS.ODEME_BEKLIYOR]: 'payment',
    [ORDER_STATUS.ONAY_BEKLIYOR]: 'payment',
    [ORDER_STATUS.HAZIRLANIYOR]: 'payment',
    [ORDER_STATUS.KARGOYA_VERILDI]: 'shipment',
    [ORDER_STATUS.TESLIM_EDILDI]: 'delivery',
    [ORDER_STATUS.IPTAL_EDILDI]: 'cancel',
    [ORDER_STATUS.IADE_EDILDI]: 'return'
});

const STOCK_RESERVATION_STATE = Object.freeze({
    RESERVED: 'reserved',
    UNRESERVED: 'unreserved',
    RELEASED: 'released',
    UNKNOWN: 'unknown'
});

class OrderLifecycleError extends Error {
    constructor(message, { code, statusCode = 409, details = null } = {}) {
        super(message);
        this.name = 'OrderLifecycleError';
        this.code = code || 'ORDER_LIFECYCLE_CONFLICT';
        this.statusCode = statusCode;
        this.details = details;
    }
}

const safeJsonObject = (value) => {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
};

const getStockReservationState = (payment = {}) => {
    const rawRequest = safeJsonObject(payment.raw_request);
    if (rawRequest.stockReserved === true) return STOCK_RESERVATION_STATE.RESERVED;
    if (rawRequest.stockReserved === false && (
        rawRequest.stockReleasedAt ||
        rawRequest.stockReleaseReason ||
        rawRequest.stockReleaseCommand
    )) {
        return STOCK_RESERVATION_STATE.RELEASED;
    }
    if (rawRequest.stockReserved === false) return STOCK_RESERVATION_STATE.UNRESERVED;
    return STOCK_RESERVATION_STATE.UNKNOWN;
};

const assertTransition = ({ command, currentStatus, nextStatus }) => {
    const current = resolveOrderStatus(currentStatus);
    const next = resolveOrderStatus(nextStatus);
    const allowed = ORDER_TRANSITION_MATRIX[command] || [];
    if (!current || !next || !allowed.some(([from, to]) => from === current && to === next)) {
        throw new OrderLifecycleError('Sipariş durum geçişine bu komut için izin verilmiyor.', {
            code: 'ORDER_TRANSITION_NOT_ALLOWED',
            details: { command, currentStatus: current || null, nextStatus: next || null }
        });
    }
    return Object.freeze({ command, currentStatus: current, nextStatus: next });
};

const evaluateGenericStatusRequest = ({ currentStatus, requestedStatus, expectedStatus }) => {
    const current = resolveOrderStatus(currentStatus);
    const requested = resolveOrderStatus(requestedStatus);
    const expectedProvided = expectedStatus !== undefined && expectedStatus !== null && String(expectedStatus).trim() !== '';
    const expected = expectedProvided ? resolveOrderStatus(expectedStatus) : null;

    if (!current) {
        throw new OrderLifecycleError('Mevcut sipariş durumu tanınmıyor; manuel inceleme gerekli.', {
            code: 'ORDER_CURRENT_STATUS_UNKNOWN'
        });
    }
    if (!requested) {
        throw new OrderLifecycleError('İstenen sipariş durumu geçersiz.', {
            code: 'ORDER_STATUS_INVALID',
            statusCode: 400
        });
    }
    if (expectedProvided && !expected) {
        throw new OrderLifecycleError('Beklenen sipariş durumu geçersiz.', {
            code: 'ORDER_EXPECTED_STATUS_INVALID',
            statusCode: 400
        });
    }
    if (expected && expected !== current) {
        throw new OrderLifecycleError('Sipariş durumu başka bir işlem tarafından değiştirildi.', {
            code: 'ORDER_STATUS_CONFLICT',
            details: { expectedStatus: expected, currentStatus: current }
        });
    }
    if (requested === current) {
        return Object.freeze({ reused: true, currentStatus: current, requestedStatus: requested });
    }
    throw new OrderLifecycleError('Sipariş durumu genel güncelleme yolundan değiştirilemez; ilgili özel operasyon akışını kullanın.', {
        code: 'ORDER_STATUS_COMMAND_REQUIRED',
        details: {
            currentStatus: current,
            requestedStatus: requested,
            commandOwner: STATUS_COMMAND_OWNER[requested] || 'unknown'
        }
    });
};

const isProviderPending = (payment = {}) => {
    const provider = String(payment.provider || '').trim().toLowerCase();
    const status = String(payment.status || '').trim().toUpperCase();
    return ['paytr', 'iyzico'].includes(provider) && [
        PAYMENT_STATUS.PENDING,
        PAYMENT_STATUS.REQUIRES_ACTION
    ].includes(status);
};

const selectCancellationPayments = ({ order, payments }) => {
    const rows = Array.isArray(payments) ? payments : [];
    const activePaymentRef = String(order?.payment_ref || '').trim();
    if (!activePaymentRef) return rows;

    const activeRows = rows.filter((payment) => (
        String(payment?.payment_ref || '').trim() === activePaymentRef
    ));
    if (activeRows.length === 0) {
        throw new OrderLifecycleError('Siparişin aktif ödeme kaydı bulunamadı.', {
            code: 'ORDER_ACTIVE_PAYMENT_NOT_FOUND'
        });
    }

    const inactiveConflicts = rows.filter((payment) => {
        if (String(payment?.payment_ref || '').trim() === activePaymentRef) return false;
        const status = String(payment?.status || '').trim().toUpperCase();
        const reservationState = getStockReservationState(payment);
        const safelyTerminal = [PAYMENT_STATUS.FAILED, PAYMENT_STATUS.REFUNDED].includes(status);
        return isProviderPending(payment) ||
            !safelyTerminal ||
            reservationState === STOCK_RESERVATION_STATE.RESERVED ||
            reservationState === STOCK_RESERVATION_STATE.UNKNOWN;
    });
    if (inactiveConflicts.length > 0) {
        throw new OrderLifecycleError('Siparişte aktif olmayan ancak sonuçlanmamış veya stok kanıtı belirsiz ödeme kaydı var.', {
            code: 'ORDER_PAYMENT_HISTORY_CONFLICT',
            details: {
                paymentIds: inactiveConflicts.map((payment) => Number(payment.id)).filter(Number.isInteger)
            }
        });
    }

    return activeRows;
};

const validateCancelledOrderIdempotency = ({ payments }) => {
    const rows = Array.isArray(payments) ? payments : [];
    if (rows.length === 0) {
        throw new OrderLifecycleError('İptal edilmiş siparişin ödeme/stok kanıtı bulunamadı.', {
            code: 'ORDER_CANCELLED_STATE_UNVERIFIED'
        });
    }
    if (rows.some(isProviderPending)) {
        throw new OrderLifecycleError('İptal edilmiş siparişte sağlayıcı sonucu hâlâ bekleniyor; mutabakat gerekli.', {
            code: 'ORDER_CANCELLED_PAYMENT_STILL_PENDING'
        });
    }
    const states = rows.map(getStockReservationState);
    if (states.includes(STOCK_RESERVATION_STATE.RESERVED)) {
        throw new OrderLifecycleError('İptal edilmiş siparişte aktif stok rezervasyonu bulundu.', {
            code: 'ORDER_CANCELLED_STOCK_STILL_RESERVED'
        });
    }
    if (states.includes(STOCK_RESERVATION_STATE.UNKNOWN)) {
        throw new OrderLifecycleError('İptal edilmiş siparişin stok serbest bırakma kanıtı eksik.', {
            code: 'ORDER_CANCELLED_STATE_UNVERIFIED'
        });
    }
    return Object.freeze({ reused: true });
};

const planOrderCancellation = ({ order, payments }) => {
    const currentStatus = resolveOrderStatus(order?.status);
    if (!currentStatus) {
        throw new OrderLifecycleError('Sipariş durumu tanınmıyor; iptal için manuel inceleme gerekli.', {
            code: 'ORDER_CURRENT_STATUS_UNKNOWN'
        });
    }
    assertTransition({
        command: ORDER_COMMAND.CANCEL,
        currentStatus,
        nextStatus: ORDER_STATUS.IPTAL_EDILDI
    });

    const rows = Array.isArray(payments) ? payments : [];
    if (rows.length === 0) {
        throw new OrderLifecycleError('Stok rezervasyonunu doğrulayacak ödeme kaydı bulunamadı.', {
            code: 'ORDER_STOCK_RESERVATION_UNKNOWN'
        });
    }
    if (rows.some(isProviderPending)) {
        throw new OrderLifecycleError('Sağlayıcı sonucu beklenen ödeme güvenle iptal edilemez; ödeme sonucu veya mutabakat beklenmelidir.', {
            code: 'ORDER_PAYMENT_PENDING_CANCELLATION_BLOCKED'
        });
    }

    const classified = rows.map((payment) => ({
        payment,
        reservationState: getStockReservationState(payment)
    }));
    if (classified.some(({ reservationState }) => reservationState === STOCK_RESERVATION_STATE.UNKNOWN)) {
        throw new OrderLifecycleError('Stok rezervasyon kanıtı eksik; sipariş manuel incelemeye alınmalıdır.', {
            code: 'ORDER_STOCK_RESERVATION_UNKNOWN'
        });
    }
    if (classified.some(({ reservationState }) => reservationState === STOCK_RESERVATION_STATE.RELEASED)) {
        throw new OrderLifecycleError('Stok daha önce serbest bırakılmış ancak sipariş iptal durumunda değil.', {
            code: 'ORDER_STOCK_RELEASE_STATE_CONFLICT'
        });
    }

    const reserved = classified.filter(({ reservationState }) => reservationState === STOCK_RESERVATION_STATE.RESERVED);
    if (reserved.length > 1) {
        throw new OrderLifecycleError('Birden fazla aktif stok rezervasyonu bulundu; manuel mutabakat gerekli.', {
            code: 'ORDER_MULTIPLE_STOCK_RESERVATIONS'
        });
    }

    const hasPaidPayment = rows.some((payment) => payment.status === PAYMENT_STATUS.PAID);
    const hasRefundedPayment = rows.some((payment) => payment.status === PAYMENT_STATUS.REFUNDED);
    if (hasPaidPayment && reserved.length !== 1) {
        throw new OrderLifecycleError('Tahsil edilmiş siparişin aktif stok rezervasyonu doğrulanamadı.', {
            code: 'ORDER_PAID_STOCK_RESERVATION_MISSING'
        });
    }
    return Object.freeze({
        currentStatus,
        refundStatus: hasPaidPayment
            ? REFUND_STATUS.PENDING
            : hasRefundedPayment
                ? REFUND_STATUS.COMPLETED
                : REFUND_STATUS.NONE,
        releasePayment: reserved[0]?.payment || null
    });
};

module.exports = {
    ORDER_COMMAND,
    ORDER_TRANSITION_MATRIX,
    STATUS_COMMAND_OWNER,
    STOCK_RESERVATION_STATE,
    OrderLifecycleError,
    assertTransition,
    evaluateGenericStatusRequest,
    getStockReservationState,
    isProviderPending,
    planOrderCancellation,
    safeJsonObject,
    selectCancellationPayments,
    validateCancelledOrderIdempotency
};
