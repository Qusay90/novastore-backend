'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { createThemeAssetStorage, decodeBase64 } = require('../services/themePlatformAssetStorage');
const { validateThemePackage, prepareThemePackage } = require('../services/themePlatformPackageService');
const v = require('../services/themePlatformValidation');
const { resolvePresentation } = require('../services/themePlatformPresentationService');

const codes = Object.keys(require('../services/themePlatformExperiencePolicy').CATALOG);
const owner = crypto.randomUUID(), stranger = crypto.randomUUID();
const makeImage = (format = 'png') => sharp({ create: { width: 12, height: 8, channels: 4, background: '#e66a20' } }).toFormat(format).toBuffer();
const withStorage = async (work, options = {}) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'novastore-package-test-'));
    try { return await work(createThemeAssetStorage({ rootDir: root, ...options }), root); }
    finally {
        assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
        assert(path.basename(root).startsWith('novastore-package-test-'));
        await fs.rm(root, { recursive: true, force: true });
    }
};
const packageFor = async () => {
    const bytes = await makeImage();
    const document = { schemaVersion: 1, tokens: { accent: '#e66a20' }, assetIds: [], components: [
        { id: 'header', type: 'header', props: { title: 'Nova Store' } },
        { id: 'hero', type: 'hero', props: { title: 'Yeni koleksiyon', imageKey: 'theme-assets/nova-test/hero.png', target: '/shop' } },
        { id: 'products', type: 'product_grid', props: { title: 'Ürünler', productIds: [], columns: 3 } }
    ] };
    return { format: 'novastore-theme-package', packageVersion: 1, theme: { slug: 'nova-test', name: 'Nova Store', version: '1.0.0', industry: 'Genel' },
        renderer: { id: 'novastore-studio-core', version: '1.0.0' }, schemaVersion: 1, supportedChannels: ['web', 'app'],
        requiredCapabilities: ['theme.banner', 'theme.product_grid'], components: document.components.map(({ id, type }) => ({ id, type })), document,
        assets: [{ key: 'theme-assets/nova-test/hero.png', mimeType: 'image/png', sha256: v.digest(bytes), width: 12, height: 8, bytesBase64: bytes.toString('base64') }],
        thumbnails: ['web', 'app'].map((channel) => ({ channel, assetKey: 'theme-assets/nova-test/hero.png', documentDigest: v.digest(document) })) };
};

test('storage has no implicit public or temporary default', () => {
    assert.throws(() => createThemeAssetStorage(), (error) => error.code === 'THEME_ASSET_STORAGE_UNAVAILABLE');
    assert.throws(() => createThemeAssetStorage({ rootDir: 'relative' }), (error) => error.code === 'THEME_ASSET_STORAGE_UNAVAILABLE');
    assert.throws(() => createThemeAssetStorage({ rootDir: path.parse(process.cwd()).root }), (error) => error.code === 'THEME_ASSET_STORAGE_ROOT_UNSAFE');
});

test('supported five MiB base64 input cannot exhaust the regexp stack', () => {
    const bytes = Buffer.alloc(5242880, 127), encoded = bytes.toString('base64');
    assert.deepEqual(decodeBase64(encoded), bytes);
    for (const invalid of ['AB==', 'A===', 'AAAA\n', 'A', 'AAA!', '=AAA'])
        assert.throws(() => decodeBase64(invalid), (error) => error.code === 'THEME_INVALID_ASSET_BYTES');
    assert.throws(() => decodeBase64(Buffer.alloc(5242881).toString('base64')), (error) => error.code === 'THEME_ASSET_SIZE_LIMIT');
});

for (const format of ['png', 'jpeg', 'webp']) test(`real ${format} pixels transition QUARANTINED to READY and hash-verified bytes`, async () => withStorage(async (storage) => {
    const bytes = await makeImage(format);
    const stage = await storage.stageOwned({ serviceId: owner, assetId: crypto.randomUUID(), bytes });
    assert.equal(stage.status, 'QUARANTINED');
    const ready = await storage.promote(stage);
    assert.equal(ready.status, 'READY'); assert.equal(ready.width, 12); assert.equal(ready.height, 8);
    assert.equal(ready.originalDigest, v.digest(bytes));
    const read = await storage.readOwned({ serviceId: owner, ...ready });
    assert.equal(v.digest(read), ready.digest); assert.equal(read.length, ready.byteSize);
    assert.equal((await sharp(read).metadata()).format, format);
    await storage.discard(stage);
    await assert.rejects(storage.readOwned({ serviceId: owner, ...ready }), (error) => error.statusCode === 404);
}));

