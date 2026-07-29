const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const revocationModule = require('../../services/socketRevocationService');

const readinessMarker = 'stagingAccessGateServerChild: revocation-listener-ready';

assert.equal(require.main, module, 'The hermetic server child must be an explicit test entrypoint.');
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.NOVASTORE_DEPLOY_ENV, 'staging');
assert.equal(process.env.SKIP_SCHEMA_INIT, 'true');
assert.notEqual(process.env.NOVASTORE_LOCAL_PREVIEW, 'true');
assert.equal(
    Object.prototype.hasOwnProperty.call(process.env, 'DATABASE_URL'),
    false,
    'The access-gate server child must not inherit an ambient database URL.'
);

class HermeticListenerClient extends EventEmitter {
    constructor() {
        super();
        this.queryCount = 0;
    }

    async query(sql) {
        this.queryCount += 1;
        assert.equal(this.queryCount, 1);
        assert.equal(sql, `LISTEN ${revocationModule.CHANNEL}`);
        console.log(readinessMarker);
    }

    release() {}
}

const listenerClient = new HermeticListenerClient();
let connectCount = 0;
const database = {
    async connect() {
        connectCount += 1;
        assert.equal(connectCount, 1);
        return listenerClient;
    }
};

revocationModule.socketRevocationService = revocationModule.createSocketRevocationService({ database });

require('../../server');
