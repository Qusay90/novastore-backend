'use strict';

// Build-owned catalogue only. This never executes a theme script or mutates DB.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const v = require('../services/themePlatformValidation');
const root = path.resolve(__dirname, '..');
const libraryRoot = path.join(root, 'studio-core/workshop-public/theme-library');
const registryPath = path.join(root, 'theme-platform/presentations.json');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const capabilities = require('../theme-platform/presentation-capabilities.json');
const { loadBuildAcceptance } = require('./lib/themePresentationAcceptance');

function buildRegistry() {
    const registry = json(registryPath);
    const classic = registry.presentations.find(entry => entry.id === 'nova-classic' && entry.version === '1.0.0');
    assert.equal(classic.digest, 'd8c72698fc9a4be3f6393dbe47b6ff5ed981d67ea24896e0fb8ef159daf91668');
    const { digest, ...identity } = classic;
    assert.equal(v.digest(identity), digest, 'Classic identity changed');
    const library = json(path.join(libraryRoot, 'theme-library.json'));
    const authoring = json(path.join(root, 'studio-core/src/sandbox/sectorThemeRegistry.json'));
    const provenance = json(path.join(root, 'studio-core/workshop-gallery-provenance.json'));
    const proofs = new Map(provenance.entries.map(entry => [entry.path, entry]));
    assert.equal(library.themes.length, 27);
    assert.deepEqual(library.themes.map(t => t.id).sort(), authoring.themes.map(t => t.id).sort());
    function source(relative) {
        assert(!relative.includes('..') && !path.isAbsolute(relative), 'Invalid source path');
        const bytes = fs.readFileSync(path.join(libraryRoot, relative));
        const proof = proofs.get(relative);
        assert(proof, `Missing provenance: ${relative}`);
        assert.equal(v.digest(bytes), proof.sha256, `Source drift: ${relative}`);
        return { path: relative, sha256: v.digest(bytes), bytes: bytes.length };
    }
    const atelierFiles = ['themes/02-atelier/theme.js', 'themes/02-atelier/theme.css',
        'shared/core.js', 'shared/core.css', 'shared/support-contract.js', 'shared/theme-host-bridge.js'].map(source);
    const atelierIdentity = { id: 'nova-atelier', version: '1.0.0', sourceThemeId: '02-atelier', channels: ['web'], sourceFiles: atelierFiles };
    const atelier = { ...atelierIdentity, digest: v.digest(atelierIdentity) };
    const reviewed = [classic, atelier];
    const proofsByChannel = loadBuildAcceptance(root, reviewed).accepted;
    const inventory = library.themes.flatMap(theme => ['web', 'app'].map(channel => {
        const presentation = reviewed.find(entry => entry.sourceThemeId === theme.id && entry.channels.includes(channel));
        const policy = presentation && capabilities.presentations[presentation.id];
        const editableCapabilities = policy ? Object.fromEntries(Object.entries(policy.capabilities).filter(([, item]) => item.status === 'SUPPORTED_EDIT')) : {};
        const unsupportedCapabilities = Object.keys(capabilities.capabilityCodes).filter(code => !policy || ['HIDDEN', 'UNSUPPORTED'].includes(policy.capabilities[code]?.status || 'UNSUPPORTED'));
        const classicAccepted = theme.id === '15-nova-classic' && channel === 'web';
        const accepted = presentation && proofsByChannel.get(`${presentation.id}/${channel}`);
        return {
            themeId: theme.id, channel, name: theme.name, industry: theme.sector,
            sourceIdentity: `${library.libraryId}/${theme.id}/${channel}`, sourceVersion: theme.version,
            rendererId: presentation?.id || null, rendererVersion: presentation?.version || null,
            documentSchemaVersion: 2, webSupport: channel === 'web', appSupport: channel === 'app',
            singleStoreSupport: accepted ? 'CANONICAL_CUSTOMER_RUNTIME' : presentation ? 'READ_ONLY_PREVIEW' : 'NOT_CONNECTED', marketplaceSupport: false,
            editableCapabilities, unsupportedCapabilities,
            previewAssets: { thumbnail: theme.thumbnail, sourceEntry: theme.entries[channel] },
            sourceHashes: [...new Set([theme.source.content, theme.source.tokens, theme.source.presentation, theme.source.styles,
                'shared/support-contract.js', 'shared/theme-host-bridge.js', theme.entries[channel]])].map(source),
            presentationReady: !!accepted || classicAccepted, runtimeReady: !!accepted, assignmentEligible: !!accepted,
            status: accepted ? 'READY' : 'PARTIAL', presentationStatus: accepted || classicAccepted ? 'READY' : presentation ? 'IMPLEMENTED_AWAITING_ACCEPTANCE' : 'SOURCE_ONLY',
            acceptance: accepted ? { source: 'VERIFIED', presentation: 'PASS', customerRuntime: 'PASS', singleStoreRuntime: 'PASS', publication: 'PASS', ...accepted }
                : { source: 'VERIFIED', presentation: classicAccepted ? 'ACCEPTED_CLASSIC_BASELINE' : 'PENDING',
                customerRuntime: 'NOT_CONNECTED', singleStoreRuntime: 'PENDING', publication: 'BLOCKED' },
            reason: accepted ? 'Bu derleme için sunum, müşteri işlemleri ve yayın öncesi uyumluluk doğrulandı. Mağaza yayını ayrıca yetkili etkinleştirme gerektirir.'
                : presentation ? 'Özgün sunum ayrı doğrulanır; müşteri işlemleri ve yayın kabulü tamamlanmadan kullanıma atanamaz.'
                : 'Kaynak demo korunuyor. Bu tema henüz canlı presentation için hazır değil.'
        };
    }));
    assert.equal(inventory.length, 54);
    return { ...registry, presentations: reviewed, inventorySchemaVersion: 1,
        readinessPolicy: 'READY requires channel presentation AND canonical customer runtime acceptance; demo presence is not readiness.',
        authoringSources: { registry: 'studio-core/src/sandbox/sectorThemeRegistry.json',
            registrySHA256: v.digest(fs.readFileSync(path.join(root, 'studio-core/src/sandbox/sectorThemeRegistry.json'))),
            role: 'AUTHORING_GALLERY_ONLY', runtimeAuthority: false }, inventory };
}

if (require.main === module) {
    const registry = buildRegistry();
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
    console.log(JSON.stringify({ families: 27, entries: registry.inventory.length, reviewedPresentations: registry.presentations.length,
        runtimeReady: registry.inventory.filter(entry => entry.runtimeReady).length }));
}
module.exports = { buildRegistry };