test('foreign owner, package scope and path traversal cannot read ready bytes', async () => withStorage(async (storage) => {
    const stage = await storage.stageOwned({ serviceId: owner, assetId: crypto.randomUUID(), bytes: await makeImage() });
    const ready = await storage.promote(stage);
    await assert.rejects(storage.readOwned({ serviceId: stranger, ...ready }), (error) => error.statusCode === 404);
    await assert.rejects(storage.readPackage({ themeVersionId: owner, ...ready }), (error) => error.statusCode === 404);
    await assert.rejects(storage.readOwned({ serviceId: owner, storageKey: '../../secret', digest: ready.digest }), (error) => error.statusCode === 404);
}));

test('forged quarantine handle cannot promote or discard another file', async () => withStorage(async (storage) => {
    const stage = await storage.stageOwned({ serviceId: owner, assetId: crypto.randomUUID(), bytes: await makeImage() });
    await assert.rejects(storage.promote({ ...stage }), (error) => error.code === 'THEME_ASSET_STORAGE_HANDLE_INVALID');
    await assert.rejects(storage.discard({ ...stage }), (error) => error.code === 'THEME_ASSET_STORAGE_HANDLE_INVALID');
    await storage.discard(stage);
}));

test('magic header without decodable pixels is rejected and quarantine removed', async () => withStorage(async (storage, root) => {
    const bytes = (await makeImage()).subarray(0, 26);
    const id = crypto.randomUUID();
    const stage = await storage.stageOwned({ serviceId: owner, assetId: id, bytes });
    await assert.rejects(storage.promote(stage), (error) => error.code === 'THEME_ASSET_DECODE_REJECTED');
    await assert.rejects(fs.stat(path.join(root, 'quarantine', 'owned', owner, `${id}.upload`)), { code: 'ENOENT' });
}));

test('SVG and HTML never reach the raster decoder or storage', async () => withStorage(async (storage) => {
    for (const body of ['<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>', '<html><script>x()</script></html>']) {
        await assert.rejects(storage.stageOwned({ serviceId: owner, assetId: crypto.randomUUID(), bytes: Buffer.from(body) }),
            (error) => error.code === 'THEME_ASSET_MIME_REJECTED');
    }
}));

test('byte and decompressed dimension limits are enforced', async () => {
    const bytes = await makeImage();
    await withStorage(async (storage) => assert.rejects(storage.stageOwned({ serviceId: owner, assetId: crypto.randomUUID(), bytes }),
        (error) => error.statusCode === 413), { maxBytes: 16 });
    await withStorage(async (storage) => {
        const stage = await storage.stageOwned({ serviceId: owner, assetId: crypto.randomUUID(), bytes });
        await assert.rejects(storage.promote(stage), (error) => ['THEME_ASSET_DECODE_REJECTED', 'THEME_ASSET_DIMENSIONS_REJECTED'].includes(error.code));
    }, { maxPixels: 20 });
});

test('decoder strips image metadata and trailing executable payload', async () => withStorage(async (storage) => {
    const jpeg = await sharp(await makeImage()).withMetadata().jpeg().toBuffer();
    assert((await sharp(jpeg).metadata()).exif);
    const input = Buffer.concat([jpeg, Buffer.from('<script>untrusted()</script>')]);
    const stage = await storage.stageOwned({ serviceId: owner, assetId: crypto.randomUUID(), bytes: input });
    const ready = await storage.promote(stage);
    const read = await storage.readOwned({ serviceId: owner, ...ready });
    assert(!read.includes(Buffer.from('untrusted')));
    const metadata = await sharp(read).metadata();
    assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined); assert.equal(metadata.xmp, undefined);
}));

test('tampered storage bytes cannot pass read hash verification', async () => withStorage(async (storage, root) => {
    const stage = await storage.stageOwned({ serviceId: owner, assetId: crypto.randomUUID(), bytes: await makeImage() });
    const ready = await storage.promote(stage);
    await fs.appendFile(path.join(root, ...ready.storageKey.split('/')), 'tamper');
    await assert.rejects(storage.readOwned({ serviceId: owner, ...ready }), (error) => error.code === 'THEME_ASSET_INTEGRITY_FAILURE');
}));

