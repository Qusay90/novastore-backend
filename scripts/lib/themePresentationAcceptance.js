'use strict';

// Build-time input only. No package, HTTP request, environment flag or browser
// value is a readiness authority. Runtime services consume generated inventory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const WIDTHS = Object.freeze([320, 360, 390, 430, 768, 1024, 1440]);
const ROUTES = Object.freeze(['home', 'category', 'product']);
const GATES = Object.freeze(['presentation', 'customerRuntime', 'singleStoreRuntime', 'publication']);
const CAPABILITIES = Object.freeze(['customerAuth', 'persistentCart', 'favorites', 'variantSelection', 'stockCheck', 'checkoutPreparation', 'orderHistory', 'reviews', 'questions', 'supportRouting', 'singleStore']);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const descriptor = value => value && typeof value === 'object' && Object.keys(value).sort().join(',') === 'digest,id,version';
const same = (a, b) => descriptor(a) && descriptor(b) && a.id === b.id && a.version === b.version && a.digest === b.digest;
const safe = value => typeof value === 'string' && /^[a-zA-Z0-9_./-]{1,240}$/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
const reject = reason => { throw Error(reason); };
function evidence(reference, readEvidence) {
    if (!reference || Object.keys(reference).sort().join(',') !== 'path,sha256' || !safe(reference.path)
        || !reference.path.startsWith('theme-platform/acceptance-evidence/') || !sha(reference.sha256)) reject('EVIDENCE_REFERENCE_INVALID');
    if (hash(readEvidence(reference.path)) !== reference.sha256) reject('EVIDENCE_BYTES_CHANGED');
}

