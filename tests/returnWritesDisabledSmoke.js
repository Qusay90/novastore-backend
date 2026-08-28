const assert = require('node:assert/strict');
const Module = require('node:module');

process.env.NOVASTORE_ADMIN_RETURN_WRITE_ENABLED = 'false';

const originalLoad = Module._load;
let databaseCalls = 0;

const fakePool = {
    async connect() {
        databaseCalls += 1;
        throw new Error('disabled return write must not acquire a database client');
    },
    async query() {
        databaseCalls += 1;
        throw new Error('disabled return write must not query the database');
    }
};

Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../config/db' && /[\\/](?:controllers|services)[\\/]/.test(parent?.filename || '')) {
        return fakePool;
    }
    return originalLoad.call(this, request, parent, isMain);
};

const { createReturnRequest, updateReturnStatus } = require('../controllers/returnController');
Module._load = originalLoad;

const createResponse = () => ({
    statusCode: 200,
    payload: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.payload = payload;
        return this;
    }
});

const invoke = async (handler, req) => {
    const res = createResponse();
    await handler(req, res);
    return res;
};

(async () => {
    const invalidCreate = await invoke(createReturnRequest, {
        user: { id: 71, principal: 'customer', role: 'customer' },
        body: { order_id: 'not-an-id', reason_code: 'DAMAGED' }
    });
    assert.equal(invalidCreate.statusCode, 400);

    const wrongRoleCreate = await invoke(createReturnRequest, {
        user: { id: 1, principal: 'admin', role: 'admin' },
        body: { order_id: 71, reason_code: 'DAMAGED', note: null }
    });
    assert.equal(wrongRoleCreate.statusCode, 403);
    assert.equal(wrongRoleCreate.payload.code, 'RETURN_CUSTOMER_REQUIRED');

    const disabledUpdate = await invoke(updateReturnStatus, {
        params: { id: '81' },
        user: { id: 1, principal: 'admin', role: 'admin' },
        body: { status: 'IN_REVIEW', expected_revision: 1 }
    });
    assert.equal(disabledUpdate.statusCode, 503);
    assert.equal(disabledUpdate.payload.code, 'ADMIN_COMMERCE_CAPABILITY_DISABLED');
    assert.equal(disabledUpdate.payload.capability, 'returnWrite');

    assert.equal(databaseCalls, 0, 'validation, role and disabled admin write gates must precede database access');
    console.log('return capability guard smoke passed');
})().catch((error) => {
    Module._load = originalLoad;
    console.error(error);
    process.exit(1);
});
