'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const normalize = (value) => value.replace(/\\/gu, '/');

const handoffPath = 'docs/seller/pc1/SELLER-MAIN6S-CROSS-LANE-HANDOFF.md';
const allowlistPath = 'docs/seller/pc1/SELLER-MAIN6S-FILE-ALLOWLIST.tsv';
const smokePath = 'tests/sellerMain6sCrossLaneHandoffSmoke.js';
const handoff = read(handoffPath);
const allowlistLines = read(allowlistPath).trimEnd().split('\n');
assert.equal(
    allowlistLines.shift(),
    'phase\tpath\taction\tartifact_type\tpurpose\tverification'
);
const allowlistRows = allowlistLines.map((line) => {
    const fields = line.replace(/\r$/u, '').split('\t');
    assert.equal(fields.length, 6, `invalid Main-6S allowlist row: ${line}`);
    return Object.freeze({ phase: fields[0], path: normalize(fields[1]), action: fields[2] });
});
const expectedPaths = [
    'docs/seller/pc1/SELLER-MAIN6S-CROSS-LANE-HANDOFF.md',
    'docs/seller/pc1/SELLER-MAIN6S-FILE-ALLOWLIST.tsv',
    'seller-app/build.gradle.kts',
    'seller-app/src/androidTest/java/com/novastore/seller/SellerCanonicalCaptureInstrumentationTest.kt',
    'seller-app/src/androidTest/java/com/novastore/seller/SellerNavigationInstrumentationTest.kt',
    'seller-app/src/main/java/com/novastore/seller/data/SellerModels.kt',
    'seller-app/src/main/java/com/novastore/seller/data/SellerRepository.kt',
    'seller-app/src/main/java/com/novastore/seller/ui/SellerApp.kt',
    'seller-app/src/main/java/com/novastore/seller/ui/SellerScreens.kt',
    'server.js',
    'services/sellerOfferInventoryService.js',
    'services/sellerSupportService.js',
    'services/sellerTeamReadService.js',
    'services/sellerTenantContextService.js',
    'tests/helpers/sellerMain6sAndroidFixture.js',
    'tests/sellerF1TeamStoreIsolationSmoke.js',
    'tests/sellerF1TenantIsolationSmoke.js',
    smokePath,
    'tests/sellerWave3BusinessIsolationIntegrationSmoke.js',
    'tests/sellerWave3MigrationDisposableDbIntegrationSmoke.js',
    'tests/sellerWave4MobileContractSmoke.js',
    'tools/sellerMain6sLocalAndroidE2E.ps1'
].sort();
const actualPaths = allowlistRows.map((row) => row.path).sort();
assert.deepEqual(actualPaths, expectedPaths);
assert.equal(new Set(actualPaths).size, actualPaths.length, 'Main-6S allowlist paths must be unique');
for (const relativePath of actualPaths) {
    assert.ok(fs.existsSync(path.join(root, relativePath)), `missing Main-6S path: ${relativePath}`);
}

