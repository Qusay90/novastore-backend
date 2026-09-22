'use strict';
// These are synthetic schema/byte-binding unit fixtures, not browser or runtime
// acceptance. No fixture is written into the authoritative acceptance source.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {WIDTHS, ROUTES, evaluateAcceptance, loadBuildAcceptance} = require('../scripts/lib/themePresentationAcceptance');
const {buildRegistry} = require('../scripts/buildThemePlatformPresentationRegistry');
const root = path.resolve(__dirname, '..'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
function fixture(id = 'nova-classic') {
    const bytes = Buffer.from('SYNTHETIC UNIT EVIDENCE - NOT ACTUAL ACCEPTANCE'), evidence = {path: 'theme-platform/acceptance-evidence/unit-only.json', sha256: sha(bytes)};
    const presentation = {id, version: '1.0.0', digest: sha(id)}, identity = {...presentation, channels: ['web'], sourceFiles: []};
    const files = [{path: 'customer.html', sha256: sha('unit build'), mimeType: 'text/html'}], sourceFiles = [{path: 'unit-source.js', sha256: sha('unit source')}];
    const bundle = {presentation, channel: 'web', entryPoint: 'customer.html', files, sourceFiles,
        commerceCapabilities: Object.fromEntries(['customerAuth', 'persistentCart', 'favorites', 'variantSelection', 'stockCheck', 'checkoutPreparation', 'orderHistory', 'reviews', 'questions', 'supportRouting', 'singleStore'].map(k => [k, true]))};
    bundle.sourceDigest = sha(JSON.stringify({presentation, originalSource: identity.sourceFiles, behaviorSources: sourceFiles, files}));
    const record = {presentation, channel: 'web', rendererSourceDigest: bundle.sourceDigest, artifactDigest: sha('unit artifact'), phase: 'COMPATIBILITY_ACCEPTED_PRE_PUBLICATION', storeActivation: 'NOT_ASSERTED',
        gates: Object.fromEntries(['presentation', 'customerRuntime', 'singleStoreRuntime', 'publication'].map(k => [k, {status: 'PASS', evidence}])),
        responsive: WIDTHS.flatMap(width => ROUTES.map(route => ({width, route, status: 'PASS', evidence})))};
    record.gates.publication = {...record.gates.publication, phase: 'BUILD_VALIDATION_PASS', regression: {status: 'PASS', evidence, provenance: 'REAL_POSTGRES_WITH_EXPLICIT_AUTHORITY_DOUBLES'}};
    return {source: {schemaVersion: 1, authority: 'BUILD_OWNED_REVIEWED_EVIDENCE', acceptances: [record]}, presentations: [identity], manifest: {schemaVersion: 1, bundles: [bundle]},
        readEvidence: () => bytes, readBuild: () => Buffer.from('unit build'), readSource: () => Buffer.from('unit source'), record, bundle};
}
test('actual reviewed evidence grants exactly two web channels and generator is read only', () => {
    const registryPath = path.join(root, 'theme-platform/presentations.json'), before = fs.readFileSync(registryPath);
    const actual = JSON.parse(before), result = buildRegistry();
    const source = JSON.parse(fs.readFileSync(path.join(root, 'theme-platform/presentation-acceptance.json')));
    const proof = loadBuildAcceptance(root, actual.presentations);
    assert.deepEqual(source.acceptances.map(row => `${row.presentation.id}/${row.channel}`).sort(), ['nova-atelier/web', 'nova-classic/web']);
    assert.deepEqual([...proof.accepted.keys()].sort(), ['nova-atelier/web', 'nova-classic/web']);
    assert.deepEqual(proof.rejected, []);
    for (const record of source.acceptances) {
        assert.equal(record.responsive.length, 21);
        assert.equal(record.phase, 'COMPATIBILITY_ACCEPTED_PRE_PUBLICATION');
        assert.equal(record.storeActivation, 'NOT_ASSERTED');
    }
    assert.deepEqual(result, actual); assert.deepEqual(fs.readFileSync(registryPath), before);
    assert.equal(result.inventory.length, 54); assert.equal(result.inventory.filter(row => row.status === 'READY').length, 2);
    assert.equal(result.inventory.filter(row => row.status === 'PARTIAL').length, 52);
});
for (const id of ['nova-classic', 'nova-atelier']) test(`synthetic exact ${id} web proof passes only build-time metadata validator`, () => {
    const f = fixture(id), result = evaluateAcceptance(f);
    assert.equal(result.accepted.size, 1); assert.deepEqual(result.rejected, []);
    assert.equal(result.accepted.get(`${id}/web`).storeActivation, 'NOT_ASSERTED');
});
const cases = {
    'unknown identity': f => {f.record.presentation.id = 'unknown';},
    'unreviewed app channel': f => {f.record.channel = 'app';},
    'different presentation digest': f => {f.record.presentation = {...f.record.presentation, digest: '1'.repeat(64)};},
    'stale renderer source digest': f => {f.record.rendererSourceDigest = '2'.repeat(64);},
    'stale built renderer bytes': f => {f.readBuild = () => Buffer.from('changed');},
    'stale executable source bytes': f => {f.readSource = () => Buffer.from('changed');},
    'stale screenshot or report bytes': f => {f.readEvidence = () => Buffer.from('changed');},
    'unsupported runtime capability': f => {f.bundle.commerceCapabilities.supportRouting = false;},
    'missing responsive width': f => {f.record.responsive.pop();},
    'duplicate responsive case': f => {f.record.responsive[20] = f.record.responsive[0];},
    'failed responsive case': f => {f.record.responsive[0].status = 'FAIL';},
    'remote evidence URL': f => {f.record.responsive[0].evidence = {path: 'https://example.test/pass.json', sha256: sha('x')};},
    'evidence outside trusted root': f => {f.record.responsive[0].evidence = {path: 'studio-core/file.json', sha256: sha('x')};},
    'evidence path traversal': f => {f.record.responsive[0].evidence = {path: 'theme-platform/acceptance-evidence/../pass.json', sha256: sha('x')};},
    'duplicate proof cannot override failed proof': f => {const other = structuredClone(f.record); other.gates.customerRuntime.status = 'FAIL'; f.source.acceptances.push(other);},
    'publication activation incorrectly claimed': f => {f.record.storeActivation = 'ACTIVE';},
    'unqualified publication regression': f => {f.record.gates.publication.regression.provenance = 'PASS';},
    'manifest missing': f => {f.manifest = null;},
    'foreign source authority': f => {f.source.authority = 'PACKAGE';},
    'invalid digest even when copied into record': f => {f.bundle.sourceDigest = f.record.rendererSourceDigest = sha('unbound digest');},
};
for (const [name, change] of Object.entries(cases)) test(`readiness remains denied: ${name}`, () => {
    const f = fixture(); change(f); const result = evaluateAcceptance(f);
    assert.equal(result.accepted.size, 0); assert.ok(result.rejected.length);
});
for (const gate of ['presentation', 'customerRuntime', 'singleStoreRuntime', 'publication']) test(`missing ${gate} gate cannot be inferred from other PASS evidence`, () => {
    const f = fixture(); delete f.record.gates[gate]; assert.equal(evaluateAcceptance(f).accepted.size, 0);
});