test('a symlink or junction in the storage root is rejected', async () => withStorage(async (_storage, root) => {
    const target = path.join(root, 'target'), link = path.join(root, 'link');
    await fs.mkdir(target);
    await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    const storage = createThemeAssetStorage({ rootDir: path.join(link, 'nested') });
    await assert.rejects(storage.stageOwned({ serviceId: owner, assetId: crypto.randomUUID(), bytes: await makeImage() }),
        (error) => error.code === 'THEME_ASSET_PATH_REJECTED');
}));

test('valid package imports true bytes and preserves canonical typed document', async () => withStorage(async (storage) => {
    const input = await packageFor(), versionId = crypto.randomUUID();
    const prepared = await prepareThemePackage(input, { themeVersionId: versionId, storage, capabilityCodes: codes });
    assert.deepEqual(prepared.document, input.document); assert.equal(prepared.documentDigest, v.digest(input.document));
    assert.equal(prepared.packageDigest, v.digest(prepared.manifest)); assert.equal(prepared.assets.length, 1);
    assert(!JSON.stringify(prepared.manifest).includes('bytesBase64')); assert(prepared.manifest.thumbnails.every((thumbnail) => !thumbnail.stale));
    const bytes = await storage.readPackage({ themeVersionId: versionId, ...prepared.assets[0] });
    assert.equal(v.digest(bytes), prepared.assets[0].digest);
    await prepared.cleanup();
    await assert.rejects(storage.readPackage({ themeVersionId: versionId, ...prepared.assets[0] }), (error) => error.statusCode === 404);
}));

for (const [name, change, code] of [
    ['unknown renderer', (p) => { p.renderer.id = 'external-js'; }, 'THEME_PACKAGE_RENDERER_UNSUPPORTED'],
    ['renderer downgrade', (p) => { p.renderer.version = '0.1.0'; }, 'THEME_PACKAGE_RENDERER_UNSUPPORTED'],
    ['unknown schema', (p) => { p.schemaVersion = 99; }, 'THEME_PACKAGE_FORMAT_UNSUPPORTED'],
    ['unknown capability', (p) => { p.requiredCapabilities.push('theme.unknown'); }, 'THEME_PACKAGE_CAPABILITY_UNSUPPORTED'],
    ['unsupported direct publish', (p) => { p.requiredCapabilities.push('theme.direct_publish'); }, 'THEME_PACKAGE_CAPABILITY_UNSUPPORTED'],
    ['unsupported scheduling', (p) => { p.requiredCapabilities.push('theme.scheduling'); }, 'THEME_PACKAGE_CAPABILITY_UNSUPPORTED'],
    ['unsupported custom code', (p) => { p.requiredCapabilities.push('theme.custom_js'); }, 'THEME_PACKAGE_CAPABILITY_UNSUPPORTED'],
    ['script component', (p) => { p.document.components[0].type = 'script'; }, 'THEME_INVALID_CHOICE'],
    ['mismatched component definitions', (p) => { p.components[0].type = 'hero'; }, 'THEME_PACKAGE_COMPONENT_MISMATCH'],
    ['missing asset reference', (p) => { p.document.components[1].props.imageKey = 'theme-assets/nova-test/missing.png'; }, 'THEME_PACKAGE_ASSET_REFERENCE_MISSING'],
    ['asset path traversal', (p) => { p.assets[0].key = 'theme-assets/nova-test/../../x.png'; }, 'THEME_PACKAGE_ASSET_KEY_INVALID'],
    ['asset hash mismatch', (p) => { p.assets[0].sha256 = '0'.repeat(64); }, 'THEME_PACKAGE_ASSET_HASH_MISMATCH'],
    ['asset MIME mismatch', (p) => { p.assets[0].mimeType = 'image/jpeg'; }, 'THEME_PACKAGE_ASSET_MIME_MISMATCH'],
    ['missing app thumbnail', (p) => { p.thumbnails.pop(); }, 'THEME_PACKAGE_THUMBNAIL_REQUIRED'],
    ['duplicate channel', (p) => { p.supportedChannels = ['web', 'web']; }, 'THEME_PACKAGE_CHANNEL_INVALID'],
    ['global base with seller product IDs', (p) => { p.document.components[2].props.productIds = [5]; }, 'THEME_PACKAGE_COMMERCE_BINDING_FORBIDDEN'],
    ['arbitrary code property', (p) => { p.script = 'alert(1)'; }, 'THEME_INVALID_FIELDS']
]) test(`package rejects ${name}`, async () => {
    const input = await packageFor(); change(input);
    assert.throws(() => validateThemePackage(input, { capabilityCodes: codes }), (error) => error.code === code);
});

