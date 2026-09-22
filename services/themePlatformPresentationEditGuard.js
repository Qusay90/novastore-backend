'use strict';

const v = require('./themePlatformValidation');
const { resolvePresentation } = require('./themePlatformPresentationService');
const editPolicy = require('../theme-platform/presentation-edit-policy.json');
const capabilityManifest = require('../theme-platform/presentation-capabilities.json');
const same = (left, right) => v.canonical(left) === v.canonical(right);
const unsupported = () => v.fail(editPolicy.errorCode, 400);

function validateVisualContent(document, policy) {
    const visualReplacementPatterns = policy.visualReplacementPatterns.map(pattern => new RegExp(pattern));
    const elements = document?.studio?.design?.elements;
    if (!Array.isArray(elements)) return; // The strict native validator rejects malformed structure.
    for (const element of elements) {
        if (!v.plain(element) || typeof element.id !== 'string') continue;
        if (element.content !== undefined) {
            const allowed = policy.visualContent[element.id];
            if (!allowed || !v.plain(element.content) || Object.keys(element.content).some(key => !allowed.includes(key))) unsupported();
        }
        // Free visual image replacement is an alternate content override. Keep
        // canonical images in the catalog; authored images use typed block paths.
        if (element.visual !== undefined && !policy.visualReplacementIds.includes(element.id)
            && !visualReplacementPatterns.some(pattern => pattern.test(element.id))) unsupported();
    }
}

// A descriptor selects reviewed executable code, not a generic native renderer.
// Reject data which that renderer cannot honor; otherwise an apparently successful
// save would silently discard campaigns, navigation or product-source choices.
function compareSupported(reference, proposed, path = '', policy = editPolicy) {
    const mutablePaths = new Set(policy.mutablePaths);
    if (same(reference, proposed) || mutablePaths.has(path)) return;
    if (path === 'studio.blocks') {
        if (!Array.isArray(reference) || !Array.isArray(proposed)
            || reference.length !== policy.blocks.length || proposed.length !== reference.length) unsupported();
        for (let index = 0; index < policy.blocks.length; index++) {
            const slot = policy.blocks[index], before = reference[index], next = proposed[index];
            if (!before || !next || before.id !== slot.id || next.id !== slot.id
                || before.type !== slot.type || next.type !== slot.type) unsupported();
            if (Object.keys(before).sort().join(',') !== Object.keys(next).sort().join(',')) unsupported();
            for (const key of Object.keys(before)) if (!slot.mutableFields.includes(key) && !same(before[key], next[key])) unsupported();
            if (slot.type === 'hero') {
                const campaign = policy.heroCampaign;
                if (!campaign.targets.includes(next.target) && !/^(product|category):[1-9][0-9]{0,9}$/.test(next.target)) unsupported();
                if (!campaign.customWhenNonempty.some(key => next[key]) && campaign.ctaFields.some(key => !same(before[key], next[key]))) unsupported();
            }
        }
        return;
    }
    if (!v.plain(reference) || !v.plain(proposed)
        || Object.keys(reference).sort().join(',') !== Object.keys(proposed).sort().join(',')) unsupported();
    for (const key of Object.keys(reference)) compareSupported(reference[key], proposed[key], path ? `${path}.${key}` : key, policy);
}

function validatePresentationDocument(presentation, base, document = base) {
    if (!presentation) return document; // Legacy schema samples retain their contract.
    resolvePresentation(presentation, { schemaVersion: base?.schemaVersion, channels: ['web'] });
    const selected = capabilityManifest.presentations[presentation.id];
    if (!selected || selected.version !== presentation.version || !selected.channels.includes('web')) unsupported();
    // Paths originate solely from this reviewed manifest, never a package value.
    const policy = require(`../theme-platform/${selected.policyFile}`);
    const native = require('./themePlatformStudioDocument');
    native.validateBase(base);
    if (document?.schemaVersion !== 2) unsupported();
    validateVisualContent(base, policy);
    validateVisualContent(document, policy);
    require('../studio-core/src/studio-integration/native-document-validation.js').createNativeDocumentValidator(v.fail).validateStudio(document.studio, false);
    // This local immutable reference is authored with the reviewed Classic package.
    // Even a newly imported package cannot tag an arbitrary layout as Classic.
    const reference = require(`../theme-platform/packages/${selected.referencePackage}`).document;
    compareSupported(reference, base, '', policy);
    compareSupported(base, document, '', policy);
    return document;
}

async function validateStoredPresentationDocument(client, themeVersionId, channel, document) {
    const row = (await client.query(`SELECT v.document,p.manifest FROM theme_versions v
        LEFT JOIN theme_version_packages p ON p.theme_version_id=v.id WHERE v.id=$1`, [v.uuid(themeVersionId)])).rows[0];
    if (!row) v.fail('THEME_NOT_FOUND', 404);
    const presentation = resolvePresentation(row.manifest?.renderer?.presentation, { schemaVersion: row.document.schemaVersion, channels: [channel] });
    return validatePresentationDocument(presentation, row.document, document);
}

module.exports = Object.freeze({ editPolicy, validatePresentationDocument, validateStoredPresentationDocument });
