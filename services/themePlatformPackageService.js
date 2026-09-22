'use strict';

const crypto = require('node:crypto');
const v = require('./themePlatformValidation');
const { detectFormat, decodeBase64 } = require('./themePlatformAssetStorage');
const { resolvePresentation } = require('./themePlatformPresentationService');

const RENDERER = Object.freeze({ id: 'novastore-studio-core', version: '1.0.0' });
const MIME = Object.freeze({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' });
const packageKeys = ['format', 'packageVersion', 'theme', 'renderer', 'schemaVersion', 'supportedChannels',
    'requiredCapabilities', 'components', 'assets', 'thumbnails', 'document'];
const sha = (value) => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) v.fail('THEME_PACKAGE_DIGEST_INVALID'); return value; };
const uniqueArray = (value, limit, code) => {
    if (!Array.isArray(value) || value.length > limit || new Set(value).size !== value.length) v.fail(code);
};

const validateThemePackage = (input, { capabilityCodes } = {}) => {
    v.keys(input, packageKeys, packageKeys);
    if (input.format !== 'novastore-theme-package' || input.packageVersion !== 1
        || ![1, 2].includes(input.schemaVersion) || input.document?.schemaVersion !== input.schemaVersion) v.fail('THEME_PACKAGE_FORMAT_UNSUPPORTED');
    v.keys(input.theme, ['slug', 'name', 'version', 'industry'], ['slug', 'name', 'version', 'industry']);
    if (typeof input.theme.slug !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/u.test(input.theme.slug)) v.fail('THEME_INVALID_SLUG');
    v.text(input.theme.name, 160); v.text(input.theme.industry, 120);
    if (typeof input.theme.version !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/u.test(input.theme.version)) v.fail('THEME_INVALID_VERSION');
    v.keys(input.renderer, ['id', 'version', 'presentation'], ['id', 'version']);
    if (input.renderer.id !== RENDERER.id || input.renderer.version !== RENDERER.version) v.fail('THEME_PACKAGE_RENDERER_UNSUPPORTED');
    uniqueArray(input.supportedChannels, 2, 'THEME_PACKAGE_CHANNEL_INVALID');
    if (!input.supportedChannels.length) v.fail('THEME_PACKAGE_CHANNEL_INVALID');
    input.supportedChannels.forEach((channel) => v.choice(channel, ['web', 'app']));
    const presentation = resolvePresentation(input.renderer.presentation, { schemaVersion: input.schemaVersion, channels: input.supportedChannels });
    if (!Array.isArray(capabilityCodes) || !capabilityCodes.length) v.fail('THEME_PACKAGE_CAPABILITY_CATALOG_REQUIRED', 503);
    uniqueArray(input.requiredCapabilities, 60, 'THEME_PACKAGE_CAPABILITY_INVALID');
    for (const code of input.requiredCapabilities) {
        if (typeof code !== 'string' || !capabilityCodes.includes(code)
            || ['theme.direct_publish', 'theme.scheduling', 'theme.custom_css', 'theme.custom_html', 'theme.custom_js', 'theme.ai_builder'].includes(code)) v.fail('THEME_PACKAGE_CAPABILITY_UNSUPPORTED');
    }
    const native = input.document.schemaVersion === 2 ? require('./themePlatformStudioDocument') : null;
    if (native) native.validateBase(input.document); else v.document(input.document);
    const document = structuredClone(input.document);
    require('./themePlatformPresentationEditGuard').validatePresentationDocument(presentation, document);
    const documentDigest = v.digest(document);
    const documentComponents = native ? native.components(document) : document.components;
    if (native && input.supportedChannels.length !== 1) v.fail('THEME_PACKAGE_NATIVE_CHANNEL_REQUIRED');
    if (!Array.isArray(input.components) || input.components.length !== documentComponents.length) v.fail('THEME_PACKAGE_COMPONENT_MISMATCH');
    const definitions = new Map();
    for (const definition of input.components) {
        v.keys(definition, ['id', 'type'], ['id', 'type']);
        v.identifier(definition.id);
        if (definitions.has(definition.id)) v.fail('THEME_PACKAGE_COMPONENT_MISMATCH');
        definitions.set(definition.id, definition.type);
    }
    for (const component of documentComponents) if (definitions.get(component.id) !== component.type) v.fail('THEME_PACKAGE_COMPONENT_MISMATCH');
    if (!Array.isArray(input.assets) || input.assets.length > 32) v.fail('THEME_PACKAGE_ASSETS_INVALID');
    const assets = new Map();
    const assetInputs = [];
    let totalBytes = 0;
    for (const item of input.assets) {
        v.keys(item, ['key', 'mimeType', 'sha256', 'width', 'height', 'bytesBase64'], ['key', 'mimeType', 'sha256', 'width', 'height', 'bytesBase64']);
        const expression = new RegExp(`^theme-assets/${input.theme.slug}/[a-z0-9_-]+\\.(png|jpg|webp)$`, 'u');
        const match = typeof item.key === 'string' && expression.exec(item.key);
        if (!match || assets.has(item.key)) v.fail('THEME_PACKAGE_ASSET_KEY_INVALID');
        sha(item.sha256); v.integer(item.width, 1, 8192); v.integer(item.height, 1, 8192);
        if (item.width * item.height > 16777216) v.fail('THEME_ASSET_DIMENSIONS_REJECTED');
        const bytes = decodeBase64(item.bytesBase64);
        totalBytes += bytes.length;
        if (totalBytes > 16777216) v.fail('THEME_PACKAGE_SIZE_LIMIT', 413);
        const format = detectFormat(bytes);
        const extension = format === 'jpeg' ? 'jpg' : format;
        if (item.mimeType !== MIME[format] || match[1] !== extension) v.fail('THEME_PACKAGE_ASSET_MIME_MISMATCH');
        if (v.digest(bytes) !== item.sha256) v.fail('THEME_PACKAGE_ASSET_HASH_MISMATCH');
        const descriptor = { key: item.key, mimeType: item.mimeType, sha256: item.sha256, width: item.width, height: item.height };
        assets.set(item.key, descriptor);
        assetInputs.push({ ...descriptor, bytes });
    }
    const imageKeys = native ? native.packagedAssetKeys(document)
        : document.components.map((component) => component.props.imageKey).filter(Boolean);
    for (const key of imageKeys) if (!assets.has(key)) v.fail('THEME_PACKAGE_ASSET_REFERENCE_MISSING');
    if (native) {
        const references = native.commerceReferences(document);
        if (references.productIds.length || references.categoryIds.length || references.collectionIds.length || references.assetIds.length) {
            v.fail('THEME_PACKAGE_COMMERCE_BINDING_FORBIDDEN');
        }
    }
    for (const component of native ? [] : document.components) {
        if (Object.hasOwn(component.props, 'productIds') && component.props.productIds.length
            || Object.hasOwn(component.props, 'categoryIds') && component.props.categoryIds.length) {
            // A reusable global base cannot carry tenant-specific product IDs.
            // Assignment overrides are resolved against canonical commerce later.
            v.fail('THEME_PACKAGE_COMMERCE_BINDING_FORBIDDEN');
        }
    }
    if (!Array.isArray(input.thumbnails) || input.thumbnails.length !== input.supportedChannels.length) v.fail('THEME_PACKAGE_THUMBNAIL_REQUIRED');
    const channels = new Set();
    const thumbnails = input.thumbnails.map((thumbnail) => {
        v.keys(thumbnail, ['channel', 'assetKey', 'documentDigest'], ['channel', 'assetKey', 'documentDigest']);
        if (!input.supportedChannels.includes(thumbnail.channel) || channels.has(thumbnail.channel) || !assets.has(thumbnail.assetKey)) v.fail('THEME_PACKAGE_THUMBNAIL_INVALID');
        channels.add(thumbnail.channel); sha(thumbnail.documentDigest);
        return { ...thumbnail, stale: thumbnail.documentDigest !== documentDigest };
    });
    const manifest = { format: input.format, packageVersion: 1, theme: structuredClone(input.theme), renderer: { ...RENDERER, ...(presentation ? { presentation } : {}) },
        schemaVersion: document.schemaVersion, supportedChannels: [...input.supportedChannels], requiredCapabilities: [...input.requiredCapabilities],
        components: structuredClone(input.components), assets: [...assets.values()], thumbnails, documentDigest };
    return Object.freeze({ document, documentDigest, manifest, assetInputs });
};

