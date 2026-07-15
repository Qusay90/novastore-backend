const assert = require('node:assert/strict');
const Module = require('node:module');

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
    if (request === '../config/db' && parent?.filename?.endsWith('/controllers/returnController.js')) {
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
    const invalidCreate = await invoke(createReturnRequest, { body: { order_id: 'not-an-id' } });
    assert.equal(invalidCreate.statusCode, 400);

    const disabledCreate = await invoke(createReturnRequest, {
        body: { order_id: 71, reason_code: 'CUSTOMER_REQUEST', note: null }
    });
    assert.equal(disabledCreate.statusCode, 503);
    assert.equal(disabledCreate.payload.code, 'RETURN_WRITES_DISABLED');

    const disabledCreateWithoutReason = await invoke(createReturnRequest, { body: { order_id: 72 } });
    assert.equal(disabledCreateWithoutReason.statusCode, 503);
    assert.equal(disabledCreateWithoutReason.payload.code, 'RETURN_WRITES_DISABLED');

    const invalidUpdate = await invoke(updateReturnStatus, { params: { id: 'invalid' }, body: {} });
    assert.equal(invalidUpdate.statusCode, 400);

    const disabledUpdate = await invoke(updateReturnStatus, {
        params: { id: '81' },
        body: { status: 'COMPLETED' }
    });
    assert.equal(disabledUpdate.statusCode, 503);
    assert.equal(disabledUpdate.payload.code, 'RETURN_WRITES_DISABLED');

    assert.equal(databaseCalls, 0, 'disabled return writes must be rejected before every database call');
    console.log('return writes disabled smoke passed');
})().catch((error) => {
    Module._load = originalLoad;
    console.error(error);
    process.exit(1);
});
