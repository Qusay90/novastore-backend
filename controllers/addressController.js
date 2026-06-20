const pool = require('../config/db');

const REQUIRED_FIELDS = [
    ['title', 'Adres başlığı gerekli.'],
    ['fullName', 'Alıcı adı gerekli.'],
    ['phone', 'Telefon gerekli.'],
    ['city', 'İl gerekli.'],
    ['district', 'İlçe gerekli.'],
    ['addressLine', 'Açık adres gerekli.']
];

const pickString = (...values) => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
};

const normalizeAddressInput = (body = {}) => ({
    title: pickString(body.title, body.label),
    fullName: pickString(body.fullName, body.full_name, body.recipientName, body.recipient_name, body.name),
    phone: pickString(body.phone),
    city: pickString(body.city, body.province),
    district: pickString(body.district),
    addressLine: pickString(body.addressLine, body.address_line, body.fullAddress, body.full_address, body.detail, body.address),
    isDefault: body.isDefault === true || body.is_default === true
});

const validateAddressInput = (address) => {
    const missing = REQUIRED_FIELDS.find(([field]) => !address[field]);
    if (missing) return missing[1];
    if (!/^0?5\d{9}$/.test(address.phone.replace(/\s+/g, ''))) {
        return 'Telefon 05 ile başlayan 11 haneli olmalı.';
    }
    return null;
};

const normalizePhone = (phone) => phone.replace(/\s+/g, '');

const normalizeAddressId = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const mapAddressRow = (row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    fullName: row.full_name,
    phone: row.phone,
    city: row.city,
    district: row.district,
    addressLine: row.address_line,
    detail: row.address_line,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    singleLine: [row.address_line, row.district, row.city].filter(Boolean).join(', ')
});

const ADDRESS_SELECT = `
    SELECT id, user_id, title, full_name, phone, city, district, address_line, is_default, created_at, updated_at
    FROM customer_addresses
`;

const listAddresses = async (req, res) => {
    try {
        const result = await pool.query(
            `${ADDRESS_SELECT}
             WHERE user_id = $1
             ORDER BY is_default DESC, updated_at DESC, id DESC`,
            [req.user.id]
        );
        res.json(result.rows.map(mapAddressRow));
    } catch (error) {
        console.error('Adresler alınamadı:', error);
        res.status(500).json({ error: 'Adresler alınamadı.' });
    }
};

const createAddress = async (req, res) => {
    const address = normalizeAddressInput(req.body);
    const validationError = validateAddressInput(address);
    if (validationError) return res.status(400).json({ error: validationError });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const countResult = await client.query('SELECT COUNT(*)::int AS count FROM customer_addresses WHERE user_id = $1', [req.user.id]);
        const makeDefault = address.isDefault || countResult.rows[0].count === 0;

        if (makeDefault) {
            await client.query('UPDATE customer_addresses SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1', [req.user.id]);
        }

        const result = await client.query(
            `INSERT INTO customer_addresses
                (user_id, title, full_name, phone, city, district, address_line, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, user_id, title, full_name, phone, city, district, address_line, is_default, created_at, updated_at`,
            [
                req.user.id,
                address.title,
                address.fullName,
                normalizePhone(address.phone),
                address.city,
                address.district,
                address.addressLine,
                makeDefault
            ]
        );

        await client.query('COMMIT');
        res.status(201).json(mapAddressRow(result.rows[0]));
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Adres oluşturulamadı:', error);
        res.status(500).json({ error: 'Adres oluşturulamadı.' });
    } finally {
        client.release();
    }
};

const updateAddress = async (req, res) => {
    const addressId = normalizeAddressId(req.params.id);
    if (!addressId) return res.status(400).json({ error: 'Geçersiz adres id.' });

    const address = normalizeAddressInput(req.body);
    const validationError = validateAddressInput(address);
    if (validationError) return res.status(400).json({ error: validationError });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const exists = await client.query('SELECT id FROM customer_addresses WHERE id = $1 AND user_id = $2', [addressId, req.user.id]);
        if (exists.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Adres bulunamadı.' });
        }

        if (address.isDefault) {
            await client.query('UPDATE customer_addresses SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1', [req.user.id]);
        }

        const result = await client.query(
            `UPDATE customer_addresses
             SET title = $3,
                 full_name = $4,
                 phone = $5,
                 city = $6,
                 district = $7,
                 address_line = $8,
                 is_default = CASE WHEN $9 THEN TRUE ELSE is_default END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2
             RETURNING id, user_id, title, full_name, phone, city, district, address_line, is_default, created_at, updated_at`,
            [
                addressId,
                req.user.id,
                address.title,
                address.fullName,
                normalizePhone(address.phone),
                address.city,
                address.district,
                address.addressLine,
                address.isDefault
            ]
        );

        await client.query('COMMIT');
        res.json(mapAddressRow(result.rows[0]));
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Adres güncellenemedi:', error);
        res.status(500).json({ error: 'Adres güncellenemedi.' });
    } finally {
        client.release();
    }
};

const deleteAddress = async (req, res) => {
    const addressId = normalizeAddressId(req.params.id);
    if (!addressId) return res.status(400).json({ error: 'Geçersiz adres id.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const deleted = await client.query(
            'DELETE FROM customer_addresses WHERE id = $1 AND user_id = $2 RETURNING is_default',
            [addressId, req.user.id]
        );
        if (deleted.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Adres bulunamadı.' });
        }

        if (deleted.rows[0].is_default) {
            await client.query(
                `UPDATE customer_addresses
                 SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP
                 WHERE id = (
                    SELECT id FROM customer_addresses
                    WHERE user_id = $1
                    ORDER BY updated_at DESC, id DESC
                    LIMIT 1
                 )`,
                [req.user.id]
            );
        }

        await client.query('COMMIT');
        res.json({ message: 'Adres silindi.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Adres silinemedi:', error);
        res.status(500).json({ error: 'Adres silinemedi.' });
    } finally {
        client.release();
    }
};

const setDefaultAddress = async (req, res) => {
    const addressId = normalizeAddressId(req.params.id);
    if (!addressId) return res.status(400).json({ error: 'Geçersiz adres id.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const exists = await client.query('SELECT id FROM customer_addresses WHERE id = $1 AND user_id = $2', [addressId, req.user.id]);
        if (exists.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Adres bulunamadı.' });
        }

        await client.query('UPDATE customer_addresses SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1', [req.user.id]);
        const result = await client.query(
            `UPDATE customer_addresses
             SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2
             RETURNING id, user_id, title, full_name, phone, city, district, address_line, is_default, created_at, updated_at`,
            [addressId, req.user.id]
        );
        await client.query('COMMIT');
        res.json(mapAddressRow(result.rows[0]));
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Varsayılan adres seçilemedi:', error);
        res.status(500).json({ error: 'Varsayılan adres seçilemedi.' });
    } finally {
        client.release();
    }
};

module.exports = {
    listAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    __test: {
        normalizeAddressInput,
        validateAddressInput,
        normalizeAddressId,
        mapAddressRow,
        normalizePhone
    }
};
