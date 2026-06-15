const assert = require('assert');
const pool = require('../config/db');
const { authenticate } = require('../middlewares/authMiddleware');
const {
    listAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    __test
} = require('../controllers/addressController');

const rows = [];
let nextId = 1;

const mapReturnRow = (row) => ({
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    full_name: row.full_name,
    phone: row.phone,
    city: row.city,
    district: row.district,
    address_line: row.address_line,
    is_default: row.is_default,
    created_at: row.created_at,
    updated_at: row.updated_at
});

const createFakeClient = () => ({
    async query(sql, params = []) {
        if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [], rowCount: 0 };

        if (/SELECT COUNT\(\*\)::int AS count FROM customer_addresses/i.test(sql)) {
            return { rows: [{ count: rows.filter((row) => row.user_id === params[0]).length }], rowCount: 1 };
        }

        if (/UPDATE customer_addresses SET is_default = FALSE/i.test(sql)) {
            rows.filter((row) => row.user_id === params[0]).forEach((row) => {
                row.is_default = false;
                row.updated_at = new Date();
            });
            return { rows: [], rowCount: 0 };
        }

        if (/INSERT INTO customer_addresses/i.test(sql)) {
            const row = {
                id: nextId++,
                user_id: params[0],
                title: params[1],
                full_name: params[2],
                phone: params[3],
                city: params[4],
                district: params[5],
                address_line: params[6],
                is_default: params[7],
                created_at: new Date(),
                updated_at: new Date()
            };
            rows.push(row);
            return { rows: [mapReturnRow(row)], rowCount: 1 };
        }

        if (/SELECT id FROM customer_addresses WHERE id = \$1 AND user_id = \$2/i.test(sql)) {
            const row = rows.find((item) => item.id === params[0] && item.user_id === params[1]);
            return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
        }

        if (/UPDATE customer_addresses\s+SET title =/i.test(sql)) {
            const row = rows.find((item) => item.id === params[0] && item.user_id === params[1]);
            if (!row) return { rows: [], rowCount: 0 };
            row.title = params[2];
            row.full_name = params[3];
            row.phone = params[4];
            row.city = params[5];
            row.district = params[6];
            row.address_line = params[7];
            if (params[8]) row.is_default = true;
            row.updated_at = new Date();
            return { rows: [mapReturnRow(row)], rowCount: 1 };
        }

        if (/DELETE FROM customer_addresses/i.test(sql)) {
            const index = rows.findIndex((item) => item.id === params[0] && item.user_id === params[1]);
            if (index === -1) return { rows: [], rowCount: 0 };
            const [deleted] = rows.splice(index, 1);
            return { rows: [{ is_default: deleted.is_default }], rowCount: 1 };
        }

        if (/UPDATE customer_addresses\s+SET is_default = TRUE/i.test(sql)) {
            const target = params.length === 2
                ? rows.find((item) => item.id === params[0] && item.user_id === params[1])
                : rows.filter((item) => item.user_id === params[0]).sort((a, b) => b.id - a.id)[0];
            if (!target) return { rows: [], rowCount: 0 };
            target.is_default = true;
            target.updated_at = new Date();
            return { rows: [mapReturnRow(target)], rowCount: 1 };
        }

        throw new Error(`Unhandled fake SQL: ${sql}`);
    },
    release() {}
});

pool.query = async (sql, params = []) => {
    if (/FROM customer_addresses/i.test(sql) && /WHERE user_id = \$1/i.test(sql)) {
        return {
            rows: rows
                .filter((row) => row.user_id === params[0])
                .sort((a, b) => Number(b.is_default) - Number(a.is_default) || b.id - a.id)
                .map(mapReturnRow),
            rowCount: rows.filter((row) => row.user_id === params[0]).length
        };
    }
    throw new Error(`Unhandled fake pool SQL: ${sql}`);
};
pool.connect = async () => createFakeClient();

const createReq = (userId, body = {}, params = {}) => ({
    user: { id: userId, role: 'customer' },
    body,
    params,
    headers: {}
});

const createRes = () => {
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
    return res;
};

const invoke = async (handler, req) => {
    const res = createRes();
    await handler(req, res);
    return res;
};

(async () => {
    const authRes = createRes();
    authenticate({ headers: {} }, authRes, () => {
        throw new Error('Unauthenticated address list should not reach handler');
    });
    assert.strictEqual(authRes.statusCode, 401);

    const firstPayload = {
        title: 'Ev',
        fullName: 'Test Kullanıcı',
        phone: '05551234567',
        city: 'İstanbul',
        district: 'Kadıköy',
        addressLine: 'Test Mahallesi No:1'
    };
    assert.strictEqual(__test.validateAddressInput(__test.normalizeAddressInput(firstPayload)), null);

    const created = await invoke(createAddress, createReq(10, firstPayload));
    assert.strictEqual(created.statusCode, 201);
    assert.strictEqual(created.body.isDefault, true);

    const second = await invoke(createAddress, createReq(10, { ...firstPayload, title: 'İş', isDefault: true }));
    assert.strictEqual(second.statusCode, 201);

    const listed = await invoke(listAddresses, createReq(10));
    assert.strictEqual(listed.body.length, 2);
    assert.strictEqual(listed.body.filter((address) => address.isDefault).length, 1);
    assert.strictEqual(listed.body[0].title, 'İş');

    const otherUserList = await invoke(listAddresses, createReq(11));
    assert.strictEqual(otherUserList.body.length, 0);

    const deniedUpdate = await invoke(updateAddress, createReq(11, { ...firstPayload, title: 'Çalıntı' }, { id: String(second.body.id) }));
    assert.strictEqual(deniedUpdate.statusCode, 404);

    const updated = await invoke(updateAddress, createReq(10, { ...firstPayload, title: 'Ev Güncel' }, { id: String(created.body.id) }));
    assert.strictEqual(updated.statusCode, 200);
    assert.strictEqual(updated.body.title, 'Ev Güncel');

    const selected = await invoke(setDefaultAddress, createReq(10, {}, { id: String(created.body.id) }));
    assert.strictEqual(selected.statusCode, 200);
    assert.strictEqual(selected.body.isDefault, true);

    const afterDefault = await invoke(listAddresses, createReq(10));
    assert.strictEqual(afterDefault.body.filter((address) => address.isDefault).length, 1);
    assert.strictEqual(afterDefault.body[0].id, created.body.id);

    const deleted = await invoke(deleteAddress, createReq(10, {}, { id: String(created.body.id) }));
    assert.strictEqual(deleted.statusCode, 200);

    const afterDelete = await invoke(listAddresses, createReq(10));
    assert.strictEqual(afterDelete.body.length, 1);
    assert.strictEqual(afterDelete.body[0].isDefault, true);

    console.log('address CRUD smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
