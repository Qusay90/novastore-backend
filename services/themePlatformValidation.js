'use strict';

const crypto = require('node:crypto');

class ThemePlatformError extends Error {
    constructor(code, statusCode = 400) { super(code); this.code = code; this.statusCode = statusCode; }
}
const fail = (code, status = 400) => { throw new ThemePlatformError(code, status); };
const plain = (value) => !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, allowed, required = []) => {
    if (!plain(value) || Object.keys(value).some((key) => !allowed.includes(key))
        || required.some((key) => !Object.hasOwn(value, key))) fail('THEME_INVALID_FIELDS');
    return value;
};
const text = (value, max = 160, min = 1) => {
    if (typeof value !== 'string' || value.length < min || value.length > max
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) fail('THEME_INVALID_TEXT');
    return value;
};
const uuid = (value) => {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) fail('THEME_INVALID_ID');
    return value.toLowerCase();
};
const integer = (value, min = 1, max = 2147483646) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail('THEME_INVALID_INTEGER');
    return value;
};
const choice = (value, choices) => { if (!choices.includes(value)) fail('THEME_INVALID_CHOICE'); return value; };
const boolean = (value) => { if (typeof value !== 'boolean') fail('THEME_INVALID_BOOLEAN'); return value; };
const date = (value, nullable = false) => {
    if (nullable && value === null) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)
        || !Number.isFinite(Date.parse(value))) fail('THEME_INVALID_UTC_DATE');
    const normalized = new Date(value).toISOString();
    if (normalized.slice(0, 19) !== value.slice(0, 19)) fail('THEME_INVALID_UTC_DATE');
    return normalized;
};
const canonical = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
};
const digest = (value) => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
const identifier = (value) => {
    text(value, 80);
    if (!/^[a-z][a-z0-9_-]*$/u.test(value)) fail('THEME_INVALID_IDENTIFIER');
    return value;
};
const TOKENS = Object.freeze({
    accent: 'color', background: 'color', surface: 'color', text: 'color', muted: 'color',
    fontFamily: 'font', fontSize: 'fontSize', radius: 'radius', spacing: 'spacing'
});
const TYPES = Object.freeze({
    header: ['title', 'subtitle', 'imageKey', 'imageAssetId', 'label', 'target'],
    hero: ['title', 'subtitle', 'imageKey', 'imageAssetId', 'label', 'target'],
    text: ['title', 'text'], image: ['imageKey', 'imageAssetId', 'alt', 'target'],
    product_grid: ['title', 'productIds', 'columns'], category_grid: ['title', 'categoryIds', 'columns'],
    footer: ['title', 'text'], campaign: ['title', 'subtitle', 'imageKey', 'imageAssetId', 'label', 'target']
});
const tokens = (input) => {
    keys(input, Object.keys(TOKENS));
    for (const [key, value] of Object.entries(input)) {
        const type = TOKENS[key];
        if (type === 'color' && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/iu.test(value))) fail('THEME_INVALID_COLOR');
        if (type === 'font') choice(value, ['system', 'sans', 'serif', 'mono']);
        if (type === 'fontSize') integer(value, 10, 72);
        if (type === 'radius') integer(value, 0, 64);
        if (type === 'spacing') integer(value, 0, 96);
    }
    return input;
};
const props = (input, type, base = false) => {
    keys(input, TYPES[type] || []);
    for (const [key, value] of Object.entries(input)) {
        if (['title', 'subtitle', 'label', 'alt'].includes(key)) text(value, 240, 0);
        if (key === 'text') text(value, 4000, 0);
        if (key === 'imageAssetId') { if (base) fail('THEME_BASE_SELLER_ASSET_FORBIDDEN'); uuid(value); }
        if (key === 'imageKey') {
            if (!base) fail('THEME_OVERRIDE_PACKAGED_ASSET_FORBIDDEN');
            text(value, 180);
            if (!/^theme-assets\/[a-z0-9_-]+\/[a-z0-9_-]+\.(?:png|webp|jpg)$/u.test(value)) fail('THEME_INVALID_PACKAGED_ASSET');
        }
        if (key === 'target') {
            text(value, 160);
            if (!/^\/(?:home|shop|account|cart|help|category\/[a-z0-9-]+|product\/[a-z0-9-]+)$/u.test(value)) fail('THEME_INVALID_TARGET');
        }
        if (key === 'columns') integer(value, 1, 6);
        if (key === 'productIds' || key === 'categoryIds') {
            if (!Array.isArray(value) || value.length > 100 || new Set(value).size !== value.length) fail('THEME_INVALID_REFERENCES');
            value.forEach((id) => integer(id));
        }
    }
    return input;
};
const assetIds = (input) => {
    if (!Array.isArray(input) || input.length > 50 || new Set(input).size !== input.length) fail('THEME_INVALID_ASSETS');
    input.forEach(uuid);
    return input;
};
const document = (input) => {
    keys(input, ['schemaVersion', 'tokens', 'components', 'assetIds'], ['schemaVersion', 'tokens', 'components', 'assetIds']);
    if (input.schemaVersion !== 1) fail('THEME_SCHEMA_UNSUPPORTED');
    tokens(input.tokens); assetIds(input.assetIds);
    if (input.assetIds.length) fail('THEME_BASE_SELLER_ASSET_FORBIDDEN');
    if (!Array.isArray(input.components) || input.components.length < 1 || input.components.length > 100) fail('THEME_INVALID_COMPONENTS');
    const ids = new Set();
    for (const component of input.components) {
        keys(component, ['id', 'type', 'props'], ['id', 'type', 'props']);
        identifier(component.id); choice(component.type, Object.keys(TYPES));
        if (ids.has(component.id)) fail('THEME_DUPLICATE_COMPONENT');
        ids.add(component.id); props(component.props, component.type, true);
    }
    if (Buffer.byteLength(canonical(input)) > 100000) fail('THEME_DOCUMENT_TOO_LARGE', 413);
    return input;
};
const overrides = (input, base) => {
    keys(input, ['tokens', 'components', 'assetIds'], ['tokens', 'components', 'assetIds']);
    tokens(input.tokens); assetIds(input.assetIds);
    if (!Array.isArray(input.components) || input.components.length > 100) fail('THEME_INVALID_COMPONENTS');
    const ids = new Set();
    for (const item of input.components) {
        keys(item, ['componentId', 'props', 'hidden', 'order'], ['componentId', 'props']);
        identifier(item.componentId);
        const original = base.components.find((component) => component.id === item.componentId);
        if (!original || ids.has(item.componentId)) fail('THEME_UNKNOWN_OR_DUPLICATE_COMPONENT');
        ids.add(item.componentId); props(item.props, original.type);
        if (Object.hasOwn(item, 'hidden')) boolean(item.hidden);
        if (Object.hasOwn(item, 'order')) integer(item.order, 0, 99);
    }
    if (Buffer.byteLength(canonical(input)) > 100000) fail('THEME_DOCUMENT_TOO_LARGE', 413);
    return input;
};
const references = (input) => [...new Set([...input.assetIds, ...input.components.map((item) => item.props.imageAssetId).filter(Boolean)])];
const artifact = (base, input) => ({
    schemaVersion: 1, tokens: { ...base.tokens, ...input.tokens },
    components: base.components.map((component, index) => {
        const patch = input.components.find((item) => item.componentId === component.id);
        const merged = { ...component.props, ...patch?.props };
        if (patch?.props?.imageAssetId) delete merged.imageKey;
        return { ...component, props: merged, hidden: patch?.hidden || false, order: patch?.order ?? index };
    }).sort((a, b) => a.order - b.order), assetIds: references(input)
});
const upload = (input) => {
    text(input, 700000);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(input)) fail('THEME_INVALID_ASSET_BYTES');
    const bytes = Buffer.from(input, 'base64');
    if (!bytes.length || bytes.length > 524288) fail('THEME_ASSET_SIZE_LIMIT', 413);
    let mime;
    if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = 'image/png';
    else if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
    else if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
    else fail('THEME_ASSET_MIME_REJECTED');
    // Signature detection is NOT a decoder or malware scan. Registration remains quarantined.
    return { detectedMime: mime, byteSize: bytes.length, digest: digest(bytes) };
};

module.exports = Object.freeze({ ThemePlatformError, fail, plain, keys, text, uuid, integer, choice,
    boolean, date, canonical, digest, identifier, tokens, document, overrides, references, artifact, upload });