function evaluateAcceptance({ source, presentations, manifest, readEvidence, readBuild, readSource }) {
    const accepted = new Map(), rejected = [];
    if (source?.schemaVersion !== 1 || source.authority !== 'BUILD_OWNED_REVIEWED_EVIDENCE'
        || !Array.isArray(source.acceptances) || source.acceptances.length > 54) return { accepted, rejected: [{ reason: 'ACCEPTANCE_SOURCE_INVALID' }] };
    const counts = new Map();
    for (const row of source.acceptances) { const key = `${row?.presentation?.id}/${row?.channel}`; counts.set(key, (counts.get(key) || 0) + 1); }
    for (const row of source.acceptances) {
        const key = `${row?.presentation?.id}/${row?.channel}`;
        try {
            if (counts.get(key) !== 1) reject('DUPLICATE_CHANNEL_PROOF');
            if (row.channel !== 'web' || !['nova-classic', 'nova-atelier'].includes(row.presentation?.id)) reject('UNREVIEWED_CHANNEL_IDENTITY');
            const identity = presentations.find(item => same(row.presentation, { id: item.id, version: item.version, digest: item.digest }) && item.channels.includes(row.channel));
            if (!identity) reject('PRESENTATION_IDENTITY_MISMATCH');
            if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.bundles)) reject('RENDERER_MANIFEST_MISSING');
            const matches = manifest.bundles.filter(bundle => same(bundle.presentation, row.presentation) && bundle.channel === row.channel);
            if (matches.length !== 1) reject('RENDERER_IDENTITY_MISMATCH');
            const bundle = matches[0];
            if (!sha(row.rendererSourceDigest) || row.rendererSourceDigest !== bundle.sourceDigest || !sha(row.artifactDigest)) reject('RENDERER_SOURCE_MISMATCH');
            if (!Array.isArray(bundle.files) || !bundle.files.length || bundle.files.length > 256 || !Array.isArray(bundle.sourceFiles) || !bundle.sourceFiles.length) reject('RENDERER_FILE_INVENTORY_INVALID');
            for (const [files, read] of [[bundle.files, readBuild], [bundle.sourceFiles, readSource]]) {
                const paths = new Set();
                for (const file of files) {
                    if (!safe(file.path) || !sha(file.sha256) || paths.has(file.path)) reject('RENDERER_FILE_INVENTORY_INVALID');
                    paths.add(file.path);
                    if (hash(read(file.path)) !== file.sha256) reject('RENDERER_BYTES_CHANGED');
                }
            }
            if (!bundle.files.some(file => file.path === bundle.entryPoint) || CAPABILITIES.some(code => bundle.commerceCapabilities?.[code] !== true)) reject('CUSTOMER_RUNTIME_INCOMPLETE');
            const digest = hash(JSON.stringify({ presentation: bundle.presentation, originalSource: identity.sourceFiles, behaviorSources: bundle.sourceFiles, files: bundle.files }));
            if (digest !== row.rendererSourceDigest) reject('RENDERER_SOURCE_DIGEST_INVALID');
            if (row.phase !== 'COMPATIBILITY_ACCEPTED_PRE_PUBLICATION' || row.storeActivation !== 'NOT_ASSERTED') reject('ACCEPTANCE_PHASE_INVALID');
            for (const gate of GATES) {
                if (row.gates?.[gate]?.status !== 'PASS') reject('REQUIRED_GATE_NOT_PASS');
                evidence(row.gates[gate].evidence, readEvidence);
            }
            const publication = row.gates.publication;
            if (publication.phase !== 'BUILD_VALIDATION_PASS' || publication.regression?.status !== 'PASS'
                || publication.regression.provenance !== 'REAL_POSTGRES_WITH_EXPLICIT_AUTHORITY_DOUBLES') reject('PUBLICATION_VALIDATION_PROVENANCE_REQUIRED');
            evidence(publication.regression.evidence, readEvidence);
            if (!Array.isArray(row.responsive) || row.responsive.length !== WIDTHS.length * ROUTES.length) reject('RESPONSIVE_MATRIX_INCOMPLETE');
            const cases = new Set();
            for (const item of row.responsive) {
                const caseId = `${item.width}/${item.route}`;
                if (!WIDTHS.includes(item.width) || !ROUTES.includes(item.route) || item.status !== 'PASS' || cases.has(caseId)) reject('RESPONSIVE_MATRIX_INVALID');
                cases.add(caseId); evidence(item.evidence, readEvidence);
            }
            accepted.set(key, { proofSHA256: hash(JSON.stringify(row)), rendererSourceDigest: row.rendererSourceDigest,
                artifactDigest: row.artifactDigest, phase: row.phase, storeActivation: row.storeActivation });
        } catch (error) { rejected.push({ key, reason: error.message || 'ACCEPTANCE_INVALID' }); }
    }
    return { accepted, rejected };
}

function readOwned(root, relative) {
    if (!safe(relative)) reject('OWNED_PATH_INVALID');
    let target = root;
    if (fs.lstatSync(target).isSymbolicLink()) reject('OWNED_PATH_SYMLINK');
    for (const part of relative.split('/')) { target = path.join(target, part); if (fs.lstatSync(target).isSymbolicLink()) reject('OWNED_PATH_SYMLINK'); }
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size > 67108864) reject('OWNED_FILE_INVALID');
    return fs.readFileSync(target);
}
function loadBuildAcceptance(root, presentations) {
    try {
        const source = JSON.parse(readOwned(root, 'theme-platform/presentation-acceptance.json'));
        // An empty checked-in source needs no local build and grants no readiness.
        if (source?.schemaVersion === 1 && source.authority === 'BUILD_OWNED_REVIEWED_EVIDENCE' && source.acceptances?.length === 0) return { accepted: new Map(), rejected: [] };
        const manifest = JSON.parse(readOwned(root, 'studio-core/dist/renderer-bundles.json'));
        return evaluateAcceptance({ source, presentations, manifest, readEvidence: name => readOwned(root, name),
            readBuild: name => readOwned(root, `studio-core/dist/${name}`), readSource: name => readOwned(root, name) });
    } catch (error) { return { accepted: new Map(), rejected: [{ reason: error.message || 'ACCEPTANCE_UNAVAILABLE' }] }; }
}
module.exports = { WIDTHS, ROUTES, evaluateAcceptance, loadBuildAcceptance };
