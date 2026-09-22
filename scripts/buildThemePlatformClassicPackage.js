'use strict';

// Reproduce a new immutable package from reviewed local design sources. This
// never updates an imported DB version and never imports executable package code.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const v = require('../services/themePlatformValidation');
const native = require('../services/themePlatformStudioDocument');
const { validateThemePackage } = require('../services/themePlatformPackageService');
const root = path.resolve(__dirname, '..');
const registry = require('../theme-platform/presentations.json');
const entry = registry.presentations.find(item => item.id === 'nova-classic' && item.version === '1.0.0');
const { digest, ...identity } = entry;
assert.equal(v.digest(identity), digest, 'Reviewed registry digest mismatch');
for (const source of entry.sourceFiles) {
    const bytes = fs.readFileSync(path.join(root, 'studio-core/workshop-public/theme-library', source.path));
    assert.equal(bytes.length, source.bytes, source.path);
    assert.equal(v.digest(bytes), source.sha256, source.path);
}
const inputFile = path.join(root, 'theme-platform/packages/nova-classic-studio-web.json');
const bytes = fs.readFileSync(inputFile);
const input = JSON.parse(bytes);
assert.equal(input.theme.version, '1.0.0-wave2');
const output = structuredClone(input), studio = output.document.studio;
output.theme.version = '1.1.0-wave2';
output.renderer.presentation = { id: entry.id, version: entry.version, digest };
Object.assign(studio.theme, { accent: '#83b735', navy: '#242424', radius: 0, surface: '#ffffff', text: '#242424',
    muted: '#686868', border: '#e4e4e1', fontFamily: 'Arial', contentWidth: 1200, shadow: 'none' });
Object.assign(studio.chrome.header, { logoText: 'Nova Store', background: '#ffffff', textColor: '#242424',
    announcement: 'Nova Store ile yaşam alanına yeni bir dokunuş.', showAnnouncement: true });
Object.assign(studio.chrome.footer, { background: '#ffffff', textColor: '#242424',
    description: 'Doğal dokular, iyi düşünülmüş ayrıntılar ve günlük yaşamına eşlik eden tasarımlar.',
    copyright: '© Nova Store. Mağaza koşulları ve hukuki bilgiler yetkili kaynaktan sağlanır.' });
// The trusted carousel derives title/image/description and price from the SAME
// canonical product. Blank defaults must not pair the old demo chair with a real
// vase's price. Explicit later text/art edits stay typed draft fields.
const hero = { ...studio.blocks[0], id: 'classic-hero', title: '', image: '', mobileImage: '', alt: '',
    kicker: 'NOVA STORE KOLEKSİYONLARI', description: '',
    buttonText: 'Koleksiyonu keşfet', target: 'categories', style: { ...studio.blocks[0].style, background: '#f7f7f7', textColor: '#242424' } };
const categories = { ...structuredClone(studio.blocks[1]), id: 'classic-categories', type: 'categories',
    title: 'Öne çıkan kategoriler', kicker: 'NOVA STORE KOLEKSİYONLARI', description: 'Yaşam alanına uygun seçimleri keşfet.', buttonText: '', target: 'categories' };
const products = { ...structuredClone(studio.blocks[1]), id: 'classic-products', title: 'Öne çıkan ürünler',
    kicker: 'İYİ TASARIM, HER GÜN', description: 'Mağazanın güncel koleksiyonunu keşfet.', productLimit: 8 };
const story = { ...structuredClone(studio.blocks[1]), id: 'classic-story', type: 'editorial', title: 'Güzel bir ev, iyi seçimlerle başlar.',
    kicker: 'NOVA STORE HİKÂYESİ', description: 'Doğal dokular ve iyi düşünülmüş ayrıntılarla kendine ait bir alan oluştur.',
    buttonText: 'Koleksiyonu keşfet', target: 'categories' };
studio.blocks = [hero, categories, products, story];
studio.menus = [{ id: 'classic-home', label: 'Ana sayfa', target: 'home', enabled: true },
    { id: 'classic-shop', label: 'Mağaza', target: 'categories', enabled: true },
    { id: 'classic-help', label: 'Yardım merkezi', target: 'support', enabled: true }];
studio.design.name = 'Nova Store Classic';
native.validateBase(output.document);
output.components = native.components(output.document);
validateThemePackage(output, { capabilityCodes: Object.keys(require('../services/themePlatformExperiencePolicy').CATALOG) });
const target = 'theme-platform/packages/nova-classic-studio-web-v1_1.json';
fs.writeFileSync(path.join(root, target), JSON.stringify(output, null, 2) + '\n');
const provenance = { version: 1, sourcePackage: 'theme-platform/packages/nova-classic-studio-web.json', sourcePackageSha256: v.digest(bytes),
    target, targetSha256: v.digest(fs.readFileSync(path.join(root, target))), presentation: output.renderer.presentation,
    sourceFiles: entry.sourceFiles, mapping: 'Original Classic presentation registry and typed editable hero/category/product/story slots; no demo commerce records or executable HTML/JS/CSS supplied by the package.',
    immutableUpgrade: '1.0.0-wave2 remains unchanged. Import 1.1.0-wave2 as a new theme_version and create a new offer/assignment explicitly.' };
fs.writeFileSync(path.join(root, 'theme-platform/classic-package-provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify({ target, version: output.theme.version, presentation: output.renderer.presentation }));
