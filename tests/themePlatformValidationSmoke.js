'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const v = require('../services/themePlatformValidation');
const base = () => ({ schemaVersion: 1, tokens: { accent: '#ff6600' }, components: [
    { id: 'hero', type: 'hero', props: { title: 'Nova Store', imageKey: 'theme-assets/classic/chair.webp' } }
], assetIds: [] });
const overrides = () => ({ tokens: {}, components: [], assetIds: [] });
test('canonical digest is order independent and preserves ordered arrays', () => {
    assert.equal(v.digest({ a: 1, b: 2 }), v.digest({ b: 2, a: 1 }));
    assert.notEqual(v.digest([1, 2]), v.digest([2, 1]));
});
test('typed document accepts Turkish plain data and packaged asset reference', () => {
    assert.equal(v.document(base()).components[0].props.title, 'Nova Store');
});
for (const [label, mutate] of [
    ['raw script', x => { x.script = 'alert(1)'; }],
    ['custom css', x => { x.tokens.css = 'body{display:none}'; }],
    ['external image', x => { x.components[0].props.imageKey = 'https://tracker.invalid/a.png'; }],
    ['path traversal', x => { x.components[0].props.imageKey = 'theme-assets/../secret.png'; }],
    ['commerce price', x => { x.components[0].props.price = 1; }],
    ['stock override', x => { x.components[0].props.stock = 1; }],
    ['javascript link', x => { x.components[0].props.target = 'javascript:alert(1)'; }],
    ['unknown component', x => { x.components[0].type = 'custom_html'; }],
    ['duplicate component', x => { x.components.push(x.components[0]); }],
    ['base seller asset', x => { x.assetIds.push(crypto.randomUUID()); }],
    ['unknown schema', x => { x.schemaVersion = 2; }],
    ['oversized heading', x => { x.components[0].props.title = 'x'.repeat(241); }]
]) test(`rejects ${label}`, () => { const x = base(); mutate(x); assert.throws(() => v.document(x), v.ThemePlatformError); });
test('seller overrides resolve against stable base IDs without cloning base', () => {
    const x = overrides(); x.components.push({ componentId: 'hero', props: { title: 'Yeni başlık' }, order: 0 });
    v.overrides(x, base());
    const result = v.artifact(base(), x);
    assert.equal(result.components[0].props.title, 'Yeni başlık');
    assert.equal(base().components[0].props.title, 'Nova Store');
    assert.equal(result.components[0].props.imageKey, 'theme-assets/classic/chair.webp');
});
test('asset override removes packaged image and rejects foreign/unknown field shapes', () => {
    const x = overrides(); const id = crypto.randomUUID(); x.components.push({ componentId: 'hero', props: { imageAssetId: id } });
    v.overrides(x, base());
    assert.equal(v.artifact(base(), x).components[0].props.imageKey, undefined);
    assert.deepEqual(v.references(x), [id]);
    assert.throws(() => v.overrides({ ...x, organizationId: 2 }, base()));
    assert.throws(() => v.overrides({ ...x, components: [{ componentId: 'unknown', props: {} }] }, base()));
});
test('opaque or fractional revision and CSS color injection are rejected', () => {
    for (const x of ['3', '3-other', 2.5, 0, Number.MAX_SAFE_INTEGER]) assert.throws(() => v.integer(x));
    for (const x of ['red', 'url(x)', '#123456;display:none']) assert.throws(() => v.tokens({ accent: x }));
});
test('UTC date validation rejects impossible calendar days and offsets', () => {
    for (const value of ['2026-02-31T00:00:00Z', '2026-09-31T00:00:00Z', '2026-09-18T12:00:00+03:00']) assert.throws(() => v.date(value));
    assert.equal(v.date('2026-09-18T12:00:00Z'), '2026-09-18T12:00:00.000Z');
});
test('upload detector rejects scripts SVG empty and malformed base64', () => {
    for (const x of ['', '<svg/>', Buffer.from('<svg onload="x"/>').toString('base64'), Buffer.from('hello').toString('base64')]) assert.throws(() => v.upload(x));
});
test('signature sniff reports exact bytes and hash, never claims scan/READY', () => {
    const bytes = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    const result = v.upload(bytes.toString('base64'));
    assert.equal(result.byteSize, 24); assert.equal(result.detectedMime, 'image/png');
    assert.equal(result.digest, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.status, undefined);
});
test('mutation validation rejects client identity and requires exact revision header', () => {
    const { validateCommand } = require('../services/themePlatformService');
    const meta = { idempotencyKey: 'unit-key-001' };
    const body = { expectedRevision: 1, overrides: overrides(), reason: 'Test' };
    assert.throws(() => validateCommand('saveDraft', { ...body, seller_id: 2 }, {}, meta));
    assert.throws(() => validateCommand('saveDraft', body, {}, { ...meta, ifMatch: '"1-extra"' }));
    assert.equal(validateCommand('saveDraft', body, {}, { ...meta, ifMatch: '"1"' }), body);
});