test('old thumbnail digest is explicitly marked stale', async () => {
    const input = await packageFor(); input.thumbnails[0].documentDigest = '0'.repeat(64);
    const prepared = validateThemePackage(input, { capabilityCodes: codes });
    assert.equal(prepared.manifest.thumbnails[0].stale, true);
    assert.equal(prepared.manifest.thumbnails[1].stale, false);
});

test('dimension lie fails actual decoder check and removes prepared files', async () => withStorage(async (storage, root) => {
    const input = await packageFor(); input.assets[0].width = 13;
    await assert.rejects(prepareThemePackage(input, { themeVersionId: crypto.randomUUID(), storage, capabilityCodes: codes }),
        (error) => error.code === 'THEME_PACKAGE_ASSET_DIMENSIONS_MISMATCH');
    const files = [];
    const walk = async (dir) => { for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const target = path.join(dir, entry.name); if (entry.isDirectory()) await walk(target); else files.push(target);
    } };
    await walk(root); assert.deepEqual(files, []);
}));

for (const slug of ['nova-classic-canonical', 'nova-pocket-canonical']) {
    test(`${slug} imports local artwork and both declared channel previews`, async () => withStorage(async (storage) => {
        const input = JSON.parse(await fs.readFile(path.join(__dirname, '../theme-platform/packages', `${slug}.json`), 'utf8'));
        const themeVersionId = crypto.randomUUID();
        const prepared = await prepareThemePackage(input, { themeVersionId, storage, capabilityCodes: codes });
        assert.equal(prepared.document.components.length, 5);
        assert.deepEqual(prepared.manifest.supportedChannels, ['web', 'app']);
        assert.equal(prepared.assets.length, 3);
        assert(prepared.manifest.thumbnails.every((thumbnail) => thumbnail.stale));
        for (const asset of prepared.assets) {
            const bytes = await storage.readPackage({ themeVersionId, ...asset });
            const metadata = await sharp(bytes).metadata();
            assert.equal(v.digest(bytes), asset.digest);
            assert.equal(metadata.width, asset.width); assert.equal(metadata.height, asset.height);
        }
    }));
}

for (const [slug, channel] of [['nova-classic-studio-web', 'web'], ['nova-pocket-studio-app', 'app']]) {
    test(`${slug} imports a strict native Studio document and packaged art`, async () => withStorage(async (storage) => {
        const input = JSON.parse(await fs.readFile(path.join(__dirname, '../theme-platform/packages', `${slug}.json`), 'utf8'));
        const themeVersionId = crypto.randomUUID();
        const prepared = await prepareThemePackage(input, { themeVersionId, storage, capabilityCodes: codes });
        assert.equal(prepared.document.schemaVersion, 2);
        assert.deepEqual(prepared.manifest.supportedChannels, [channel]);
        assert.deepEqual(prepared.manifest.components, [{ id: 'welcome', type: 'hero' }, { id: 'products', type: 'products' }]);
        assert.equal(prepared.assets.length, 2);
        assert.equal(prepared.manifest.thumbnails[0].stale, true);
        for (const asset of prepared.assets) {
            const bytes = await storage.readPackage({ themeVersionId, ...asset });
            assert.equal(v.digest(bytes), asset.digest);
        }
        const invalid = structuredClone(input); invalid.supportedChannels = ['web', 'app'];
        assert.throws(() => validateThemePackage(invalid, { capabilityCodes: codes }), (error) => error.code === 'THEME_PACKAGE_NATIVE_CHANNEL_REQUIRED');
        const bound = structuredClone(input); bound.document.studio.blocks[1].productSource.productIds = ['42'];
        assert.throws(() => validateThemePackage(bound, { capabilityCodes: codes }), (error) => error.code === 'THEME_PACKAGE_COMMERCE_BINDING_FORBIDDEN');
        const missing = structuredClone(input); missing.document.studio.blocks[0].image = `package:theme-assets/${slug}/missing.png`;
        assert.throws(() => validateThemePackage(missing, { capabilityCodes: codes }), (error) => error.code === 'THEME_PACKAGE_ASSET_REFERENCE_MISSING');
    }));
}

