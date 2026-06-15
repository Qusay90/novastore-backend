const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workspace = path.resolve(__dirname, '..');
const profileHtml = fs.readFileSync(path.join(workspace, 'frontend', 'profile.html'), 'utf8');
const checkoutHtml = fs.readFileSync(path.join(workspace, 'frontend', 'checkout.html'), 'utf8');
const androidRepo = fs.readFileSync(
    path.join(workspace, 'app', 'src', 'main', 'java', 'com', 'novastore', 'app', 'data', 'repository', 'CustomerLocalRepository.kt'),
    'utf8'
);

assert(profileHtml.includes('novastore_addresses_migrated_${_getUserId()}'));
assert(profileHtml.includes('loadAddress({ allowMigration: false })'));
assert(profileHtml.includes('markAddressMigrationComplete()'));
assert(checkoutHtml.includes('isCheckoutAddressMigrationComplete()'));
assert(checkoutHtml.includes('markCheckoutAddressMigrationComplete()'));
assert(androidRepo.includes('KEY_ADDRESS_MIGRATION_COMPLETE'));
assert(androidRepo.includes('refreshAddresses(allowMigration: Boolean = true)'));
assert(androidRepo.includes('refreshAddresses(allowMigration = false)'));

const createGuardHarness = () => {
    const storage = new Map();
    let backend = [];
    let nextId = 1;

    const addrKey = 'novastore_addresses_10';
    const migrationKey = 'novastore_addresses_migrated_10';

    const readCache = () => JSON.parse(storage.get(addrKey) || '[]');
    const writeCache = (value) => storage.set(addrKey, JSON.stringify(value));
    const migrated = () => storage.get(migrationKey) === '1';
    const markMigrated = () => storage.set(migrationKey, '1');

    const migrate = async (localAddresses) => {
        for (const local of localAddresses) {
            backend.push({ ...local, id: String(nextId++), isDefault: backend.length === 0 });
        }
        storage.delete(addrKey);
        markMigrated();
    };

    const refresh = async ({ allowMigration = true } = {}) => {
        const local = readCache();
        let remote = [...backend];
        if (remote.length === 0 && local.length > 0 && allowMigration && !migrated()) {
            await migrate(local);
            remote = [...backend];
        }
        writeCache(remote);
        markMigrated();
        return remote;
    };

    const deleteAddress = async (id) => {
        backend = backend.filter((address) => address.id !== String(id));
        writeCache(readCache().filter((address) => address.id !== String(id)));
        markMigrated();
        return refresh({ allowMigration: false });
    };

    const checkoutRefresh = async () => {
        const local = readCache();
        let remote = [...backend];
        if (remote.length === 0 && local.length > 0 && !migrated()) {
            await migrate(local);
            remote = [...backend];
        }
        writeCache(remote);
        markMigrated();
        return remote;
    };

    return {
        seedLocal(addresses) {
            writeCache(addresses);
        },
        seedStaleLocal(addresses) {
            writeCache(addresses);
        },
        refresh,
        deleteAddress,
        checkoutRefresh,
        backendRows: () => [...backend],
        cacheRows: readCache,
        isMigrated: migrated
    };
};

(async () => {
    const harness = createGuardHarness();
    harness.seedLocal([
        {
            id: 'local-1',
            title: 'Ev',
            fullName: 'Test User',
            phone: '05551234567',
            city: 'Istanbul',
            district: 'Kadikoy',
            detail: 'Test Sokak No:1'
        }
    ]);

    const migratedRows = await harness.refresh();
    assert.strictEqual(migratedRows.length, 1, 'first refresh migrates old local address');
    assert.strictEqual(harness.backendRows().length, 1);
    assert.strictEqual(harness.isMigrated(), true);

    await harness.deleteAddress(migratedRows[0].id);
    assert.strictEqual(harness.backendRows().length, 0, 'delete leaves backend empty');
    assert.strictEqual(harness.cacheRows().length, 0, 'delete clears local cache');

    harness.seedStaleLocal([{ ...migratedRows[0], id: 'stale-local' }]);
    const afterRefresh = await harness.refresh();
    assert.strictEqual(afterRefresh.length, 0, 'stale local cache is not migrated after delete');
    assert.strictEqual(harness.backendRows().length, 0);

    harness.seedStaleLocal([{ ...migratedRows[0], id: 'stale-checkout' }]);
    const checkoutRows = await harness.checkoutRefresh();
    assert.strictEqual(checkoutRows.length, 0, 'checkout does not resurrect deleted default address');
    assert.strictEqual(harness.backendRows().length, 0);

    console.log('address migration guard smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
