'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePresentationDocument } = require('../services/themePlatformPresentationEditGuard');
const { validateThemePackage } = require('../services/themePlatformPackageService');
const input = require('../theme-platform/packages/nova-classic-studio-web-v1_1.json');
const presentation = input.renderer.presentation, base = input.document;
const checked = document => validatePresentationDocument(presentation, base, document);
const unsupported = { code: 'THEME_PRESENTATION_EDIT_UNSUPPORTED', statusCode: 400 };
const changed = mutate => { const document = structuredClone(base); mutate(document.studio); return document; };

test('Classic supported colors, chrome, fixed slot copy and visual metadata remain editable', () => {
    const document = changed(studio => {
        studio.theme.accent = '#547521'; studio.theme.fontFamily = 'Georgia'; studio.theme.radius = 8;
        studio.chrome.header.logoText = 'Gerçek mağaza'; studio.chrome.header.showSearch = false;
        studio.chrome.footer.background = '#eeeeee'; studio.design.header = false;
        studio.design.name = 'Düzenlenmiş Classic'; studio.design.elements = [{ id: 'header', desktop: { paddingY: 12 }, tablet: {}, mobile: {} }];
        studio.blocks[0].title = 'Yeni sezon'; studio.blocks[0].description = 'Mağaza kampanyası';
        studio.blocks[0].buttonText = 'Mağazaya git'; studio.blocks[0].target = 'categories';
        studio.blocks[2].enabled = false; studio.blocks[3].title = 'Bizim hikâyemiz';
    });
    assert.equal(checked(document), document);
});

const unsupportedChanges = {
    append: studio => studio.blocks.push({ ...structuredClone(studio.blocks[3]), id: 'new-campaign' }),
    remove: studio => studio.blocks.pop(),
    reorder: studio => studio.blocks.reverse(),
    blockType: studio => { studio.blocks[3].type = 'hero'; },
    productSource: studio => { studio.blocks[2].productSource = { mode: 'selected', categoryId: '', productIds: ['17'] }; },
    productLimit: studio => { studio.blocks[2].productLimit = 4; },
    blockLayout: studio => { studio.blocks[0].style.align = 'center'; },
    blockTiming: studio => { studio.blocks[0].startsAt = '2030-01-01T00:00'; },
    blockVisibility: studio => { studio.blocks[0].visibility.mobile = false; },
    unusedKicker: studio => { studio.blocks[0].kicker = 'Etkisiz metin'; },
    categoryImage: studio => { studio.blocks[1].image = 'package:theme-assets/nova-classic-studio-web/hero.png'; },
    mobileImage: studio => { studio.blocks[0].mobileImage = 'package:theme-assets/nova-classic-studio-web/hero.png'; },
    storyTarget: studio => { studio.blocks[3].target = 'cart'; },
    menus: studio => { studio.menus[0].label = 'Başka menü'; },
    pages: studio => { studio.pages = [{ id: 'new-page', title: 'Yeni sayfa', slug: 'yeni', enabled: true, body: '', seoTitle: '', seoDescription: '', blocks: [] }]; },
    templates: studio => { studio.templates.product.title = 'Değişik ürün'; },
    app: studio => { studio.app.density = 'compact'; },
    commerce: studio => { studio.commerce.gridColumns = 3; },
    unusedThemeToken: studio => { studio.theme.spacing = 1.2; },
    headerAnnouncement: studio => { studio.chrome.header.announcement = 'Etkisiz duyuru'; },
    footerCopy: studio => { studio.chrome.footer.description = 'Etkisiz alt bilgi'; },
    designBlank: studio => { studio.design.blank = true; },
};
for (const [name, mutate] of Object.entries(unsupportedChanges)) test(`Classic rejects unsupported ${name} instead of silently saving`, () => {
    assert.throws(() => checked(changed(mutate)), unsupported);
});