test('reviewed Classic presentation survives preparation with exact source identity and a new version', async () => withStorage(async storage => {
    const input = JSON.parse(await fs.readFile(path.join(__dirname, '../theme-platform/packages/nova-classic-studio-web-v1_1.json'), 'utf8'));
    const old = JSON.parse(await fs.readFile(path.join(__dirname, '../theme-platform/packages/nova-classic-studio-web.json'), 'utf8'));
    const prepared = await prepareThemePackage(input, { themeVersionId: crypto.randomUUID(), storage, capabilityCodes: codes });
    assert.equal(old.theme.version, '1.0.0-wave2'); assert.equal(old.renderer.presentation, undefined);
    assert.equal(prepared.manifest.theme.version, '1.1.0-wave2');
    assert.deepEqual(prepared.manifest.renderer.presentation, input.renderer.presentation);
    assert.equal(prepared.document.studio.theme.accent, '#83b735');
    assert.equal(prepared.document.studio.chrome.header.background, '#ffffff');
    assert.equal(prepared.document.studio.theme.demoId, '', 'Presentation cannot relax demo identity validation');
    assert.equal(prepared.document.studio.blocks[0].title, '', 'Default hero title belongs to the canonical selected product');
    assert.equal(prepared.document.studio.blocks[0].image, '', 'Default hero image cannot substitute an unrelated demo product');
    assert.deepEqual(prepared.manifest.components.map(item => item.id), ['classic-hero','classic-categories','classic-products','classic-story']);
}));

test('presentation allowlist rejects unknown versions, digests, runtime URLs, channels and schema downgrades', async () => {
    const input = JSON.parse(await fs.readFile(path.join(__dirname, '../theme-platform/packages/nova-classic-studio-web-v1_1.json'), 'utf8'));
    const good = input.renderer.presentation;
    for (const invalid of [{ ...good, id: 'unknown' }, { ...good, version: '2.0.0' }, { ...good, digest: '0'.repeat(64) },
        { ...good, script: '/evil.js' }, { ...good, cssUrl: 'https://foreign.invalid/a.css' }, { ...good, html: '<script>x()</script>' }]) {
        const candidate = structuredClone(input); candidate.renderer.presentation = invalid;
        assert.throws(() => validateThemePackage(candidate, { capabilityCodes: codes }), error => ['THEME_PRESENTATION_UNSUPPORTED','THEME_INVALID_FIELDS'].includes(error.code));
    }
    assert.throws(() => resolvePresentation(good, { schemaVersion: 1, channels: ['web'] }), { code: 'THEME_PRESENTATION_UNSUPPORTED' });
    assert.throws(() => resolvePresentation(good, { schemaVersion: 2, channels: ['app'] }), { code: 'THEME_PRESENTATION_UNSUPPORTED' });
    const native = require('../services/themePlatformStudioDocument');
    assert.throws(() => native.validateOverrides({ presentation: good }, input.document));
    assert.throws(() => native.validateOverrides({ studio: { presentation: good } }, input.document));
});

test('trusted presentation manifest and package derivative attest original source bytes', async () => {
    const registry = require('../theme-platform/presentations.json'), entry = registry.presentations[0], { digest, ...identity } = entry;
    assert.equal(v.digest(identity), digest);
    for (const source of entry.sourceFiles) {
        const bytes = await fs.readFile(path.join(__dirname, '../studio-core/workshop-public/theme-library', source.path));
        assert.equal(v.digest(bytes), source.sha256, source.path); assert.equal(bytes.length, source.bytes);
    }
    const derivative = require('../theme-platform/classic-package-provenance.json');
    assert.equal(v.digest(await fs.readFile(path.join(__dirname, '..', derivative.sourcePackage))), derivative.sourcePackageSha256);
    assert.equal(v.digest(await fs.readFile(path.join(__dirname, '..', derivative.target))), derivative.targetSha256);
});
