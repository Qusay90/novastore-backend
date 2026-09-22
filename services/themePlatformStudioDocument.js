'use strict';

// The server validates the same native document model used by the copied Studio.
// Normalization is only a validator here: changes/default insertion are rejected.
const { normalizeWithDefaults } = require('../studio-core/src/sandbox/documentModel.js');
const fail = (code = 'THEME_INVALID_STUDIO_DOCUMENT', status = 400) => require('./themePlatformValidation').fail(code, status);
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : plain(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const clone = value => structuredClone(value);
const equal = (a, b) => canonical(a) === canonical(b);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PACKAGE = /^theme-assets\/[a-z0-9_-]+\/[a-z0-9_-]+\.(?:png|webp|jpg)$/;
const IMAGE_FIELDS = new Set(['image', 'mobileImage', 'imageUrl', 'src', 'imageSrc']);
const {validateStudio,bounded,blockList,collect,assetRefs,packagedAssetKeys,commerceReferences}=require('../studio-core/src/studio-integration/native-document-validation.js').createNativeDocumentValidator(fail);
function validateBase(input) {
    if (!plain(input) || input.schemaVersion !== 2 || Object.keys(input).sort().join(',') !== 'schemaVersion,studio') fail();
    validateStudio(input.studio, true);
    return clone(input);
}
function deepMerge(base, patch) {
    if (!plain(patch)) return clone(patch);
    const result = clone(base);
    for (const [key, value] of Object.entries(patch)) {
        if (!Object.hasOwn(base, key)) fail('THEME_INVALID_STUDIO_OVERRIDE');
        result[key] = plain(value) && plain(base[key]) ? deepMerge(base[key], value) : clone(value);
    }
    return result;
}
function validateOverrides(input, base) {
    validateBase(base);
    if (!plain(input) || Object.keys(input).some(key => key !== 'studio') || (input.studio !== undefined && !plain(input.studio))) fail('THEME_INVALID_STUDIO_OVERRIDE');
    bounded(input, false);
    const allowed = new Set(packagedAssetKeys(base));
    for (const key of collect(input, value => value.startsWith('package:'))) if (!allowed.has(key.slice(8))) fail('THEME_OVERRIDE_PACKAGED_ASSET_FORBIDDEN');
    const merged = deepMerge(base.studio, input.studio || {});
    validateStudio(merged, false);
    const original = new Map(blockList(base.studio).map(block => [block.id, block.type]));
    if (blockList(merged).some(block => original.has(block.id) && original.get(block.id) !== block.type)) fail('THEME_IMMUTABLE_COMPONENT_TYPE');
    return clone(input);
}
function merge(base, overrides) {
    validateOverrides(overrides, base);
    return { schemaVersion: 2, studio: deepMerge(base.studio, overrides.studio || {}) };
}
const components = input => blockList(input.studio).map(({ id, type }) => ({ id, type }));
function changedCapabilities(base, current = {}, next = {}) {
    return require('../studio-core/src/studio-integration/document-capabilities.js').documentCapabilities(merge(base,current).studio,merge(base,next).studio);
}
function createNativeExample({ name = 'Nova Classic', channel = 'web' } = {}) {
    const seed = { blocks: [], menus: [], pages: [], theme: { accent: '#2563eb', navy: '#14283e', radius: 12, family: channel === 'app' ? 'pocket' : 'nova-commerce', demoId: '' }, app: { bottomTabs: ['home', 'categories', 'cart', 'account'] }, chrome: { header: { logoText: name, tagline: '', announcement: '', showAnnouncement: false }, footer: { description: '', copyright: '', columns: [] } }, templates: {}, design: { name, blank: false, header: true, footer: true, navigation: true, elements: [] } };
    seed.blocks = [{ id: 'welcome', type: 'hero', title: 'Mağazanıza hoş geldiniz', description: 'Koleksiyonları keşfedin.', target: 'categories', buttonText: 'Kategoriler' }, { id: 'products', type: 'products', title: 'Ürünler', target: 'categories' }];
    const document = { schemaVersion: 2, studio: normalizeWithDefaults(seed, channel === 'app' ? 'android' : 'web', seed, true) };
    return validateBase(document);
}
module.exports = { validateBase, validateOverrides, merge, assetRefs, changedCapabilities, components, packagedAssetKeys, commerceReferences, createNativeExample };
