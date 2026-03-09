const pool = require('../config/db');
const { appendOrderEvent } = require('./orderService');

const generateInvoiceNo = (type, orderId) => {
    const prefix = type === 'INVOICE' ? 'INV' : type === 'CANCELLATION' ? 'CNC' : 'RET';
    return `NS-${prefix}-${orderId}-${Date.now()}`;
};

const createInvoice = async ({ client = pool, orderId, type = 'INVOICE', amount, currency = 'TRY' }) => {
    const invoiceNo = generateInvoiceNo(type, orderId);

    const result = await client.query(
        `INSERT INTO invoices (order_id, invoice_type, invoice_no, amount, currency, status, provider)
         VALUES ($1, $2, $3, $4, $5, 'CREATED', 'mock')
         ON CONFLICT (invoice_no) DO NOTHING
         RETURNING *`,
        [orderId, type, invoiceNo, amount, currency]
    );

    if (result.rows.length > 0) {
        await appendOrderEvent(client, orderId, `INVOICE_${type}`, `${type} belgesi olusturuldu: ${invoiceNo}`, {
            invoiceNo,
            type,
            amount,
            currency
        });
    }

    return result.rows[0] || null;
};

const getInvoicesByOrderId = async (orderId) => {
    const result = await pool.query(
        'SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC',
        [orderId]
    );
    return result.rows;
};

module.exports = {
    createInvoice,
    getInvoicesByOrderId
};
