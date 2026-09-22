import { STORE_DEMOS, createDemoBlocks, getStoreDemo } from './storeDemos.js';
import { getSectorCatalog } from './sectorCatalog.js';
import { normalizeVisualDesign } from './visualDesign.js';
import { categories as canonicalCategories } from '../storefront/src/catalog.js';
// Presentation blueprints are deliberately independent of storage and catalog state.
import {adaptMerchantDemo,resolveCatalogFamily} from './merchantDesign.js';
const clone = value => JSON.parse(JSON.stringify(value));
const uid = () => globalThis.crypto?.randomUUID?.() || `section-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const V4_PRESETS = [
  { id: 'nova-commerce', name: 'Nova Commerce', family: 'nova-commerce', description: 'Güçlü arama alanı, kapsamlı ürün kartları ve düzenli mağaza gezinmesi. Uygulamada da sitenin alışıldık ritmi.', tags: ['Site odaklı', 'Kapsamlı katalog'], colors: {accent:'#c45100',navy:'#04203b',background:'#ffffff'}, theme:{surface:'#f5f7fa',text:'#11263a',muted:'#607080',border:'#dfe5ec',radius:16,fontFamily:'Inter',buttonStyle:'solid',shadow:'soft',spacing:1,headingScale:1}, grid:4, ratio:'square' },
  { id: 'nova-pocket', name: 'Nova Pocket', family: 'pocket', description: 'Uygulamanın keşif odaklı dili webde. Yuvarlak kategoriler, kompakt gezinme ve dokunmaya uygun kartlar.', tags: ['Uygulama odaklı', 'Rahat keşif'], colors:{accent:'#d84800',navy:'#061e45',background:'#f4f6f9'}, theme:{surface:'#ffffff',text:'#142238',muted:'#5e6d81',border:'#dce3ec',radius:24,fontFamily:'system',buttonStyle:'solid',shadow:'soft',spacing:1,headingScale:1}, grid:4, ratio:'square' },
  { id: 'stocky-purple', name: 'Stocky Atelier', family: 'workspace', description: 'Stocky’nin mor panel dilinden ilham alan, kategori ve ürünleri hızlı taramayı kolaylaştıran kompakt düzen.', tags:['Stocky esintisi','Yoğun katalog'], colors:{accent:'#663399',navy:'#35214b',background:'#f5f4f8'}, theme:{surface:'#ffffff',text:'#30263b',muted:'#6b6075',border:'#e0dbe8',radius:10,fontFamily:'Inter',buttonStyle:'solid',shadow:'none',spacing:.8,headingScale:.95}, grid:2, ratio:'square' },
  { id: 'stocky-green', name: 'Stocky Botanika', family: 'workspace', description: 'Stocky merkez panelinin yeşil ve beyaz yüzeylerinden ilhamla ferah, işlev odaklı bir mağaza.', tags:['Stocky esintisi','Sakin yeşil'], colors:{accent:'#197044',navy:'#173b2c',background:'#f4f7f4'}, theme:{surface:'#ffffff',text:'#203a2c',muted:'#58715f',border:'#d9e5dc',radius:14,fontFamily:'Inter',buttonStyle:'soft',shadow:'none',spacing:.9,headingScale:1}, grid:2, ratio:'square' },
  { id: 'editorial-gallery', name: 'Nova Gallery', family:'gallery', description:'Büyük ürün görselleri, sakin boşluklar ve editoryal başlıklarla seçkin bir vitrin. Web ve uygulamada ortak karakter.', tags:['Editoryal','Büyük görseller'], colors:{accent:'#934b37',navy:'#322a25',background:'#fffdf9'}, theme:{surface:'#f4efe7',text:'#322a25',muted:'#746458',border:'#e5dcd0',radius:4,fontFamily:'Georgia',buttonStyle:'outline',shadow:'none',spacing:1.2,headingScale:1.15}, grid:3, ratio:'portrait' },
];
export const DESIGN_PRESETS = STORE_DEMOS;
export function applyDesign(document, presetId, channel = 'web') {
  const preset = getStoreDemo(presetId) || V4_PRESETS.find(item => item.id === presetId);
  if (!preset) return document;
  const next = clone(document);
  next.theme = {...next.theme, ...preset.colors, ...preset.theme, family:preset.family, demoId:preset.id, fontScale:1, contentWidth:['gallery','living'].includes(preset.family) ? 1360 : preset.family === 'pocket' ? 1200 : 1440};
  const whiteHeader = ['pocket','living','fashion','gallery','market','beauty','kids'].includes(preset.family);
  next.chrome.header = {...next.chrome.header, logoText:"Nova Store", background:whiteHeader ? preset.colors.background : preset.colors.navy, textColor:whiteHeader ? preset.theme.text : '#ffffff'};
  next.chrome.footer = {...next.chrome.footer, background:preset.colors.navy, textColor:'#ffffff'};
  next.commerce = {...next.commerce, gridColumns:preset.grid, imageRatio:preset.ratio};
  next.app = {...next.app, density:preset.family === 'workspace' ? 'compact' : 'comfortable'};
  // The original Android palette and typography belong to its Pocket presentation.
  if (channel === 'android' && preset.family === 'pocket') Object.assign(next.theme, {accent:'#fe5a02',fontFamily:'system',radius:12});
  return next;
}
// A full demo installs editable home sections and navigation presentation, never customer data.
export function applyDemo(document, presetId, channel = 'web') {
  const preset = getStoreDemo(presetId);
  if (!preset) return document;
  const next = applyDesign(document,presetId,channel);
  next.design = normalizeVisualDesign(undefined);
  next.blocks = createDemoBlocks(preset,channel);
  next.app.bottomTabs = ['home','categories','favorites','cart','account'];
  next.chrome.header.tagline = preset.family === 'pocket' ? '' : preset.subtitle;
  next.chrome.header.announcement = ({fashion:'Yeni sezon seçkisini keşfet',living:'Yaşam alanına yeni bir bakış',beauty:'Kendi bakım ritüelini keşfet',sport:'Yeni bir rotaya hazırlan',kids:'Her güne küçük bir keşif'}[preset.family] || 'NovaStore · İyi seçimlerin adresi');
  next.chrome.header.showAnnouncement = !['pocket','market','workspace','tech','sport'].includes(preset.family);
  next.chrome.footer.description = preset.subtitle;
  const sector = getSectorCatalog(preset.family);
  if (sector) {
    next.menus = sector.categories.map(category => ({id:category.id,label:category.name,target:`category:${category.id}`,enabled:true}));
    next.chrome.footer.columns = [
      {id:'demo-collections',title:preset.family === 'market' ? 'Reyonlar' : 'Koleksiyonlar',links:next.menus.map(menu=>({...menu}))},
      {id:'demo-shopping',title:'Alışverişin',links:[{id:'demo-account',label:'Hesabım',target:'account',enabled:true},{id:'demo-favorites',label:'Favorilerim',target:'favorites',enabled:true},{id:'demo-cart',label:'Sepetim',target:'cart',enabled:true},{id:'demo-support',label:'Yardım merkezi',target:'support',enabled:true}]},
      {id:'demo-about',title:'NovaStore',links:next.pages.filter(page=>page.enabled !== false).slice(0,5).map(page=>({id:`demo-${page.id}`,label:page.title,target:`page:${page.id}`,enabled:true}))},
    ];
  } else {
    next.menus = canonicalCategories.filter(category=>!category.parentId && category.active && category.customerVisible && !category.archived && (channel !== 'android' || category.id !== 'mother-child-toys')).map(category=>({id:category.id,label:category.name,target:`category:${category.id}`,enabled:true}));
    if (channel === 'android') next.menus.push({id:'market',label:'Süpermarket',target:'android-category:market',enabled:true});
    next.chrome.footer.columns = [
      {id:'discover',title:'Keşfet',links:[{id:'categories',label:'Tüm kategoriler',target:'categories',enabled:true},{id:'deals',label:'Günün fırsatları',target:'collection:firsatlar',enabled:true}]},
      {id:'novastore',title:'NovaStore',links:next.pages.filter(page=>page.enabled !== false).slice(0,5).map(page=>({id:page.id,label:page.id==='about'?'Hakkımızda':page.id==='help'?'Yardım merkezi':page.title,target:`page:${page.id}`,enabled:true}))},
    ];
  }
  return adaptMerchantDemo(next,channel);
}
const pack = (id,name,occasion,description,image,background,text,accent,title,categoryId,productsTitle,editorialTitle,editorialText) => ({id,name,occasion,description,image,colors:{background,text,accent},blockCount:3,title,categoryId,productsTitle,editorialTitle,editorialText});
export const SEASON_PACKS = [
  pack('ramadan','Ramazan · Birlikte güzel','Ramazan','Sofra, ev ve paylaşma etrafında sıcak bir seçki.','/media/category-home.webp','#173e36','#fff8e7','#b99655','Aynı sofrada, güzel anılarda.','home-living','Sofrana ve evine yakışanlar','Küçük detaylar, güzel buluşmalar.','Birlikte geçirilen zamanları güzelleştiren ev ve yaşam ürünlerini keşfet.'),
  pack('eid','Bayram · Sevinci paylaş','Bayram','Hediye, ziyaret ve yenilenme için kutlama paketi.','/media/product-fashion.webp','#f9eee7','#592d39','#9a4b63','Bayramın en güzeli, birlikte olanı.','fashion','Bayram hazırlıkları','Sevdiklerine küçük bir mutluluk.','Stiline ve sevdiklerine uygun seçenekleri bir arada incele.'),
  pack('summer','Yaz · Hafif yaşa','Yaz','Seyahat, açık hava ve uzun günler için canlı bir vitrin.','/media/category-sports.webp','#eaf6f3','#174f4e','#ad4d25','Güneşin ritmine katıl.','sports-outdoor','Yazın favorileri','Yeni rotalar, hafif adımlar.','Açık havada daha çok zaman geçirmek için ihtiyacına uygun parçaları keşfet.'),
  pack('winter','Kış · Evde iyi hisset','Kış','Sıcak dokular, ev keyfi ve kış hazırlıkları.','/media/android-home-hero.png','#edf2f8','#243d59','#476886','Dışarısı kış. İçerisi senin dünyan.','home-living','Kışa eşlik eden seçimler','Evde geçirdiğin zamana değer kat.','Dinlenme köşenden günlük rutinlerine, yaşam alanın için ilham veren detaylar.'),
  pack('school','Okula dönüş · Yeni başlangıçlar','Okula dönüş','Çalışma alanı ve teknoloji için odaklı bir seçki.','/media/hero-editorial.webp','#f2efdb','#3e4530','#606d35','Yeni döneme, iyi bir başlangıç.','electronics','Öğrenmeye eşlik eden teknoloji','Kendi çalışma ritmini bul.','Masanı ve çalışma alanını ihtiyacına göre düzenle; seçenekleri karşılaştırarak karar ver.'),
  pack('new-year','Yeni yıl · Yeni hikâyeler','Yeni yıl','Hediye seçkisi ve yeni başlangıçlar için düzenlenebilir paket.','/media/product-watch.webp','#f4e9e8','#642f37','#963f4b','Yeni bir yıla, yeni hikâyelere.','electronics','İlham veren hediye fikirleri','Kendine de bir iyilik yap.','Günlük yaşamına değer katacak bir parçayla yeni bir başlangıç yap.'),
  pack('special-day','Özel gün · İçinden geldiği gibi','Özel günler','Anneler Günü, Babalar Günü veya kişisel bir kutlamaya uyarlanır.','/media/category-cosmetics.webp','#f6edf1','#563950','#885471','En güzel hediye, düşünülmüş olan.','beauty','Özenle seçilmiş fikirler','Bir teşekkürün pek çok yolu var.','Başlığı ve ürünleri kutlayacağın güne göre düzenle; sevdiklerine uygun seçenekleri öne çıkar.'),
  pack('weekend','Hafta sonu · Kendine zaman ayır','Her zaman','Rutin dışına çıkmak ve ürün keşfetmek için sürekliliği olan paket.','/media/product-headphones.webp','#edf0f8','#303c68','#515eb3','Biraz yavaşla. Kendine yer aç.','electronics','Hafta sonuna yakışanlar','Küçük bir mola, yeni bir enerji.','Müzik, hareket ve evde keyifli anlar için kendi seçkini oluştur.'),
];
export function cloneSectionBlocks(blocks) { return clone(blocks).map(block => ({...block,id:uid(),items:(block.items || []).map(item => ({...item,id:uid()}))})); }
export function createSeasonBlocks(packId, channel = 'web', {startsAt='',endsAt='',family=''} = {}) {
  const p = SEASON_PACKS.find(item => item.id === packId);
  if (!p) throw new Error('Hazır dönem paketi bulunamadı.');
  if ((startsAt && !Number.isFinite(Date.parse(startsAt))) || (endsAt && !Number.isFinite(Date.parse(endsAt))) || (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt))) throw new Error('Başlangıç ve bitiş tarihlerini kontrol et.');
  const sector = getSectorCatalog(resolveCatalogFamily({theme:{family}}));
  const categoryId = sector?.categories[0].id || (channel === 'android' ? ({summer:'fashion','special-day':'home-living'}[packId] || p.categoryId) : p.categoryId);
  const image = sector?.products[0].imageUrl || (channel === 'android' && packId === 'special-day' ? '/media/category-home.webp' : p.image);
  const base = {enabled:true,startsAt,endsAt,showCopy:true,showTitle:true,visibility:{desktop:true,mobile:true},items:[],productLimit:6,productSource:{mode:'all',categoryId:'',productIds:[]},style:{background:'',textColor:'',padding:channel === 'android' ? 16 : 48,align:'left',imagePosition:'right'}};
  return cloneSectionBlocks([
    {...base,type:'banner',title:p.title,kicker:p.occasion.toLocaleUpperCase('tr-TR'),description:sector?`${p.occasion} için ${sector.name.toLocaleLowerCase('tr-TR')} seçkisini keşfet.`:p.description,image,mobileImage:image,alt:sector?sector.products[0].name:p.name,buttonText:'Seçkiyi keşfet',target:sector?'categories':`category:${categoryId}`,style:{...base.style,background:p.colors.background,textColor:p.colors.text}},
    {...base,type:'products',title:sector?`${p.occasion} seçkisi`:p.productsTitle,kicker:'SENİN İÇİN SEÇİLDİ',description:'İhtiyacına uygun ürünü seç, ayrıntılarını incele.',buttonText:'Seçkiyi keşfet',target:sector?'categories':`category:${categoryId}`,productSource:sector?{mode:'all',categoryId:'',productIds:[]}:{mode:'category',categoryId,productIds:[]}},
    {...base,type:'text',title:p.editorialTitle,kicker:p.name.split(' · ')[0],description:sector?'Sevdiğin parçaları keşfet, özelliklerini karşılaştır ve kendi seçkini oluştur.':p.editorialText,buttonText:'Tüm kategoriler',target:'categories',style:{...base.style,background:p.colors.background,textColor:p.colors.text,align:'center'}},
  ]);
}
