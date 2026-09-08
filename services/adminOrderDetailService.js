'use strict';

// Order creation copies these values from the owned checkout address. Never
// join customer_addresses/users here: those rows can change after checkout.
const snapshotText = (value) => typeof value === 'string' && value.trim() ? value : null;

const toAdminOrderDetail = (row) => {
    const deliveryRecipient = {
        name: snapshotText(row.customer_name),
        phone: snapshotText(row.phone),
        addressLine: snapshotText(row.address),
        cityOrProvince: null,
        district: null,
        postalCode: null,
        note: null,
        source: 'order_snapshot',
        locationFormat: 'embedded_in_address_line'
    };
    return {
        id: Number(row.id),
        status: row.status,
        paymentStatus: row.payment_status,
        refundStatus: row.refund_status,
        shipmentStatus: row.shipment_status,
        deliveryRecipient,
        missingDeliveryFields: ['name', 'phone', 'addressLine'].filter((field) => !deliveryRecipient[field])
    };
};

const createGetAdminOrderDetail = (database) => async (req, res) => {
    // Same current-Admin authority as the order summary, also enforced by the
    // route middleware. No Customer/store selector grants disclosure authority.
    if (!req.currentAdmin) return res.status(403).json({ code: 'ADMIN_REQUIRED', error: 'Güncel yönetici yetkisi gerekli.' });
    const rawId = String(req.params?.id || '');
    if (!/^[1-9]\d{0,9}$/.test(rawId) || Number(rawId) > 2147483647 || Object.keys(req.query || {}).length) {
        return res.status(400).json({ code: 'ADMIN_ORDER_ID_INVALID', error: 'Geçerli tek bir sipariş kimliği gerekli.' });
    }
    try {
        const result = await database.query(
            `SELECT id, status, payment_status, refund_status, shipment_status,
                    customer_name, phone, address
               FROM orders WHERE id = $1`,
            [Number(rawId)]
        );
        if (!result.rows[0]) return res.status(404).json({ code: 'ADMIN_ORDER_NOT_FOUND', error: 'Sipariş bulunamadı.' });
        return res.status(200).json(toAdminOrderDetail(result.rows[0]));
    } catch (_) {
        // Database messages/parameters may contain recipient data. Do not log
        // or serialize them into this operational detail response.
        return res.status(500).json({ code: 'ADMIN_ORDER_DETAIL_UNAVAILABLE', error: 'Sipariş detayı alınamadı.' });
    }
};

module.exports = { createGetAdminOrderDetail, toAdminOrderDetail };