const prepareThemePackage = async (input, { themeVersionId, storage, capabilityCodes } = {}) => {
    themeVersionId = v.uuid(themeVersionId);
    if (!storage || typeof storage.stagePackage !== 'function' || typeof storage.promote !== 'function'
        || typeof storage.discard !== 'function') v.fail('THEME_ASSET_STORAGE_UNAVAILABLE', 503);
    const validated = validateThemePackage(input, { capabilityCodes });
    const handles = [];
    const assets = [];
    const cleanup = async () => {
        const results = await Promise.allSettled(handles.map((handle) => storage.discard(handle)));
        if (results.some((result) => result.status === 'rejected')) v.fail('THEME_PACKAGE_CLEANUP_REQUIRED', 503);
    };
    try {
        for (const asset of validated.assetInputs) {
            const handle = await storage.stagePackage({ themeVersionId, assetId: crypto.randomUUID(), bytes: asset.bytes });
            handles.push(handle);
            const prepared = await storage.promote(handle);
            if (prepared.width !== asset.width || prepared.height !== asset.height) v.fail('THEME_PACKAGE_ASSET_DIMENSIONS_MISMATCH');
            assets.push({ assetKey: asset.key, ...prepared });
        }
        const manifest = { ...validated.manifest, assets: assets.map((asset) => ({ key: asset.assetKey, mimeType: asset.detectedMime,
            sha256: asset.digest, originalDigest: asset.originalDigest, byteSize: asset.byteSize, width: asset.width, height: asset.height })) };
        return Object.freeze({ document: validated.document, documentDigest: validated.documentDigest, manifest,
            packageDigest: v.digest(manifest), assets, cleanup });
    } catch (error) { await cleanup(); throw error; }
};

module.exports = Object.freeze({ RENDERER, validateThemePackage, prepareThemePackage });