for (const required of [
    '8daaaade5a8d9776eac71eb679927239af465a02',
    'ef69f643058275ba97baca6857375d756780dc35',
    '2796fc2f65c5cad15045e97c5d6c2b499536bb73',
    '5c94178e8fdc7cff6c8168ddc9d07a5a0c73323f',
    '3dd2f9e671131f211bca4f1ea7a6e7b4825297b2',
    'd5ea984bc95f1be48e20a152198ca5c11dc550fc',
    'seller application/mutation/tenant ownership',
    'seller vs foreign-store mutation matrix',
    'EXACT_HANDOFF_STATUS: PASS',
    'RUNTIME_VISUAL_UAT: PASS',
    'PC1_MERGE_READINESS: SELLER_LANE_READY_FOR_COMBINED_INTEGRATION',
    'SELLER_LAUNCH_CRITICAL_OPEN_COUNT: 0',
    'RETURN_THE_EXACT_PC1_HANDOFF_AND_WAIT'
]) assert.match(handoff, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
for (const metric of ['3/3', '4.8425%', 'geometry PASS']) {
    assert.match(handoff, new RegExp(metric.replace('.', '\\.'), 'u'));
}
assert.match(handoff, /current owner-approved NovaStore[\s\S]*authoritative/u);
assert.match(handoff, /No missing portrait, icon or font was[\s\S]*fabricated/u);
assert.match(handoff, /references 012–054 remain explicitly disabled/u);
assert.match(handoff, /does not invent application,[\s\S]*membership-mutation endpoints/u);
assert.match(handoff, /preserve the accepted[\s\S]*applyLocalMain6sOperationMigrations\(\)/u);

const tenantService = read('services/sellerTenantContextService.js');
assert.match(tenantService, /const sessionId = typeof session\?\.sessionId[\s\S]*session\.sessionId\.trim\(\)/u);
assert.match(tenantService, /if \(!sessionId\)[\s\S]*return Object\.freeze\(\{[\s\S]*sessionId,/u);

const offerInventory = read('services/sellerOfferInventoryService.js');
assert.match(offerInventory, /const storeId = activeStoreId\(safeContext\);[\s\S]*fingerprint\(\{ storeId, \.\.\.data \}\)/u);
assert.match(offerInventory, /const scopedItems = await database\.query[\s\S]*if \(\(scopedItems\.rows \|\| \[\]\)\.length !== items\.length\)[\s\S]*receipt\(database/u);
assert.match(offerInventory, /const scopedItem = await database\.query[\s\S]*if \(!scopedItem\.rows\?\.\[0\]\)[\s\S]*receipt\(database/u);

const support = read('services/sellerSupportService.js');
assert.match(support, /const storeId = activeStore\(safeContext\);[\s\S]*fingerprint\(\{ storeId, \.\.\.data \}\)/u);

const team = read('services/sellerTeamReadService.js');
assert.match(team, /EXISTS[\s\S]*scope\.revoked_at IS NULL[\s\S]*scope\.store_id = ANY/u);

const androidBuild = read('seller-app/build.gradle.kts');
assert.match(androidBuild, /sellerReleaseApiBaseUrl/u);
assert.match(androidBuild, /sellerReleaseApiHostAllowlist = setOf\("novastore-backend\.onrender\.com"\)/u);
assert.match(androidBuild, /normalizedHost !in sellerReleaseApiHostAllowlist[\s\S]*uri\.rawPath != "\/"[\s\S]*uri\.port !in setOf\(-1, 443\)[\s\S]*uri\.userInfo != null/u);
const repository = read('seller-app/src/main/java/com/novastore/seller/data/SellerRepository.kt');
assert.doesNotMatch(repository, /BuildConfig\.BUILD_TYPE == "release"[\s\S]*API_DISABLED/u);
const canonicalCapture = read('seller-app/src/androidTest/java/com/novastore/seller/SellerCanonicalCaptureInstrumentationTest.kt');
assert.match(canonicalCapture, /uiAutomation\.clearCache\(\)[\s\S]*description\.startsWith\(routeToken\)[\s\S]*description\.contains\(stateToken\)[\s\S]*description\.contains\(specification\.expectedFixture\)[\s\S]*seller-ui-idle:yes/u);
for (const action of [
    'STORE_CROSS_TENANT_DENIAL',
    'OFFER_CROSS_TENANT_DENIAL',
    'INVENTORY_CROSS_TENANT_DENIAL',
    'ORDER_CROSS_TENANT_DENIAL',
    'SUPPORT_CROSS_TENANT_DENIAL'
]) assert.match(repository, new RegExp(action, 'u'));

const dbIntegration = read('tests/sellerWave3MigrationDisposableDbIntegrationSmoke.js');
for (const proof of [
    'foreign-store-update-denied',
    'foreign-offer-command-denied',
    'foreign-inventory-threshold-denied',
    'foreign-order-command-denied',
    'foreign-support-rating-denied',
    'session_id IS NULL'
]) assert.match(dbIntegration, new RegExp(proof, 'u'));
assert.match(dbIntegration, /target, receipt, audit and outbox state unchanged/u);

const runner = read('tools/sellerMain6sLocalAndroidE2E.ps1');
for (const guard of [
    '--pull=never',
    '-p 127.0.0.1::5432',
    'NOVASTORE_BIND_HOST',
    'SELLER_MAIN6S_ANDROID_MUTATION_MATRIX: PASS',
    'SELLER_MAIN6S_ANDROID_E2E_CLEANUP: PASS'
]) assert.match(runner, new RegExp(guard.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));

console.log('sellerMain6sCrossLaneHandoffSmoke: PASS');
