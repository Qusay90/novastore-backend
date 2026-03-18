const ORDER_STATUS = Object.freeze({
    ONAY_BEKLIYOR: 'Onay Bekliyor',
    HAZIRLANIYOR: 'Haz\u0131rlan\u0131yor',
    KARGOYA_VERILDI: 'Kargoya Verildi',
    TESLIM_EDILDI: 'Teslim Edildi',
    IPTAL_EDILDI: '\u0130ptal Edildi',
    IADE_EDILDI: '\u0130ade Edildi'
});

const PAYMENT_STATUS = Object.freeze({
    PENDING: 'PENDING',
    REQUIRES_ACTION: 'REQUIRES_ACTION',
    WAITING_TRANSFER: 'WAITING_TRANSFER',
    PAID: 'PAID',
    FAILED: 'FAILED',
    REFUNDED: 'REFUNDED'
});

const REFUND_STATUS = Object.freeze({
    NONE: 'NONE',
    REQUESTED: 'REQUESTED',
    IN_REVIEW: 'IN_REVIEW',
    APPROVED: 'APPROVED',
    PENDING: 'PENDING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    REJECTED: 'REJECTED'
});

const SHIPMENT_STATUS = Object.freeze({
    NONE: 'NONE',
    CREATED: 'CREATED',
    IN_TRANSIT: 'IN_TRANSIT',
    DELIVERED: 'DELIVERED',
    RETURNED: 'RETURNED'
});

const normalizeStatus = (value = '') => String(value)
    .replace(/\u0130/g, 'I')
    .replace(/\u0131/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const STATUS_LOOKUP = new Map();
Object.values(ORDER_STATUS).forEach((status) => {
    STATUS_LOOKUP.set(normalizeStatus(status), status);
});

STATUS_LOOKUP.set('onay_bekliyor', ORDER_STATUS.ONAY_BEKLIYOR);
STATUS_LOOKUP.set('hazirlaniyor', ORDER_STATUS.HAZIRLANIYOR);
STATUS_LOOKUP.set('kargoya_verildi', ORDER_STATUS.KARGOYA_VERILDI);
STATUS_LOOKUP.set('teslim_edildi', ORDER_STATUS.TESLIM_EDILDI);
STATUS_LOOKUP.set('iptal_edildi', ORDER_STATUS.IPTAL_EDILDI);
STATUS_LOOKUP.set('iade_edildi', ORDER_STATUS.IADE_EDILDI);

const resolveOrderStatus = (statusValue) => STATUS_LOOKUP.get(normalizeStatus(statusValue)) || null;

module.exports = {
    ORDER_STATUS,
    PAYMENT_STATUS,
    REFUND_STATUS,
    SHIPMENT_STATUS,
    resolveOrderStatus,
    normalizeStatus
};
