import {normalizeWithDefaults} from '../sandbox/documentModel.js';
// One pure validator for server persistence and typed in-memory Studio previews.
// Ownership, capability and storage resolution remain server responsibilities.
export function createNativeDocumentValidator(fail=(code='THEME_INVALID_STUDIO_DOCUMENT')=>{throw Object.assign(new Error(code),{code});}) {
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : plain(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const clone = value => structuredClone(value);
const equal = (a, b) => canonical(a) === canonical(b);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PACKAGE = /^theme-assets\/[a-z0-9_-]+\/[a-z0-9_-]+\.(?:png|webp|jpg)$/;
const IMAGE_FIELDS = new Set(['image', 'mobileImage', 'imageUrl', 'src', 'imageSrc']);
const TOP = ['blocks', 'theme', 'menus', 'pages', 'app', 'chrome', 'commerce', 'templates', 'savedSections', 'design'];
function tree(value, base = false, depth = 0, key = '') {
    if (depth > 24) fail();
    if (typeof value === 'string') {
        if (value.length > 30000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
            || /<\/?[a-z!]|javascript\s*:|data\s*:|-----BEGIN .*PRIVATE KEY|\bBearer\s+[a-z0-9._-]+|\b(?:sk_live_|sk_test_|AKIA)[a-z0-9]+|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/iu.test(value)) fail('THEME_UNSAFE_STUDIO_CONTENT');
        if (IMAGE_FIELDS.has(key) && value) {
            if (value.startsWith('package:') && PACKAGE.test(value.slice(8))) return;
            if (!base && value.startsWith('asset:') && UUID.test(value.slice(6))) return;
            fail('THEME_INVALID_STUDIO_ASSET_REFERENCE');
        }
        if (['startsAt', 'endsAt'].includes(key) && value) {
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value) || !Number.isFinite(Date.parse(value))) fail();
        }
        return;
    }
    if (value === null || !['object', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) fail();
    if (typeof value !== 'object') return;
    if (Array.isArray(value)) { if (value.length > 240) fail(); value.forEach(item => tree(item, base, depth + 1, key)); return; }
    if (!plain(value)) fail();
    for (const [name, item] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype', 'html', 'css', 'js', 'script', 'token', 'password', 'secret', 'apiKey', 'authorization'].includes(name) || /^on[A-Z]/.test(name)) fail('THEME_UNSAFE_STUDIO_CONTENT');
        tree(item, base, depth + 1, name);
    }
}
function bounded(value, base) {
    tree(value, base);
    if (new TextEncoder().encode(JSON.stringify(value)).length > 512 * 1024) fail('THEME_STUDIO_DOCUMENT_TOO_LARGE');
}
function blockList(studio) {
    return [...studio.blocks, ...studio.pages.flatMap(page => page.blocks), ...Object.values(studio.templates).flatMap(template => template.blocks), ...studio.savedSections.flatMap(section => section.blocks)];
}
function validateStudio(studio, base) {
    bounded(studio, base);
    if (!plain(studio) || Object.keys(studio).length !== TOP.length || TOP.some(key => !Object.hasOwn(studio, key))) fail('THEME_INCOMPLETE_STUDIO_DOCUMENT');
    let normalized;
    try { normalized = normalizeWithDefaults(studio, 'web', studio, true); } catch { fail(); }
    if (!equal(normalized, studio)) fail('THEME_NONCANONICAL_STUDIO_DOCUMENT');
    const blocks = blockList(studio);
    if (blocks.length > 240 || new Set(blocks.map(block => block.id)).size !== blocks.length) fail('THEME_DUPLICATE_STUDIO_ID');
    for (const list of [studio.pages, studio.menus, studio.savedSections]) if (new Set(list.map(item => item.id)).size !== list.length) fail('THEME_DUPLICATE_STUDIO_ID');
    if (new Set(studio.pages.map(page => page.slug)).size !== studio.pages.length) fail('THEME_DUPLICATE_STUDIO_ID');
    if (studio.theme.demoId !== '') fail('THEME_DEMO_DOCUMENT_FORBIDDEN');
    // This lane carries presentation. It cannot define terms, prices, inventory or authority.
    commerceReferences({ schemaVersion: 2, studio });
    return studio;
}
function collect(value, predicate, out = []) {
    if (typeof value === 'string' && predicate(value)) out.push(value);
    if (Array.isArray(value)) value.forEach(item => collect(item, predicate, out));
    else if (plain(value)) Object.values(value).forEach(item => collect(item, predicate, out));
    return out;
}
const assetRefs = input => [...new Set(collect(input, value => value.startsWith('asset:') && UUID.test(value.slice(6))).map(value => value.slice(6).toLowerCase()))];
const packagedAssetKeys = input => [...new Set(collect(input, value => value.startsWith('package:') && PACKAGE.test(value.slice(8))).map(value => value.slice(8)))];
function commerceReferences(document) {
    const products = new Set(), categories = new Set(), collections = new Set(), navigation = [];
    const integer = raw => { if (!/^[1-9][0-9]{0,9}$/.test(String(raw)) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 2147483646) fail('THEME_NONCANONICAL_COMMERCE_REFERENCE'); return Number(raw); };
    function visit(value, key = '') {
        if (typeof value === 'string') {
            if (key === 'categoryId' && value) categories.add(integer(value));
            if (['target', 'secondaryTarget'].includes(key)) {
                navigation.push({ target: value });
                const match = /^(product|category|collection|android-product|android-category):(.+)$/.exec(value);
                if (match) (match[1].includes('product') ? products : match[1].includes('category') ? categories : collections).add(integer(match[2]));
            }
        } else if (Array.isArray(value)) {
            if (key === 'productIds') value.forEach(id => products.add(integer(id)));
            else value.forEach(item => visit(item, key));
        } else if (plain(value)) for (const [name, item] of Object.entries(value)) visit(item, name);
    }
    visit(document);
    return { productIds: [...products], categoryIds: [...categories], collectionIds: [...collections], variants: [], navigation, assetIds: assetRefs(document) };
}

return {validateStudio,bounded,blockList,collect,assetRefs,packagedAssetKeys,commerceReferences};
}
export const nativeDocumentValidator=createNativeDocumentValidator();