test('hero CTA only changes in authored campaign mode and only supports implemented canonical routes', () => {
    assert.throws(() => checked(changed(studio => { studio.blocks[0].target = 'cart'; })), unsupported);
    assert.throws(() => checked(changed(studio => { studio.blocks[0].buttonText = 'Yeni düğme'; })), unsupported);
    for (const target of ['collection:17', 'page:about', 'android-product:17', 'android-category:17'])
        assert.throws(() => checked(changed(studio => { studio.blocks[0].title = 'Kampanya'; studio.blocks[0].target = target; })), unsupported);
    for (const target of ['home', 'categories', 'search', 'cart', 'account', 'support', 'favorites', 'product:17', 'category:17'])
        assert.doesNotThrow(() => checked(changed(studio => { studio.blocks[0].title = 'Kampanya'; studio.blocks[0].target = target; })));
});

test('presentation guard cannot bypass native image and visual metadata validation', () => {
    assert.throws(() => checked(changed(studio => { studio.blocks[0].image = 'https://outside.invalid/x.png'; })), { code: 'THEME_INVALID_STUDIO_ASSET_REFERENCE' });
    assert.throws(() => checked(changed(studio => { studio.design.elements = [{ id: 'header', desktop: { script: 'run' }, tablet: {}, mobile: {} }]; })), { code: 'THEME_UNSAFE_STUDIO_CONTENT' });
});

test('new packages cannot claim reviewed Classic identity over an unsupported base layout', () => {
    const candidate = structuredClone(input);
    candidate.document.studio.blocks.push({ ...structuredClone(candidate.document.studio.blocks[3]), id: 'unauthorized-slot' });
    candidate.components.push({ id: 'unauthorized-slot', type: 'editorial' });
    assert.throws(() => validateThemePackage(candidate, { capabilityCodes: input.requiredCapabilities }), unsupported);
});

test('historic packages without a presentation descriptor retain their native editing contract', () => {
    const document = changed(unsupportedChanges.append);
    assert.equal(validatePresentationDocument(null, base, document), document);
});

test('Classic rejects free visual text and image content for canonical or forged discovered targets', () => {
    for (const id of ['productTitle','productPrice','productImage','productInfo','communityScore','communityQuestions','item:v1-forged:text','item:v1-forged:button','category:17:text'])
        assert.throws(() => checked(changed(studio => { studio.design.elements = [{ id,content:{text:'Sahte fiyat veya değerlendirme'},desktop:{},tablet:{},mobile:{} }]; })), unsupported);
    for (const id of ['item:v1-forged:image','category:17:image','block:classic-hero:image'])
        assert.throws(() => checked(changed(studio => { studio.design.elements = [{ id,content:{imageUrl:'package:theme-assets/nova-classic-studio-web/hero.png'},desktop:{},tablet:{},mobile:{} }]; })), unsupported);
});

test('Classic rejects alternate visual replacements over images while retaining trusted icon and logo editing', () => {
    const asset = globalThis.NovaStoreVisualAssets.icon('heart');
    for (const id of ['item:v1-forged:image','category:17:image','block:classic-hero:image'])
        assert.throws(() => checked(changed(studio => { studio.design.elements = [{ id,visual:{asset,size:24},desktop:{},tablet:{},mobile:{} }]; })), unsupported);
    for (const id of ['logo','logoImage','item:v1-forged:icon'])
        assert.doesNotThrow(() => checked(changed(studio => { studio.design.elements = [{ id,visual:{asset,size:24},desktop:{},tablet:{},mobile:{} }]; })));
    assert.doesNotThrow(() => checked(changed(studio => { studio.design.elements = [{ id:'logoImage',content:{imageUrl:'package:theme-assets/nova-classic-studio-web/hero.png',alt:'Mağaza logosu'},desktop:{},tablet:{},mobile:{} }]; })));
});

test('Classic imported bases cannot bake in otherwise well-formed canonical text replacements', () => {
    const candidate = structuredClone(input);
    candidate.document.studio.design.elements = [{ id:'item:v1-forged:text',content:{text:'Sahte ürün'},desktop:{},tablet:{},mobile:{} }];
    assert.throws(() => validateThemePackage(candidate, { capabilityCodes: input.requiredCapabilities }), unsupported);
});
