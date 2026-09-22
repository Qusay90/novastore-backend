'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const v = require('../services/themePlatformValidation');
const native = require('../services/themePlatformStudioDocument');
const root = path.resolve(__dirname, '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

async function build() {
    const classic = read('theme-platform/packages/nova-classic-studio-web-v1_1.json');
    const policy = read('theme-platform/presentation-edit-policy.json');
    const entry = read('theme-platform/presentations.json').presentations.find(item => item.id === 'nova-atelier');
    assert(entry && entry.sourceThemeId === '02-atelier');
    const original = fs.readFileSync(path.join(root, 'studio-core/workshop-public/theme-library/themes/02-atelier/theme.js'), 'utf8');
    const theme = JSON.parse(original.slice(original.indexOf('{'), original.lastIndexOf('}') + 1));
    assert.equal(theme.style, 'editorial');
    const output = structuredClone(classic), studio = output.document.studio;
    output.theme = { slug: 'nova-atelier-studio-web', name: 'Nova Store Atelier', version: '1.0.0-wave2', industry: theme.sector };
    output.renderer.presentation = { id: entry.id, version: entry.version, digest: entry.digest };
    Object.assign(studio.theme, { accent: theme.color, navy: theme.ink, radius: 0, background: theme.bg,
        surface: theme.surface, text: theme.ink, muted: theme.muted, border: '#e6e1dc', fontFamily: 'Georgia' });
    Object.assign(studio.chrome.header, { logoText: 'Nova Store', background: theme.bg, textColor: theme.ink, announcement: '', showAnnouncement: false });
    Object.assign(studio.chrome.footer, { background: theme.bg, textColor: theme.ink, description: theme.tag });
    studio.design.name = 'Nova Store Atelier';
    studio.blocks.forEach(block => { block.id = block.id.replace(/^classic-/, 'atelier-'); });
    studio.menus.forEach(menu => { menu.id = menu.id.replace(/^classic-/, 'atelier-'); });
    Object.assign(studio.blocks[0], { title: theme.hero, description: theme.sub, kicker: 'NOVA STORE ATELIER',
        buttonText: theme.cta, image: 'package:theme-assets/nova-atelier-studio-web/hero.png',
        alt: 'Nova Store Atelier koleksiyon kampanyası', target: 'categories' });
    Object.assign(studio.blocks[1], { title: 'Koleksiyonlar', description: '' });
    Object.assign(studio.blocks[2], { title: 'Yeni sezon, yeni hikâyeler', description: '' });
    Object.assign(studio.blocks[3], { title: theme.tag, description: theme.desc });
    output.components = native.components(output.document);
    const gallery = read('studio-core/workshop-gallery-provenance.json');
    const inputs = [
        ['assets/photography/fashion-hero-editorial.png', 'hero.png', 'image/png'],
        ['previews/02-atelier-tile.jpg', 'web.jpg', 'image/jpeg']
    ];
    output.assets = [];
    for (const [relative, name, mimeType] of inputs) {
        const bytes = fs.readFileSync(path.join(root, 'studio-core/workshop-public/theme-library', relative));
        assert.equal(v.digest(bytes), gallery.entries.find(item => item.path === relative)?.sha256, relative);
        const metadata = await sharp(bytes).metadata();
        output.assets.push({ key: `theme-assets/nova-atelier-studio-web/${name}`, mimeType, sha256: v.digest(bytes),
            width: metadata.width, height: metadata.height, bytesBase64: bytes.toString('base64') });
    }
    output.thumbnails = [{ channel: 'web', assetKey: 'theme-assets/nova-atelier-studio-web/web.jpg', documentDigest: '0'.repeat(64) }];
    // Historical demo thumbnail is intentionally stale until canonical backend
    // browser proof is captured; importing it never grants assignment readiness.
    policy.presentationId = entry.id;
    policy.presentationVersion = entry.version;
    policy.blocks.forEach(block => { block.id = block.id.replace(/^classic-/, 'atelier-'); });
    policy.blocks.find(block => block.id === 'atelier-categories').mutableFields = ['enabled'];
    policy.blocks.find(block => block.id === 'atelier-story').mutableFields = ['title', 'description', 'enabled'];
    native.validateBase(output.document);
    fs.writeFileSync(path.join(root, 'theme-platform/atelier-edit-policy.json'), JSON.stringify(policy, null, 2) + '\n');
    const target = 'theme-platform/packages/nova-atelier-studio-web-v1.json';
    fs.writeFileSync(path.join(root, target), JSON.stringify(output, null, 2) + '\n');
    require('../services/themePlatformPackageService').validateThemePackage(output,
        { capabilityCodes: Object.keys(require('../services/themePlatformExperiencePolicy').CATALOG) });
    fs.writeFileSync(path.join(root, 'theme-platform/atelier-package-provenance.json'), JSON.stringify({
        sourceThemeId: theme.id, sourceStyle: theme.style, sourceFiles: entry.sourceFiles,
        target, targetSHA256: v.digest(fs.readFileSync(path.join(root, target))),
        assets: output.assets.map(({ bytesBase64, ...asset }) => asset),
        thumbnailStatus: 'STALE_DEMO_REFERENCE', runtimeReady: false,
        note: 'Original Atelier header, editorial hero, fashion cards, footer and PDP templates. No demo product or category records enter the package.'
    }, null, 2) + '\n');
    console.log(JSON.stringify({ target, presentation: output.renderer.presentation }));
}
if (require.main === module) build().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { build };
