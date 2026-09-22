import { categories, products, getVisibleProducts, getProductsForCategory } from '../storefront/src/catalog.js';
import { BLOCK_TYPES, TEMPLATE_KEYS, normalizeWithDefaults, assertSafeTree, slugify } from './documentModel.js';
import { ANDROID_DESIGN_PRODUCTS } from '../android-existing/TrialCatalog.js';
import { getSectorCatalog, SECTOR_CATALOGS } from './sectorCatalog.js';

import {getCurrentMerchant} from './merchantWorkspaces.js';
import {isStudioHost,getHostCatalog} from '../studio-integration/context.js';
import {resolveCatalogFamily} from './merchantDesign.js';
import {applyDemo} from './designLibrary.js';
const merchantScope=getCurrentMerchant();
const scopeSuffix=merchantScope ? `:shop:${merchantScope.id}` : '';
const STORAGE_KEY = 'novastore-isolated-design-trial:studio-pro-v4' + scopeSuffix;
const PREVIOUS_STORAGE_KEY = 'novastore-isolated-design-trial:studio-pro-v3' + scopeSuffix;
const LEGACY_STORAGE_KEY = 'novastore-isolated-design-trial:existing-android-v2' + scopeSuffix;
const copy = value => JSON.parse(JSON.stringify(value));
const listeners = new Set();
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const mediaOptions = [
  { value: '/media/android-home-hero.png', label: 'Android · mevcut ana kampanya' },
  { value: '/media/hero-editorial.webp', label: 'Teknoloji · ana kampanya' },
  { value: '/media/category-home.webp', label: 'Ev & Yaşam · salon' },
  { value: '/media/product-fashion.webp', label: 'Moda · kadın giyim' },
  { value: '/media/category-cosmetics.webp', label: 'Kozmetik · bakım' },
  { value: '/media/category-sports.webp', label: 'Spor · aktif yaşam' },
  { value: '/media/category-toys.webp', label: 'Oyuncak · keşif' },
  { value: '/media/mega-electronics.webp', label: 'Elektronik · seçki' },
  { value: '/media/product-headphones.webp', label: 'Ürün · kulaklık' },
  { value: '/media/product-watch.webp', label: 'Ürün · akıllı saat' },
];
export const targetOptions = [
  { value: 'home', label: 'Ana sayfa' },
  { value: 'categories', label: 'Tüm kategoriler' },
  { value: 'search', label: 'Ürün arama' },
  { value: 'cart', label: 'Sepet' },
  { value: 'account', label: 'Hesabım' },
  { value: 'support', label: 'Destek' },
  { value: 'favorites', label: 'Favoriler' },
  ...categories.filter(c => c.active && !c.archived && c.customerVisible).map(c => ({ value: `category:${c.id}`, label: `Kategori · ${c.name}` })),
  { value: 'collection:firsatlar', label: 'Koleksiyon · Fırsatlar' },
  ...getVisibleProducts().map(p => ({ value: `product:${p.id}`, label: `Ürün · ${p.name}` })),
  { value: 'android-product:pulse-anc', label: 'Uygulama ürünü · Nova Pulse ANC' },
  { value: 'android-product:barista-pro', label: 'Uygulama ürünü · Nova Barista Pro' },
  { value: 'android-product:travel-case', label: 'Uygulama ürünü · Nova Seyahat Valizi' },
  { value: 'android-category:market', label: 'Uygulama kategorisi · Süpermarket' },
  { value: 'page:about', label: 'Sayfa · Hakkımızda' },
  { value: 'page:help', label: 'Sayfa · Yardım merkezi' },
];
export function targetHref(target, document, channel = 'web') {
  if (target === 'home') return '#/';
  if (target === 'categories') return '#/kategoriler';
  if (['search', 'cart', 'account', 'support', 'favorites'].includes(target)) return ({ search: '#/arama', cart: '#/sepet', account: '#/hesabim', support: '#/yardim', favorites: '#/favoriler' })[target];
  const [kind, id] = String(target || '').split(':');
  if(isStudioHost()){if(['product','android-product'].includes(kind))return '#/urun/'+id;if(['category','android-category'].includes(kind))return '#/kategori/'+id;if(kind==='collection')return '#/koleksiyon/'+id;if(kind==='page')return '#/sayfa/'+id;return '#/';}
  const sector = getSectorCatalog(resolveCatalogFamily(document));
  if (kind === 'category' || kind === 'android-category') {
    const item = sector?.categories.find(category => category.id === id);
    if (item) return `#/kategori/${item.canonicalPath}`;
    const legacy = categories.find(category => category.id === id && category.active && !category.archived);
    if (legacy) return sector ? `#/arama?q=${encodeURIComponent(legacy.name)}` : `#/kategori/${legacy.canonicalPath}`;
    const previous = Object.values(SECTOR_CATALOGS).flatMap(catalog => catalog.categories).find(category => category.id === id);
    if (previous) return `#/arama?q=${encodeURIComponent(previous.name)}`;
  }
  if (kind === 'product' || kind === 'android-product') {
    const item = sector?.products.find(product => String(product.id) === id);
    if (item) return `#/urun/${item.slug}`;
    const legacy = products.find(product => String(product.id) === id);
    if (legacy) return sector ? `#/arama?q=${encodeURIComponent(legacy.name)}` : `#/urun/${legacy.slug}`;
    const previous = Object.values(SECTOR_CATALOGS).flatMap(catalog => catalog.products).find(product => String(product.id) === id);
    if (previous) return `#/arama?q=${encodeURIComponent(previous.name)}`;
  }
  if (kind === 'android-product') { const item = ANDROID_DESIGN_PRODUCTS.find(product => product.id === id); if (item) return sector ? `#/arama?q=${encodeURIComponent(item.name)}` : `#/urun/${id}`; }
  if (kind === 'android-category' && id === 'market') return '#/kategori/supermarket';
  if (kind === 'collection' && id === 'firsatlar') return '#/koleksiyon/firsatlar';
  if (kind === 'page' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id || '')) {
    const source = document || state.channels[channel]?.published;
    if (source?.pages.some(page => page.id === id && page.enabled !== false)) return `#/sayfa/${id}`;
  }
  return '#/';
}
export function getScheduleTime(now = new Date()) {
  if (typeof location === 'undefined') return now;
  const params = new URLSearchParams(location.search), at = params.get('previewAt');
  return params.get('preview') === 'draft' && at && Number.isFinite(Date.parse(at)) ? new Date(at) : now;
}
export function isBlockActive(block, now = new Date()) {
  const stamp = Number(getScheduleTime(now));
  return block.enabled !== false && (!block.startsAt || stamp >= new Date(block.startsAt).getTime()) && (!block.endsAt || stamp < new Date(block.endsAt).getTime());
}
export function createBlock(type = 'banner') {
  if (!BLOCK_TYPES.includes(type)) throw new Error('Desteklenmeyen blok türü.');
  const base = { id: uid(), type, title: '', kicker: '', description: '', image: '', mobileImage: '', alt: '', buttonText: '', target: 'home', secondaryText: '', secondaryTarget: 'categories', enabled: true, startsAt: '', endsAt: '', showCopy: true, showTitle: true, style: { background: '', textColor: '', padding: 48, align: 'left', imagePosition: 'right' }, visibility: { desktop: true, mobile: true }, items: [], productLimit: 8, productSource: {mode:'all',categoryId:'',productIds:[]} };
  if(isStudioHost())return base;
  const presets = {
    hero: { title: 'İyi teknoloji, doğru seçimle başlar.', kicker: 'NOVA SEÇKİSİ', description: 'İhtiyacına göre düzenlenmiş kategoriler, karşılaştırılabilir ürünler ve güvenli alışveriş deneyimi.', image: '/media/hero-editorial.webp', mobileImage: '/media/hero-editorial.webp', alt: 'Seçilmiş teknoloji ürünleri', buttonText: 'Elektroniği keşfet', target: 'category:electronics', secondaryText: 'Günün fırsatları', secondaryTarget: 'collection:firsatlar' },
    categories: { title: 'Aradığını kolayca bul', kicker: 'KATEGORİLER', description: 'Her kategori, ihtiyacına uygun alt başlıklar ve filtrelerle düzenlendi.', buttonText: 'Tüm kategoriler', target: 'categories' },
    products: { title: 'Bugünün favorileri', kicker: 'ÖZENLE SEÇİLDİ', description: 'İyi tasarım, güçlü performans ve günlük yaşamın vazgeçilmezleri.', buttonText: 'Tümünü gör', target: 'collection:firsatlar' },
    editorial: { title: 'Yaşam alanını yeniden keşfet.', kicker: 'EV & YAŞAM', description: 'İşlevi ve tasarımı bir araya getiren ev teknolojileri, küçük ev aletleri ve dekorasyon seçkileri.', image: '/media/category-home.webp', mobileImage: '/media/category-home.webp', alt: 'Aydınlık ve sakin bir yaşam alanı', buttonText: 'Koleksiyonu incele', target: 'category:home-living' },
    announcement: { title: 'Birlikte daha iyi seçimler.', kicker: 'NOVASTORE', description: 'Ürünleri keşfet, karşılaştır ve favorilerine ekle.', buttonText: 'Kategorileri keşfet', target: 'categories' },
    banner: { title: 'Yeni bir keşfe hazır mısın?', kicker: 'ÖZEL SEÇKİ', description: 'Sevdiğin ürünler bir arada.', image: '/media/mega-electronics.webp', mobileImage: '/media/mega-electronics.webp', alt: 'Elektronik ürün seçkisi', buttonText: 'Seçkiyi keşfet', target: 'collection:firsatlar' },
    text: { title: 'Hikâyeni anlat.', kicker: 'NOVASTORE', description: 'Bu alanı markanın hikâyesi, bir koleksiyonun ilhamı veya müşterilerine vermek istediğin mesaj için düzenle.' },
    features: { title: 'Seçimini kolaylaştıran detaylar', items: [{ id: uid(), title: 'Birlikte keşfet', body: 'Ürünleri aynı yerde incele.', value: '', icon: 'search' }, { id: uid(), title: 'Karşılaştır', body: 'İhtiyacına uygun seçeneği bul.', value: '', icon: 'layers' }, { id: uid(), title: 'Favorilerine ekle', body: 'Sevdiklerini daha sonra kolayca bul.', value: '', icon: 'heart' }] },
    faq: { title: 'Merak ettiklerin', items: [{ id: uid(), title: 'Aradığım ürünü nasıl bulabilirim?', body: 'Kategorileri keşfedebilir veya arama alanını kullanabilirsin.', value: '', icon: '' }, { id: uid(), title: 'Favorilerime nasıl eklerim?', body: 'Üründeki kalp simgesine dokunman yeterli.', value: '', icon: '' }] },
    stats: { title: 'Bir bakışta NovaStore', description: 'Bu rakamlar düzenlenebilir örnek içeriktir.', items: [{ id: uid(), title: 'Keşif alanı', body: 'Örnek içerik', value: '6', icon: 'grid' }, { id: uid(), title: 'Tek deneyim', body: 'Web ve mobil', value: '2', icon: 'smartphone' }] },
    testimonials: { title: 'Deneyimler konuşsun.', description: 'Aşağıdaki metin örnektir; gerçek müşteri yorumu değildir.', items: [{ id: uid(), title: 'Örnek müşteri', body: 'Buraya yayımlama izni olan gerçek bir müşteri deneyimi ekleyebilirsin.', value: '', icon: 'quote' }] },
    divider: { title: '', style: { ...base.style, padding: 16 } },
    spacer: { title: '', style: { ...base.style, padding: 48 } },
  };
  return { ...base, ...(presets[type] || presets.banner) };
}
function initialDocument(channel) {
  const blockTypes = channel === 'android' ? ['hero', 'categories', 'products'] : ['hero', 'categories', 'products', 'editorial', 'announcement'];
  const blocks = blockTypes.map(type => ({ ...createBlock(type), id: `${channel}-${type}` }));
  if (channel === 'android') {
    blocks.forEach(block => { block.style.padding = 0; });
    Object.assign(blocks[0], { title: 'Yaşam alanına ilham kat.', kicker: 'EV & YAŞAM', description: 'Evin için seçilmiş ürünleri keşfet.', image: '/media/android-home-hero.png', mobileImage: '/media/android-home-hero.png', alt: 'NovaStore Android ana sayfa kampanyası', buttonText: 'Hemen keşfet', target: 'category:home-living', secondaryText: '', showCopy: false });
    Object.assign(blocks[1], { showTitle: false });
    Object.assign(blocks[2], { title: 'Bugünün Seçimleri', kicker: '', description: '' });
  }
  return {
    blocks,
    theme: { accent: channel === 'web' ? '#c45100' : '#fe5a02', navy: channel === 'web' ? '#04203b' : '#061e45', radius: channel === 'android' ? 12 : 16, fontScale: 1, motion: true },
    menus: channel === 'android' ? [
      { id: 'electronics', label: 'Elektronik', target: 'category:electronics', enabled: true },
      { id: 'fashion', label: 'Moda', target: 'category:fashion', enabled: true },
      { id: 'home-living', label: 'Ev & Yaşam', target: 'category:home-living', enabled: true },
      { id: 'beauty', label: 'Kozmetik', target: 'category:beauty', enabled: true },
      { id: 'sports', label: 'Spor', target: 'category:sports-outdoor', enabled: true },
      { id: 'market', label: 'Süpermarket', target: 'android-category:market', enabled: true },
    ] : [
      { id: 'electronics', label: 'Elektronik', target: 'category:electronics', enabled: true },
      { id: 'fashion', label: 'Moda & Giyim', target: 'category:fashion', enabled: true },
      { id: 'home-living', label: 'Ev & Yaşam', target: 'category:home-living', enabled: true },
      { id: 'beauty', label: 'Kozmetik & Bakım', target: 'category:beauty', enabled: true },
      { id: 'sports', label: 'Spor & Outdoor', target: 'category:sports-outdoor', enabled: true },
      { id: 'toys', label: 'Anne, Bebek & Oyuncak', target: 'category:mother-child-toys', enabled: true },
    ],
    pages: [
      { id: 'about', title: 'İyi seçimler için bir aradayız.', body: 'NovaStore, teknoloji ve günlük yaşam ürünlerini aynı yerde keşfetmen için tasarlandı.\n\nÜrünleri incele, özelliklerini karşılaştır ve ihtiyacına uygun seçenekleri favorilerine ekle.\n\nBu sayfa deneme ortamına ait örnek içeriktir. Gerçek işletme bilgileri yayına geçmeden önce eklenmelidir.' },
      { id: 'help', title: 'Sana nasıl yardımcı olabiliriz?', body: 'Ürünlerin teknik özelliklerini ürün sayfasında inceleyebilir, farklı seçenekleri karşılaştırabilir ve favorilerine ekleyebilirsin.\n\nBu denemede sipariş, ödeme veya destek talebi gönderilmez. Mevcut projedeki hesap ve destek bağlantıları entegrasyon aşamasında kullanılacaktır.' },
    ],
    app: { density: 'comfortable', bottomTabs: channel === 'android' ? ['home', 'categories', 'favorites', 'cart', 'support', 'account'] : ['home', 'categories', 'favorites', 'account'] },
  };
}
export function normalizeDocument(document, channel = 'web') { assertChannel(channel); return normalizeWithDefaults(document, channel, initialDocument(channel)); }
export const themePresets = [
  { id: 'nova', name: 'Nova Klasik', description: 'Mevcut lacivert ve turuncu kimlik.', colors: ['#04203b', '#c45100', '#ffffff'], theme: { accent: '#c45100', navy: '#04203b', background: '#ffffff', surface: '#f5f7fa', text: '#11263a', muted: '#607080', border: '#dfe5ec', radius: 16, fontFamily: 'Inter', buttonStyle: 'solid', shadow: 'soft' } },
  { id: 'calm', name: 'Sakin Doğa', description: 'Yumuşak zeminler ve koyu yeşil.', colors: ['#173b32', '#28684c', '#f7f8f4'], theme: { accent: '#28684c', navy: '#173b32', background: '#ffffff', surface: '#f7f8f4', text: '#1d332a', muted: '#5c7166', border: '#dce6dc', radius: 20, fontFamily: 'Inter', buttonStyle: 'soft', shadow: 'none' } },
  { id: 'editorial', name: 'Editoryal', description: 'Sıcak kâğıt tonları ve serif başlık hissi.', colors: ['#302721', '#9b442b', '#faf6ef'], theme: { accent: '#9b442b', navy: '#302721', background: '#fffdf9', surface: '#faf6ef', text: '#302721', muted: '#716459', border: '#e7ddd1', radius: 6, fontFamily: 'Georgia', buttonStyle: 'outline', shadow: 'none' } },
  { id: 'night', name: 'Gece Mavisi', description: 'Koyu yüzeyler ve belirgin vurgu.', colors: ['#101827', '#fcad68', '#182437'], theme: { accent: '#fcad68', navy: '#101827', background: '#101827', surface: '#182437', text: '#f3f6fc', muted: '#abbacf', border: '#30415a', radius: 14, fontFamily: 'Inter', buttonStyle: 'soft', shadow: 'strong' } },
];
export function getTargetOptions(document, channel = 'web') {
  assertChannel(channel);
  if(isStudioHost()) {
    const catalog=getHostCatalog(channel);
    return [...targetOptions.filter(option=>!(/^(?:category|product|android-category|android-product|page|collection):/.test(option.value))),...catalog.categories.map(category=>({value:`category:${category.id}`,label:`Kategori · ${category.name}`})),...(catalog.collections||[]).map(collection=>({value:`collection:${collection.id}`,label:`Koleksiyon · ${collection.name}`})),...catalog.products.map(product=>({value:`${channel==='android'?'android-product':'product'}:${product.id}`,label:`Ürün · ${product.name}`})),...(document?.pages||[]).filter(page=>page.enabled!==false).map(page=>({value:`page:${page.id}`,label:`Sayfa · ${page.title||page.slug||'İsimsiz sayfa'}`}))];
  }
  const options = targetOptions.filter(option => {
    if (option.value.startsWith('page:')) return false;
    if (channel === 'web') return !option.value.startsWith('android-');
    if (option.value.startsWith('product:')) return false;
    if (option.value.startsWith('category:')) return ['category:electronics', 'category:fashion', 'category:home-living', 'category:beauty', 'category:sports-outdoor'].includes(option.value);
    return true;
  });
  const sector = getSectorCatalog(resolveCatalogFamily(document));
  const active = sector ? [
    ...options.filter(option => !/^(?:category|product|android-category|android-product):/.test(option.value)),
    ...sector.categories.map(category => ({value:`category:${category.id}`,label:`Kategori · ${category.name}`})),
    ...sector.products.map(product => ({value:`${channel === 'android' ? 'android-product' : 'product'}:${product.id}`,label:`Ürün · ${product.name}`})),
  ] : options;
  {
    const used = new Set();
    const collect = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (['target', 'secondaryTarget'].includes(key) && typeof item === 'string') used.add(item);
        else if (item && typeof item === 'object') collect(item);
      }
    };
    collect(document);
    const known = getKnownDocumentCatalog(channel);
    const priorOptions = [...options,...known.categories.map(category=>({value:`category:${category.id}`,label:`Kategori · ${category.name}`})),...known.products.map(product=>({value:`${channel === 'android' ? 'android-product' : 'product'}:${product.id}`,label:`Ürün · ${product.name}`}))];
    for (const option of priorOptions) if (used.has(option.value) && !active.some(item => item.value === option.value)) active.push({...option,label:`Korunan içerik · ${option.label}`});
  }
  return [...active, ...(document?.pages || []).filter(page => page.enabled !== false).map(page => ({ value: `page:${page.id}`, label: `Sayfa · ${page.title || page.slug || 'İsimsiz sayfa'}` }))];
}
export function getDocumentCatalog(document, channel = 'web') {
  assertChannel(channel);
  if(isStudioHost())return getHostCatalog(channel);
  const sector = getSectorCatalog(resolveCatalogFamily(document));
  if (sector) return {products:sector.products,categories:sector.categories};
  return {
    products:channel === 'android' ? ANDROID_DESIGN_PRODUCTS.filter(product => !String(product.categoryId).startsWith('sector-')) : getVisibleProducts(),
    categories:categories.filter(category => category.active && !category.archived && category.customerVisible && (channel === 'web' || (!category.parentId && category.id !== 'mother-child-toys'))),
  };
}
export function getKnownDocumentCatalog(channel = 'web') {
  if(isStudioHost())return getHostCatalog(channel);
  if(merchantScope)return getDocumentCatalog(null,channel);
  const legacy = getDocumentCatalog(null, channel);
  return {products:[...legacy.products,...Object.values(SECTOR_CATALOGS).flatMap(catalog=>catalog.products)],categories:[...legacy.categories,...Object.values(SECTOR_CATALOGS).flatMap(catalog=>catalog.categories)]};
}
export function getTemplateOptions(channel = 'web', document) {
  assertChannel(channel);
  if(isStudioHost()){const catalog=getHostCatalog(channel);return [{id:'home',label:'Ana sayfa',hash:'#/'},{id:'template:category',label:'Kategori sayfası',hash:catalog.categories[0]?`#/kategori/${catalog.categories[0].canonicalPath||catalog.categories[0].id}`:'#/kategoriler'},{id:'template:product',label:'Ürün detayı',hash:catalog.products[0]?`#/urun/${catalog.products[0].id}`:'#/urun/'},{id:'template:search',label:'Arama sonuçları',hash:'#/arama'},{id:'template:cart',label:'Sepet',hash:'#/sepet'},{id:'template:account',label:'Hesabım',hash:'#/hesabim'},{id:'template:support',label:'Destek',hash:'#/yardim'}];}
  const sector = getSectorCatalog(resolveCatalogFamily(document));
  return [
    { id: 'home', label: 'Ana sayfa', hash: '#/' },
    { id: 'template:category', label: 'Kategori sayfası', hash: sector ? `#/kategori/${sector.categories[0].canonicalPath}` : '#/kategori/elektronik' },
    { id: 'template:product', label: 'Ürün detayı', hash: sector ? `#/urun/${sector.products[0].slug}` : channel === 'android' ? '#/urun/pulse-anc' : `#/urun/${products[0].slug}` },
    { id: 'template:search', label: 'Arama sonuçları', hash: sector ? `#/arama?q=${encodeURIComponent(sector.products[0].name.split(' ')[0])}` : '#/arama?q=telefon' },
    { id: 'template:cart', label: 'Sepet', hash: '#/sepet' },
    { id: 'template:account', label: 'Hesabım', hash: '#/hesabim' },
    { id: 'template:support', label: 'Destek', hash: '#/yardim' },
  ];
}
export function createPage(title = 'Yeni sayfa') {
  const id = `page-${uid()}`;
  return { id, slug: `${slugify(title)}-${id.slice(-5)}`, enabled: true, title: String(title || 'Yeni sayfa').slice(0, 200), body: '', seoTitle: '', seoDescription: '', blocks: [] };
}
export function getPageBlocks(document, pageKey = 'home') {
  if (pageKey === 'home') return document.blocks;
  if (pageKey.startsWith('page:')) { const page = document.pages.find(item => item.id === pageKey.slice(5)); if (page) return page.blocks; }
  if (pageKey.startsWith('template:')) { const key = pageKey.slice(9); if (TEMPLATE_KEYS.includes(key) && document.templates?.[key]) return document.templates[key].blocks; }
  throw new Error('Düzenlenecek sayfa veya şablon bulunamadı.');
}
export function setPageBlocks(document, pageKey, blocks) {
  if (!Array.isArray(blocks)) throw new Error('Bloklar liste olmalı.');
  getPageBlocks(document, pageKey);
  if (pageKey === 'home') document.blocks = blocks;
  else if (pageKey.startsWith('page:')) document.pages.find(item => item.id === pageKey.slice(5)).blocks = blocks;
  else document.templates[pageKey.slice(9)].blocks = blocks;
}
function allBlockGroups(document) { return [{ name: 'Ana sayfa', blocks: document.blocks, enabled: true }, ...document.pages.map(page => ({ name: page.title || page.id, blocks: page.blocks, enabled: page.enabled })), ...TEMPLATE_KEYS.map(key => ({ name: `Şablon ${key}`, blocks: document.templates[key].blocks, enabled: true }))]; }
function contrast(first, second) {
  const luminance = color => { const hex = color.slice(1); const expanded = hex.length === 3 ? [...hex].map(char => char + char).join('') : hex; const channels = [0, 2, 4].map(index => { const value = parseInt(expanded.slice(index, index + 2), 16) / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }); return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722; };
  const a = luminance(first), b = luminance(second); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
export function getDocumentHealth(document, channel = 'web') {
  const errors = [], warnings = [];
  let doc;
  try { doc = normalizeDocument(document, channel); } catch (error) { return { errors: [error.message], warnings, score: 0 }; }
  const validTargets = new Set(getTargetOptions(doc, channel).map(option => option.value));
  const activeCatalog = getDocumentCatalog(doc, channel);
  const sector = getSectorCatalog(doc.theme.family);
  const knownCatalog = getKnownDocumentCatalog(channel);
  const legacyProducts = knownCatalog.products;
  const unique = (items, field, label) => { const seen = new Set(); for (const item of items) { if (seen.has(item[field])) errors.push(`${label}: aynı ${field === 'slug' ? 'sayfa adresi' : 'kimlik'} birden çok kez kullanılmış.`); seen.add(item[field]); } };
  const checkTarget = (target, label) => { if (!validTargets.has(target)) errors.push(`${label}: hedef bulunamadı, gizli veya bu kanalda kullanılamıyor.`); };
  if (!doc.blocks.some(block => block.enabled)) {
    if (doc.design.blank) warnings.push('Boş tuval açık: ana sayfada henüz görünür bölüm yok. İlk bölümünü ekleyebilirsin.');
    else errors.push('Ana sayfada en az bir görünür blok bırak.');
  }
  else if (!doc.blocks.some(block => isBlockActive(block))) warnings.push('Ana sayfada şu anda yayın takvimine uygun görünür blok yok.');
  const blockIds = new Set();
  for (const group of allBlockGroups(doc)) for (const block of group.blocks) {
    if (blockIds.has(block.id)) errors.push('Blok kimlikleri belge içinde benzersiz olmalı.'); blockIds.add(block.id);
    unique(block.items, 'id', `${group.name} öğeleri`);
    if (!group.enabled || !block.enabled) continue;
    const label = `${group.name} · ${block.title || block.type}`;
    if (block.type === 'products') {
      const source = block.productSource, catalog = activeCatalog.products;
      if (source.mode === 'selected') {
        if (new Set(source.productIds).size !== source.productIds.length) errors.push(`${label}: seçkide aynı ürün birden fazla kullanılmış.`);
        if (source.productIds.some(id => ![...catalog,...legacyProducts].some(product => String(product.id) === String(id)))) errors.push(`${label}: seçkide bu kanalın kataloğunda olmayan ürün var.`);
        if (source.productIds.some(id => !catalog.some(product => String(product.id) === String(id)))) warnings.push(`${label}: önceki katalogdan korunan ürünler bu tasarımın seçkisinde gösterilmez; ürün seçimini güncelleyebilirsin.`);
        if (!source.productIds.length) warnings.push(`${label}: elle seçilen ürün listesi boş.`);
      }
      if (source.mode === 'category') {
        const legacyCategory = knownCatalog.categories.some(category => category.id === source.categoryId) || (channel === 'android' && source.categoryId === 'market');
        if (!activeCatalog.categories.some(category => category.id === source.categoryId) && !legacyCategory) errors.push(`${label}: seçki kategorisi bu kanalda bulunamadı.`);
        const matches = sector ? catalog.filter(product => product.categoryId === source.categoryId) : channel === 'android' ? catalog.filter(product => product.categoryId === source.categoryId) : getProductsForCategory(source.categoryId);
        if (source.categoryId && !matches.length) warnings.push(`${label}: bu kategoride denemede gösterilebilecek ürün bulunmuyor.`);
      }
    }
    if (!['spacer', 'divider'].includes(block.type) && !block.title.trim()) errors.push(`${group.name}: görünür bloğa başlık ekle.`);
    if (block.startsAt && !Number.isFinite(Date.parse(block.startsAt))) errors.push(`${label}: başlangıç tarihi geçersiz.`);
    if (block.endsAt && !Number.isFinite(Date.parse(block.endsAt))) errors.push(`${label}: bitiş tarihi geçersiz.`);
    if (block.startsAt && block.endsAt && Date.parse(block.endsAt) <= Date.parse(block.startsAt)) errors.push(`${label}: bitiş tarihi başlangıçtan sonra olmalı.`);
    if (block.buttonText.trim() || ['hero', 'banner', 'editorial', 'categories', 'products'].includes(block.type)) checkTarget(block.target, label);
    if (block.secondaryText.trim()) checkTarget(block.secondaryTarget, `${label} ikinci düğme`);
    if ((block.image || block.mobileImage) && !block.alt.trim()) warnings.push(`${label}: görsel açıklaması eksik.`);
    if (!block.visibility.desktop && !block.visibility.mobile) warnings.push(`${label}: her iki cihazda da gizli.`);
    if (['features', 'faq', 'stats', 'testimonials'].includes(block.type) && !block.items.length) warnings.push(`${label}: içerik öğesi eklenmemiş.`);
    if (block.style.textColor && contrast(block.style.textColor, block.style.background || doc.theme.background) < 4.5) warnings.push(`${label}: metin kontrastını kontrol et.`);
  }
  unique(doc.savedSections, 'id', 'Kayıtlı paketler');
  for (const section of doc.savedSections) { if (!section.name.trim()) errors.push('Kayıtlı pakete bir ad ver.'); if (!section.blocks.length) errors.push('Kayıtlı paket en az bir bölüm içermeli.'); }
  unique(doc.pages, 'id', 'Sayfalar'); unique(doc.pages, 'slug', 'Sayfalar'); unique(doc.menus, 'id', 'Menüler');
  for (const page of doc.pages) if (page.enabled) { if (!page.title.trim()) errors.push('Görünür sayfaya başlık ekle.'); if (!page.seoTitle.trim() || !page.seoDescription.trim()) warnings.push(`${page.title || page.id}: SEO başlığı veya açıklaması eksik.`); if (!page.body.trim() && !page.blocks.some(block => block.enabled)) warnings.push(`${page.title || page.id}: sayfa içeriği boş.`); }
  for (const menu of doc.menus) if (menu.enabled) { if (!menu.label.trim()) errors.push('Görünür menü başlığı boş olamaz.'); checkTarget(menu.target, menu.label || 'Menü'); }
  unique(doc.chrome.footer.columns, 'id', 'Alt alan sütunları');
  for (const column of doc.chrome.footer.columns) { unique(column.links, 'id', `Alt alan ${column.title}`); for (const link of column.links) if (link.enabled) { if (!link.label.trim()) errors.push('Alt alan bağlantı başlığı boş olamaz.'); checkTarget(link.target, link.label || 'Alt alan'); } }
  if (!doc.chrome.header.logoText.trim()) errors.push('Üst alandaki marka adı boş olamaz.');
  if (doc.app.bottomTabs[0] !== 'home' || new Set(doc.app.bottomTabs).size !== doc.app.bottomTabs.length) errors.push('Alt gezinmede Ana sayfa ilk sırada kalmalı ve her sekme bir kez kullanılmalı.');
  const pairs = [[doc.theme.text, doc.theme.background, 'Ana metin'], [doc.theme.muted, doc.theme.background, 'İkincil metin'], [doc.chrome.header.textColor, doc.chrome.header.background, 'Üst alan'], [doc.chrome.footer.textColor, doc.chrome.footer.background, 'Alt alan']];
  for (const [textColor, background, label] of pairs) if (contrast(textColor, background) < 4.5) warnings.push(`${label}: normal boyutlu metin için renk kontrastı düşük.`);
  if (doc.theme.buttonStyle === 'solid' && contrast('#ffffff', doc.theme.accent) < 4.5) warnings.push('Vurgu rengi üzerinde beyaz düğme metni kullanılırsa kontrast düşük kalabilir.');
  for (const [key, template] of Object.entries(doc.templates)) if (template.showIntro && !template.title.trim() && !template.description.trim()) warnings.push(`${key} şablonu: giriş alanı açık ancak metni boş.`);
  const result = { errors: [...new Set(errors)], warnings: [...new Set(warnings)], score: 100 };
  result.score = Math.max(0, 100 - result.errors.length * 15 - result.warnings.length * 3);
  return result;
}
export function validateDocument(document, channel = 'web') { return getDocumentHealth(document, channel).errors; }
function assertChannel(channel) { if (!['web', 'android'].includes(channel)) throw new Error('Geçersiz yayın kanalı.'); }
function initialState() {
  const channels = {};
  for (const channel of ['web', 'android']) { const base = normalizeDocument(initialDocument(channel), channel); const document = merchantScope ? normalizeDocument(applyDemo(base,merchantScope.defaultDesign,channel),channel) : base; channels[channel] = { draft: copy(document), published: copy(document), revision: 1, history: [{ id: `${channel}-initial`, at: new Date().toISOString(), note: 'Başlangıç görünümü', document: copy(document) }] }; }
  return { schemaVersion: 4, channels };
}
function normalizeState(data) {
  assertSafeTree(data);
  if (![1, 3, 4].includes(data?.schemaVersion)) throw new Error('Kayıt sürümü desteklenmiyor.');
  const channels = {};
  for (const channel of ['web', 'android']) {
    const source = data.channels?.[channel];
    if (!source || !Array.isArray(source.draft?.blocks) || !Array.isArray(source.published?.blocks) || !Array.isArray(source.history)) throw new Error('Kayıt yapısı geçersiz.');
    const draft = normalizeDocument(source.draft, channel), published = normalizeDocument(source.published, channel);
    const history = source.history.slice(0, 20).map(item => { if (!item || typeof item.id !== 'string' || typeof item.at !== 'string' || !Number.isFinite(Date.parse(item.at))) throw new Error('Yayın geçmişi geçersiz.'); return { id: item.id, at: item.at, note: String(item.note || '').slice(0, 300), document: normalizeDocument(item.document, channel) }; });
    channels[channel] = { draft, published, revision: Number.isInteger(source.revision) && source.revision > 0 ? source.revision : 1, history: history.length ? history : [{ id: `${channel}-migrated`, at: new Date().toISOString(), note: 'Önceki denemeden alındı', document: copy(published) }] };
  }
  return { schemaVersion: 4, channels };
}
function readStored(fallback) {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current !== null) return normalizeState(JSON.parse(current));
    const previous = localStorage.getItem(PREVIOUS_STORAGE_KEY);
    if (previous !== null) return normalizeState(JSON.parse(previous));
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy !== null) return normalizeState(JSON.parse(legacy));
  } catch { return fallback || initialState(); }
  return fallback || initialState();
}
let state = isStudioHost()?{schemaVersion:4,channels:{web:{draft:null,published:null},android:{draft:null,published:null}}}:readStored();
const editorHistory = { web: { past: [], future: [], lastKey: '', lastAt: 0, expected: '' }, android: { past: [], future: [], lastKey: '', lastAt: 0, expected: '' } };
function blankHistory(document) { return { past: [], future: [], lastKey: '', lastAt: 0, expected: JSON.stringify(document) }; }
for (const channel of ['web', 'android']) editorHistory[channel] = blankHistory(state.channels[channel].draft);
function update(next, afterWrite) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { throw new Error('Tarayıcı depolaması dolu veya kapalı. Daha küçük bir görsel seçip tekrar dene.'); }
  state = next; afterWrite?.(); listeners.forEach(fn => fn());
}
if (!isStudioHost() && typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) { const next = readStored(state); for (const channel of ['web', 'android']) if (JSON.stringify(next.channels[channel].draft) !== editorHistory[channel].expected) editorHistory[channel] = blankHistory(next.channels[channel].draft); state = next; listeners.forEach(fn => fn()); }
});
export function getState() { return state; }
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function getDocument(channel = 'web', preview = false) { assertChannel(channel); return copy(state.channels[channel][preview ? 'draft' : 'published']); }
function scalarChangeKey(before, after, path = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (typeof before !== typeof after || before === null || after === null) return [null];
  if (typeof before !== 'object') return typeof after === 'string' || typeof after === 'number' ? [path] : [null];
  if (Array.isArray(before)) { if (!Array.isArray(after) || before.length !== after.length || before.some((item, index) => item && typeof item === 'object' && 'id' in item && item.id !== after[index]?.id)) return [null]; }
  const keys = Object.keys(before); if (keys.length !== Object.keys(after).length || keys.some(key => !(key in after))) return [null];
  return keys.flatMap(key => scalarChangeKey(before[key], after[key], `${path}.${key}`));
}
function historyFor(channel, document) { const history = editorHistory[channel]; return history.expected === JSON.stringify(document) ? history : blankHistory(document); }
function draftHistory(channel, previous, document, options = {}) {
  const history = historyFor(channel, previous), now = Date.now(), changes = scalarChangeKey(previous, document);
  const changeKey = options.transactionId || (changes.length === 1 && changes[0]) || '';
  const coalesce = options.coalesce !== false && changeKey && history.lastKey === changeKey && now - history.lastAt <= 900 && !history.future.length;
  return { past: coalesce ? history.past : [...history.past, copy(previous)].slice(-40), future: [], lastKey: options.coalesce === false ? '' : changeKey, lastAt: now, expected: JSON.stringify(document) };
}
export function saveDraft(channel, document, options = {}) {
  assertChannel(channel);
  const normalized = normalizeDocument(document, channel), next = copy(readStored(state)), previous = next.channels[channel].draft;
  if (JSON.stringify(previous) === JSON.stringify(normalized)) return;
  const history = draftHistory(channel, previous, normalized, options);
  next.channels[channel].draft = normalized; update(next, () => { editorHistory[channel] = history; });
}
export function getEditorHistory(channel) { assertChannel(channel); return { canUndo: editorHistory[channel].past.length > 0, canRedo: editorHistory[channel].future.length > 0 }; }
export function undoDraft(channel) {
  assertChannel(channel); const next = copy(readStored(state)), current = next.channels[channel].draft, history = historyFor(channel, current);
  if (!history.past.length) { editorHistory[channel] = history; return false; }
  const document = copy(history.past[history.past.length - 1]); next.channels[channel].draft = document;
  update(next, () => { editorHistory[channel] = { past: history.past.slice(0, -1), future: [copy(current), ...history.future].slice(0, 40), lastKey: '', lastAt: 0, expected: JSON.stringify(document) }; }); return true;
}
export function redoDraft(channel) {
  assertChannel(channel); const next = copy(readStored(state)), current = next.channels[channel].draft, history = historyFor(channel, current);
  if (!history.future.length) { editorHistory[channel] = history; return false; }
  const document = copy(history.future[0]); next.channels[channel].draft = document;
  update(next, () => { editorHistory[channel] = { past: [...history.past, copy(current)].slice(-40), future: history.future.slice(1), lastKey: '', lastAt: 0, expected: JSON.stringify(document) }; }); return true;
}
export function publish(channel, note = 'Editörden yayınlandı') {
  assertChannel(channel); const next = copy(readStored(state)), entry = next.channels[channel], errors = validateDocument(entry.draft, channel);
  if (errors.length) throw new Error(errors.join(' '));
  entry.published = copy(entry.draft); entry.revision += 1;
  entry.history.unshift({ id: uid(), at: new Date().toISOString(), note: String(note).trim().slice(0, 300) || 'Editörden yayınlandı', document: copy(entry.published) }); entry.history = entry.history.slice(0, 20);
  update(next, () => { const history = historyFor(channel, entry.draft); editorHistory[channel] = { ...history, lastKey: '', lastAt: 0 }; }); return entry.revision;
}
export function rollback(channel, revisionId) {
  assertChannel(channel); const next = copy(readStored(state)), entry = next.channels[channel], revision = entry.history.find(item => item.id === revisionId);
  if (!revision) throw new Error('Bu yayın sürümü bulunamadı.');
  const errors = validateDocument(revision.document, channel); if (errors.length) throw new Error(`Bu eski sürüm yayımlanamıyor: ${errors.join(' ')}`);
  const history = draftHistory(channel, entry.draft, revision.document, { coalesce: false });
  entry.draft = copy(revision.document); entry.published = copy(revision.document); entry.revision += 1;
  entry.history.unshift({ id: uid(), at: new Date().toISOString(), note: `Önceki görünüm geri alındı · ${new Date(revision.at).toLocaleDateString('tr-TR')}`, document: copy(revision.document) }); entry.history = entry.history.slice(0, 20);
  update(next, () => { editorHistory[channel] = history; });
}
export function exportDocument(channel) { assertChannel(channel); return JSON.stringify({ format: 'novastore-studio-document', version: 4, channel, document: getDocument(channel, true) }, null, 2); }
export function importDocument(channel, text) {
  assertChannel(channel);
  if (typeof text !== 'string' || text.length > 8000000) throw new Error('İçe aktarılacak JSON en fazla 8 MB olmalı.');
  let input; try { input = JSON.parse(text); } catch { throw new Error('Dosya geçerli JSON içermiyor.'); }
  assertSafeTree(input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dosya bir Studio belgesi içermeli.');
  let document = input;
  if ('format' in input || 'document' in input) {
    if (Object.keys(input).some(key => !['format', 'version', 'channel', 'document'].includes(key))) throw new Error('Dışa aktarım dosyasında tanınmayan alan var.');
    if (input.format !== 'novastore-studio-document' || ![3, 4].includes(input.version)) throw new Error('Dışa aktarım sürümü desteklenmiyor.');
    if (input.channel !== channel) throw new Error('Dosyanın yayın kanalı bu editörle eşleşmiyor.');
    document = input.document;
  }
  if (!Array.isArray(document?.blocks)) throw new Error('Dosyada ana sayfa blokları bulunamadı.');
  const normalized = normalizeWithDefaults(document, channel, initialDocument(channel), true), errors = validateDocument(normalized, channel);
  if (errors.length) throw new Error(`Dosya içe aktarılamadı: ${errors.join(' ')}`);
  saveDraft(channel, normalized, { coalesce: false });
}
export function resetSandbox() { const next = initialState(); update(next, () => { for (const channel of ['web', 'android']) editorHistory[channel] = blankHistory(next.channels[channel].draft); }); }
