'use strict';

const v = require('./themePlatformValidation');
const registry = require('../theme-platform/presentations.json');
const capabilityManifest = require('../theme-platform/presentation-capabilities.json');

// Only an immutable, reviewed build identity selects renderer code. Neither an
// uploaded package nor a seller draft can provide code, URLs or arbitrary IDs.
function resolvePresentation(value, { schemaVersion = 2, channels = [] } = {}) {
    if (value === undefined || value === null) return null;
    v.keys(value, ['id', 'version', 'digest'], ['id', 'version', 'digest']);
    if (schemaVersion !== 2 || !Array.isArray(channels) || !channels.length) v.fail('THEME_PRESENTATION_UNSUPPORTED');
    const entry = registry.presentations.find(item => item.id === value.id && item.version === value.version);
    if (!entry || value.digest !== entry.digest || channels.some(channel => !entry.channels.includes(channel))) {
        v.fail('THEME_PRESENTATION_UNSUPPORTED');
    }
    return Object.freeze({ id: entry.id, version: entry.version, digest: entry.digest });
}

async function loadPresentation(client, themeVersionId, channel) {
    // The version comes from the authorized assignment/candidate/domain binding,
    // never a draft override. Historic packages have no presentation descriptor.
    const row = (await client.query(`SELECT p.manifest,v.document->>'schemaVersion' AS schema_version
        FROM theme_version_packages p JOIN theme_versions v ON v.id=p.theme_version_id
        WHERE p.theme_version_id=$1`, [v.uuid(themeVersionId)])).rows[0];
    return resolvePresentation(row?.manifest?.renderer?.presentation, {
        schemaVersion: Number(row?.schema_version), channels: [channel]
    });
}

function presentationMetadata(manifest, schemaVersion) {
    const presentation = resolvePresentation(manifest?.renderer?.presentation, { schemaVersion, channels: manifest?.supportedChannels || [] });
    const entry = presentation && registry.presentations.find(item => item.id === presentation.id && item.version === presentation.version);
    const supportedChannels = manifest?.supportedChannels || [];
    const readiness = supportedChannels.map(channel => presentationReadiness(presentation, channel));
    return { presentation, sourceThemeId: entry?.sourceThemeId || null,
        presentationReadiness: readiness,
        assignmentEligible: readiness.length > 0 && readiness.every(item => item.assignmentEligible),
        rendererCapabilities: Object.fromEntries(supportedChannels.map(channel => [channel, rendererCapabilities(presentation, channel)])) };
}

function presentationReadiness(value, channel = 'web') {
    const presentation = resolvePresentation(value, { schemaVersion: 2, channels: [channel] });
    const entry = presentation && registry.presentations.find(item => item.id === presentation.id && item.version === presentation.version);
    const record = entry && registry.inventory.find(item => item.themeId === entry.sourceThemeId && item.channel === channel);
    const eligible = !!record && record.status === 'READY' && record.presentationReady === true && record.runtimeReady === true
        && record.acceptance?.presentation === 'PASS' && record.acceptance?.customerRuntime === 'PASS'
        && record.acceptance?.singleStoreRuntime === 'PASS' && record.acceptance?.publication === 'PASS';
    return { themeId: entry?.sourceThemeId || null, channel, status: record?.status || 'UNSUPPORTED',
        presentationReady: record?.presentationReady === true, runtimeReady: record?.runtimeReady === true,
        assignmentEligible: eligible, localPreviewSupported: !!entry, acceptance: record?.acceptance || {},
        reason: record?.reason || 'Bu tema henüz canlı presentation için hazır değil.' };
}

function rendererCapabilities(value, channel = 'web') {
    const presentation = resolvePresentation(value, { schemaVersion: 2, channels: [channel] });
    const selected = presentation && capabilityManifest.presentations[presentation.id];
    const supported = selected?.version === presentation?.version && selected?.channels.includes(channel);
    return Object.fromEntries(Object.keys(capabilityManifest.capabilityCodes).map(code => [code,
        supported && selected.capabilities[code] ? { ...selected.capabilities[code] } : { status: 'UNSUPPORTED', maxState: 'HIDDEN' }]));
}

// Renderer support can only restrict already-computed server authorization.
// Call for the actual candidate/assignment; never substitute another identity.
function intersectPresentationCapabilities(policy, presentation, channel = 'web') {
    const limits = rendererCapabilities(presentation, channel), ranks = { HIDDEN: 0, READ_ONLY: 1, EDITABLE: 2, MANAGE: 3, PUBLISH: 4 };
    const decisions = Object.fromEntries(Object.entries(policy.capabilities || {}).map(([code, decision]) => {
        const limit = limits[code] || { status: 'UNSUPPORTED', maxState: 'HIDDEN' };
        const max = ['HIDDEN', 'UNSUPPORTED'].includes(limit.status) ? 'HIDDEN' : limit.status === 'READ_ONLY' ? 'READ_ONLY' : limit.maxState;
        const state = !Object.hasOwn(ranks, decision.state) ? 'HIDDEN' : ranks[decision.state] > ranks[max] ? max : decision.state;
        return [code, { ...decision, state, supported: decision.supported === true && limit.status !== 'UNSUPPORTED',
            rendererStatus: limit.status, rendererDetail: limit.detail || null,
            ...(state !== decision.state ? { reason: 'RENDERER_CAPABILITY_LIMIT' } : {}) }];
    }));
    return { ...policy, capabilities: decisions, presentationReadiness: presentationReadiness(presentation, channel) };
}

function requireAssignablePresentation(value, channel = 'web') {
    const readiness = presentationReadiness(value, channel);
    if (!readiness.assignmentEligible) v.fail('THEME_PRESENTATION_NOT_READY', 409);
    return readiness;
}

module.exports = Object.freeze({ resolvePresentation, loadPresentation, presentationMetadata,
    presentationReadiness, rendererCapabilities, intersectPresentationCapabilities, requireAssignablePresentation });
