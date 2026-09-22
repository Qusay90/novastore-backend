import {normalizeCampaignCanvas} from './campaignCanvas.js';
import {normalizeCampaign, MAX_CAMPAIGN_PACKAGES} from './campaignModel.js';
import { STORE_FAMILIES, DEMO_IDS } from './storeDemos.js';
import { normalizeVisualDesign } from './visualDesign.js';
export const BLOCK_TYPES = ['hero', 'categories', 'products', 'editorial', 'announcement', 'banner', 'text', 'features', 'faq', 'stats', 'testimonials', 'divider', 'spacer'];
export const TEMPLATE_KEYS = ['category', 'product', 'search', 'cart', 'account', 'support'];
export const NAV_KEYS = ['home', 'categories', 'favorites', 'cart', 'support', 'account'];
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const safeId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const newId = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export function slugify(value) { return String(value).replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[çÇ]/g, 'c').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/g, '') || 'yeni-sayfa'; }
function fail(path, detail) { throw new Error(`${path}: ${detail}`); }
export function assertSafeTree(value, path = 'Belge', depth = 0) {
  if (depth > 24) fail(path, 'içerik çok derin.');
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) { if (forbiddenKeys.has(key)) fail(path, 'güvenli olmayan alan adı.'); assertSafeTree(value[key], `${path}.${key}`, depth + 1); }
  }
}
function object(value, fallback, path) {
  if (value === undefined) return fallback;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'nesne olmalı.');
  return value;
}
function keys(value, allowed, path, strict) { if (strict) for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(path, `tanınmayan alan “${key}”.`); }
function text(value, fallback, path, maximum = 500) { if (value === undefined) return fallback; if (typeof value !== 'string' || value.length > maximum) fail(path, `en fazla ${maximum} karakterlik metin olmalı.`); return value; }
function flag(value, fallback, path) { if (value === undefined) return fallback; if (typeof value !== 'boolean') fail(path, 'açık/kapalı değeri olmalı.'); return value; }
function number(value, fallback, minimum, maximum, path, integer = false) { if (value === undefined) return fallback; if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) fail(path, `${minimum}–${maximum} aralığında ${integer ? 'tam ' : ''}sayı olmalı.`); return value; }
function choice(value, fallback, allowed, path) { if (value === undefined) return fallback; if (!allowed.includes(value)) fail(path, 'desteklenmeyen seçenek.'); return value; }
function list(value, fallback, maximum, path) { if (value === undefined) return fallback; if (!Array.isArray(value) || value.length > maximum) fail(path, `en fazla ${maximum} öğelik liste olmalı.`); return value; }
function identity(value, fallback, path) { const result = text(value, fallback, path, 100); if (!safeId.test(result)) fail(path, 'geçersiz kimlik.'); return result; }
function color(value, fallback, path, empty = false) { const result = text(value, fallback, path, 9); if (empty && result === '') return result; if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(result)) fail(path, 'HEX renk kodu olmalı.'); return result.toLowerCase(); }
function image(value, path) {
  const result = text(value, '', path, 1900000);
  if (/^(?:package:theme-assets\/[a-z0-9_-]+\/[a-z0-9_-]+\.(?:png|webp|jpg)|asset:[0-9a-f-]{36})$/i.test(result)) return result;
  if (!result || /^\/media\/(?!.*\.\.)[a-z0-9_/-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(result)) return result;
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(result)) return result;
  fail(path, 'yalnız yerel medya veya PNG/JPEG/WebP yüklemesi kullanılabilir.');
}
function target(value, fallback, path) {
  const result = text(value, fallback, path, 180);
  if (!/^(?:home|categories|search|cart|account|support|favorites|(?:category|collection|product|android-product|android-category|page):[a-zA-Z0-9][a-zA-Z0-9_-]{0,99})$/.test(result)) fail(path, 'yerel bir sayfa, kategori veya ürün hedefi seç.');
  return result;
}
function link(value, path, strict) {
  const input = object(value, {}, path); keys(input, ['id', 'label', 'target', 'enabled'], path, strict);
  return { id: identity(input.id, newId(), `${path}.id`), label: text(input.label, '', `${path}.label`, 100), target: target(input.target, 'home', `${path}.target`), enabled: flag(input.enabled, true, `${path}.enabled`) };
}
function block(value, path, strict, defaultPadding = 48) {
  const input = object(value, {}, path);
  keys(input, ['id', 'type', 'title', 'kicker', 'description', 'image', 'mobileImage', 'alt', 'buttonText', 'target', 'secondaryText', 'secondaryTarget', 'enabled', 'startsAt', 'endsAt', 'showCopy', 'showTitle', 'style', 'visibility', 'items', 'productLimit', 'productSource', 'campaignCanvas'], path, strict);
  const source = object(input.productSource, {}, `${path}.productSource`);
  keys(source, ['mode', 'categoryId', 'productIds'], `${path}.productSource`, strict);
  const style = object(input.style, {}, `${path}.style`), visibility = object(input.visibility, {}, `${path}.visibility`);
  keys(style, ['background', 'textColor', 'padding', 'align', 'imagePosition'], `${path}.style`, strict);
  keys(visibility, ['desktop', 'mobile'], `${path}.visibility`, strict);
  const result = {
    ...(input.campaignCanvas === undefined ? {} : {campaignCanvas:normalizeCampaignCanvas(input.campaignCanvas)}),
    id: identity(input.id, newId(), `${path}.id`), type: choice(input.type, 'text', BLOCK_TYPES, `${path}.type`),
    title: text(input.title, '', `${path}.title`, 200), kicker: text(input.kicker, '', `${path}.kicker`, 100), description: text(input.description, '', `${path}.description`, 10000),
    image: image(input.image, `${path}.image`), mobileImage: image(input.mobileImage, `${path}.mobileImage`), alt: text(input.alt, '', `${path}.alt`, 300),
    buttonText: text(input.buttonText, '', `${path}.buttonText`, 100), target: target(input.target, 'home', `${path}.target`), secondaryText: text(input.secondaryText, '', `${path}.secondaryText`, 100), secondaryTarget: target(input.secondaryTarget, 'categories', `${path}.secondaryTarget`),
    enabled: flag(input.enabled, true, `${path}.enabled`), startsAt: text(input.startsAt, '', `${path}.startsAt`, 40), endsAt: text(input.endsAt, '', `${path}.endsAt`, 40),
    style: { background: color(style.background, '', `${path}.style.background`, true), textColor: color(style.textColor, '', `${path}.style.textColor`, true), padding: number(style.padding, defaultPadding, 0, 160, `${path}.style.padding`), align: choice(style.align, 'left', ['left', 'center', 'right'], `${path}.style.align`), imagePosition: choice(style.imagePosition, 'right', ['left', 'right'], `${path}.style.imagePosition`) },
    visibility: { desktop: flag(visibility.desktop, true, `${path}.visibility.desktop`), mobile: flag(visibility.mobile, true, `${path}.visibility.mobile`) },
    items: list(input.items, [], 30, `${path}.items`).map((item, index) => {
      const itemPath = `${path}.items[${index}]`, source = object(item, {}, itemPath);
      keys(source, ['id', 'title', 'body', 'value', 'icon'], itemPath, strict);
      return { id: identity(source.id, newId(), `${itemPath}.id`), title: text(source.title, '', `${itemPath}.title`, 200), body: text(source.body, '', `${itemPath}.body`, 2500), value: text(source.value, '', `${itemPath}.value`, 100), icon: text(source.icon, '', `${itemPath}.icon`, 50) };
    }),
    productLimit: number(input.productLimit, 8, 1, 24, `${path}.productLimit`, true),
    productSource: { mode: choice(source.mode, !input.productSource && input.type === 'products' && input.target?.startsWith('category:') ? 'category' : 'all', ['all', 'category', 'selected'], `${path}.productSource.mode`), categoryId: text(source.categoryId, !input.productSource && input.type === 'products' && input.target?.startsWith('category:') ? input.target.slice(9) : '', `${path}.productSource.categoryId`, 100), productIds: list(source.productIds, [], 24, `${path}.productSource.productIds`).map((id, index) => identity(id, '', `${path}.productSource.productIds[${index}]`)) },
  };
  if (input.showCopy !== undefined) result.showCopy = flag(input.showCopy, false, `${path}.showCopy`);
  if (input.showTitle !== undefined) result.showTitle = flag(input.showTitle, false, `${path}.showTitle`);
  return result;
}
// The sector gallery uses the same section schema without constructing a whole store.
export function normalizeCampaignSection(value, channel = 'web', strict = true) {
  if (!['web', 'android'].includes(channel)) fail('Kayıtlı paket', 'geçersiz kanal.');
  assertSafeTree(value);
  const path = 'Kayıtlı paket', source = object(value, {}, path);
  keys(source, ['id', 'name', 'blocks', 'campaign'], path, strict);
  const blocks = list(source.blocks, [], 20, `${path}.blocks`).map((item, index) => block(item, `${path}.blocks[${index}]`, strict, channel === 'android' ? 0 : 48));
  if (new Set(blocks.map(item => item.id)).size !== blocks.length) fail(path, 'bölüm kimlikleri tekil olmalı.');
  return { ...(source.campaign === undefined ? {} : {campaign:normalizeCampaign(source.campaign)}), id: identity(source.id, newId(), `${path}.id`), name: text(source.name, '', `${path}.name`, 100), blocks };
}
export function normalizeWithDefaults(document, channel, defaults, strict = false) {
  assertSafeTree(document);
  const input = object(document, {}, 'Belge');
  keys(input, ['blocks', 'theme', 'menus', 'pages', 'app', 'chrome', 'commerce', 'templates', 'savedSections', 'design'], 'Belge', strict);
  const theme = object(input.theme, {}, 'Tema'), chrome = object(input.chrome, {}, 'Site çerçevesi'), app = object(input.app, {}, 'Uygulama'), commerce = object(input.commerce, {}, 'Ürün görünümü');
  keys(theme, ['accent', 'navy', 'radius', 'fontScale', 'motion', 'background', 'surface', 'text', 'muted', 'border', 'fontFamily', 'headingScale', 'spacing', 'contentWidth', 'buttonStyle', 'shadow', 'family', 'demoId'], 'Tema', strict);
  keys(chrome, ['header', 'footer'], 'Site çerçevesi', strict); keys(app, ['density', 'bottomTabs'], 'Uygulama', strict);
  keys(commerce, ['gridColumns', 'imageRatio', 'showRating', 'showBrand', 'showDiscount', 'showQuickAdd'], 'Ürün görünümü', strict);
  const normalizedTheme = {
    family: choice(theme.family, channel === 'android' ? 'pocket' : 'nova-commerce', STORE_FAMILIES, 'Tasarım ailesi'),
    demoId: choice(theme.demoId, '', ['', ...DEMO_IDS, 'stocky-green'], 'Mağaza demosu'),
    accent: color(theme.accent, defaults.theme.accent, 'Vurgu rengi'), navy: color(theme.navy, defaults.theme.navy, 'Ana renk'), radius: number(theme.radius, defaults.theme.radius, 0, 40, 'Köşe yumuşaklığı'), fontScale: number(theme.fontScale, 1, .75, 1.5, 'Yazı ölçeği'), motion: flag(theme.motion, true, 'Animasyon'),
    background: color(theme.background, '#ffffff', 'Zemin'), surface: color(theme.surface, '#f5f7fa', 'Yüzey'), text: color(theme.text, '#11263a', 'Metin'), muted: color(theme.muted, '#607080', 'İkincil metin'), border: color(theme.border, '#dfe5ec', 'Kenarlık'),
    fontFamily: choice(theme.fontFamily, channel === 'android' ? 'system' : 'Inter', ['Inter', 'Arial', 'Georgia', 'system'], 'Yazı ailesi'), headingScale: number(theme.headingScale, 1, .75, 1.5, 'Başlık ölçeği'), spacing: number(theme.spacing, 1, .5, 2, 'Boşluk ölçeği'), contentWidth: number(theme.contentWidth, 1440, 960, 1920, 'İçerik genişliği', true), buttonStyle: choice(theme.buttonStyle, 'solid', ['solid', 'outline', 'soft'], 'Düğme stili'), shadow: choice(theme.shadow, 'soft', ['soft', 'none', 'strong'], 'Gölge'),
  };
  const header = object(chrome.header, {}, 'Üst alan'), footer = object(chrome.footer, {}, 'Alt alan');
  keys(header, ['logoText', 'tagline', 'announcement', 'showAnnouncement', 'showSearch', 'sticky', 'background', 'textColor'], 'Üst alan', strict);
  keys(footer, ['description', 'copyright', 'background', 'textColor', 'columns'], 'Alt alan', strict);
  const footerDefaults = [
    { id: 'discover', title: 'Keşfet', links: [{ id: 'categories', label: 'Tüm kategoriler', target: 'categories', enabled: true }, { id: 'deals', label: 'Günün fırsatları', target: 'collection:firsatlar', enabled: true }] },
    { id: 'novastore', title: 'NovaStore', links: [{ id: 'about', label: 'Hakkımızda', target: 'page:about', enabled: true }, { id: 'help', label: 'Yardım merkezi', target: 'page:help', enabled: true }] },
  ];
  const templates = object(input.templates, {}, 'Sayfa şablonları'); keys(templates, TEMPLATE_KEYS, 'Sayfa şablonları', strict);
  return {
    design: normalizeVisualDesign(input.design, strict),
    savedSections: list(input.savedSections, [], MAX_CAMPAIGN_PACKAGES, 'Kayıtlı bölüm paketleri').map(value => normalizeCampaignSection(value, channel, strict)),
    blocks: list(input.blocks, defaults.blocks, 80, 'Ana sayfa blokları').map((item, index) => block(item, `Ana sayfa[${index}]`, strict, channel === 'android' ? 0 : 48)),
    theme: normalizedTheme,
    menus: list(input.menus, defaults.menus, 40, 'Menüler').map((item, index) => link(item, `Menü[${index}]`, strict)),
    pages: list(input.pages, defaults.pages, 40, 'Sayfalar').map((page, index) => {
      const path = `Sayfa[${index}]`, source = object(page, {}, path); keys(source, ['id', 'slug', 'enabled', 'title', 'body', 'seoTitle', 'seoDescription', 'blocks'], path, strict);
      const id = identity(source.id, newId(), `${path}.id`), title = text(source.title, '', `${path}.title`, 200), slug = text(source.slug, slugify(title || id), `${path}.slug`, 100);
      if (!safeSlug.test(slug)) fail(`${path}.slug`, 'küçük harf, sayı ve kısa çizgi kullan.');
      return { id, slug, enabled: flag(source.enabled, true, `${path}.enabled`), title, body: text(source.body, '', `${path}.body`, 30000), seoTitle: text(source.seoTitle, '', `${path}.seoTitle`, 200), seoDescription: text(source.seoDescription, '', `${path}.seoDescription`, 500), blocks: list(source.blocks, [], 60, `${path}.blocks`).map((item, blockIndex) => block(item, `${path}.blocks[${blockIndex}]`, strict)) };
    }),
    app: { density: choice(app.density, 'comfortable', ['comfortable', 'compact'], 'İçerik yoğunluğu'), bottomTabs: list(app.bottomTabs, defaults.app.bottomTabs, 6, 'Alt gezinme').map((item, index) => choice(item, 'home', NAV_KEYS, `Alt gezinme[${index}]`)) },
    chrome: {
      header: { logoText: text(header.logoText, 'Nova Store', 'Logo metni', 60), tagline: text(header.tagline, 'Doğru seçimin adresi.', 'Slogan', 180), announcement: text(header.announcement, '', 'Duyuru', 300), showAnnouncement: flag(header.showAnnouncement, true, 'Duyuru görünürlüğü'), showSearch: flag(header.showSearch, true, 'Arama görünürlüğü'), sticky: flag(header.sticky, true, 'Sabit üst alan'), background: color(header.background, normalizedTheme.navy, 'Üst alan zemini'), textColor: color(header.textColor, '#ffffff', 'Üst alan metni') },
      footer: { description: text(footer.description, 'İyi seçimler için teknoloji, ev ve yaşam ürünlerini birlikte keşfet.', 'Alt alan açıklaması', 1000), copyright: text(footer.copyright, '© NovaStore. Yerel tasarım denemesi.', 'Telif metni', 300), background: color(footer.background, normalizedTheme.navy, 'Alt alan zemini'), textColor: color(footer.textColor, '#ffffff', 'Alt alan metni'), columns: list(footer.columns, footerDefaults, 6, 'Alt alan sütunları').map((column, index) => { const path = `Alt alan sütunu[${index}]`, source = object(column, {}, path); keys(source, ['id', 'title', 'links'], path, strict); return { id: identity(source.id, newId(), `${path}.id`), title: text(source.title, '', `${path}.title`, 100), links: list(source.links, [], 20, `${path}.links`).map((item, linkIndex) => link(item, `${path}.links[${linkIndex}]`, strict)) }; }) },
    },
    commerce: { gridColumns: number(commerce.gridColumns, 4, 2, 5, 'Ürün sütunu', true), imageRatio: choice(commerce.imageRatio, 'square', ['square', 'portrait', 'landscape'], 'Ürün görsel oranı'), showRating: flag(commerce.showRating, true, 'Puan görünürlüğü'), showBrand: flag(commerce.showBrand, true, 'Marka görünürlüğü'), showDiscount: flag(commerce.showDiscount, true, 'İndirim görünürlüğü'), showQuickAdd: flag(commerce.showQuickAdd, true, 'Hızlı ekleme') },
    templates: Object.fromEntries(TEMPLATE_KEYS.map(key => { const path = `Şablon ${key}`, source = object(templates[key], {}, path); keys(source, ['title', 'description', 'showIntro', 'blocks'], path, strict); return [key, { title: text(source.title, '', `${path}.title`, 200), description: text(source.description, '', `${path}.description`, 2500), showIntro: flag(source.showIntro, false, `${path}.showIntro`), blocks: list(source.blocks, [], 40, `${path}.blocks`).map((item, index) => block(item, `${path}.blocks[${index}]`, strict)) }]; })),
  };
}
