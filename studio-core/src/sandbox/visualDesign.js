import {visualAssets} from './visual/visualAssets.js';
export const VISUAL_ELEMENTS = [
  {id:'header',label:'Üst bar',group:'Site çerçevesi',selectors:'.site-header',native:'[data-testid="app-topbar"], .family-brand-row, .trial-global-announcement'},
  {id:'search',label:'Arama alanı',group:'Site çerçevesi',selectors:'.search-box, .demo-pocket-mobilebar button[aria-controls="demo-pocket-discovery"]',native:'.search-field, button[aria-label="Ara"]'},
  {id:'searchButton',label:'Arama düğmesi',group:'Site çerçevesi',selectors:'.search-box button[type="submit"], .demo-pocket-mobilebar button[aria-controls="demo-pocket-discovery"]',native:'button[aria-label="Ara"]'},
  {id:'logo',label:'Logo ve marka',group:'Site çerçevesi',selectors:'.site-header .brand',native:'.family-brand-row > strong'},
  {id:'logoImage',label:'Logo görseli',group:'Site çerçevesi',selectors:'.site-header .brand img',native:'.family-brand-row img'},
  {id:'nav',label:'Kategori menüsü',group:'Site çerçevesi',selectors:'.category-navigation, .demo-header-links, .demo-console-navigation, .demo-fashion-navigation, .demo-market-navigation, .demo-editorial-navigation, .demo-pocket-dock, .mobile-bottom-nav',native:'.trial-home-shortcuts, .bottom-nav'},
  {id:'allCategories',label:'Tüm kategoriler düğmesi',group:'Site çerçevesi',selectors:'.all-categories-button, .demo-category-trigger',native:'.category-rail button'},
  {id:'footer',label:'Alt bilgi',group:'Site çerçevesi',selectors:'.family-footer, .site-footer',native:'.family-store-footer'},
  {id:'productCard',label:'Ürün kartı',group:'Ürün tasarımı',selectors:'.os-product-card, .customer-product-card',native:'.trial-product-card, .product-card'},
  {id:'productImage',label:'Kart görseli',group:'Ürün tasarımı',selectors:'.os-product-image, .customer-card-media-stage',native:'.product-card .product-media'},
  {id:'productTitle',label:'Ürün adı',group:'Ürün tasarımı',selectors:'.os-product-title, .customer-product-card h3',native:'.product-card .product-title-action'},
  {id:'productPrice',label:'Ürün fiyatı',group:'Ürün tasarımı',selectors:'.os-product-price, .customer-card-price strong',native:'.product-card .price strong'},
  {id:'addButton',label:'Sepete ekle düğmesi',group:'Ürün tasarımı',selectors:'.os-product-add, .customer-card-cart-button',native:'.product-card .add-cart'},
  {id:'productGallery',label:'Ürün detay görsel alanı',group:'Ürün detayı',selectors:'.product-page .runtime-product-gallery',native:'.pdp-gallery'},
  {id:'productInfo',label:'Ürün detay bilgi alanı',group:'Ürün detayı',selectors:'.product-page .product-summary',native:'.pdp-info'},
  {id:'communityScore',label:'Müşteri puanı kartı',group:'Ürün detayı',selectors:'.community-score-card',native:'.pdp-review-summary'},
  {id:'communityQuestions',label:'Soru & cevap kartı',group:'Ürün detayı',selectors:'.community-question-intro',native:'.pdp-question-summary'},
  {id:'accountCard',label:'Hesap kartları',group:'Hesap & sepet',selectors:'.account-stats > a, .demo-profile-disclosure, .account-content > .profile-editor',native:'.profile-card'},
  {id:'cartRow',label:'Sepetteki ürün satırı',group:'Hesap & sepet',selectors:'.cart-page-line, .cart-line',native:'.cart-item'},
  {id:'cartSummary',label:'Sepet ve sipariş özeti',group:'Hesap & sepet',selectors:'.order-summary',native:'.order-summary, .checkout-summary-card'},
  {id:'pageTitle',label:'Sayfa başlıkları',group:'Tipografi',selectors:'main h1',native:'main h1'},
  {id:'button',label:'Eylem düğmeleri',group:'Tipografi',selectors:'main .primary-button, main .ghost-button, main .original-action, main .original-secondary-action, main .buy-now-button, main .original-selection-total button',native:'main .primary, main .trial-content-action'},
  {id:'canvas',label:'Sayfa zemini',group:'Sayfa',selectors:'main.page, main.page-home',native:'main.phone-content, main'},
];
export const STYLE_NUMBERS = {
  width:[20,100,'%'],widthPx:[12,1920,'px'],maxWidth:[160,1920,'px'],minHeight:[0,800,'px'],height:[24,800,'px'],
  borderRadius:[0,80,'px'],borderWidth:[0,8,'px'],paddingX:[0,120,'px'],paddingY:[0,120,'px'],
  marginTop:[0,160,'px'],marginBottom:[0,160,'px'],gap:[0,80,'px'],fontSize:[10,100,'px'],
  fontWeight:[300,900,''],lineHeight:[1,2.5,''],letterSpacing:[-3,12,'px'],iconSize:[12,48,'px'],
};
export const STYLE_CHOICES={textAlign:['left','center','right'],fontFamily:['Inter','Arial','Georgia','system'],shadow:['none','soft','elevated'],imageFit:['cover','contain'],imageRatio:['1 / 1','3 / 4','4 / 3','16 / 9'],layout:['row','column'],justify:['flex-start','center','space-between']};
const COLOR_KEYS=['background','color','borderColor'];
const BLOCK_KEY=/^block:([a-zA-Z0-9_-]{1,100}):(section|title|copy|image|button)$/;
const CATEGORY_KEY=/^category:([a-zA-Z0-9_-]{1,100}):(text|image|box)$/;
const ITEM_KEY=/^item:([a-zA-Z0-9_-]{1,100}):(text|image|box|button|icon)$/;
export function parseVisualElement(id){const category=String(id).match(CATEGORY_KEY);if(category)return {kind:'category',key:category[1],part:category[2]};const item=String(id).match(ITEM_KEY);if(item)return {kind:'item',key:item[1],part:item[2]};const block=String(id).match(BLOCK_KEY);if(block)return {kind:'block',key:block[1],part:block[2]};return null;}
export function isVisualElement(id){return typeof id==='string'&&(VISUAL_ELEMENTS.some(item=>item.id===id)||!!parseVisualElement(id));}
export function visualLabel(id){const item=VISUAL_ELEMENTS.find(item=>item.id===id);if(item)return item.label;const parsed=parseVisualElement(id);if(parsed?.kind==='category')return {text:'Kategori yazısı',image:'Kategori görseli',box:'Kategori görsel kutusu'}[parsed.part];if(parsed?.kind==='item')return {text:'Seçili metin',image:'Seçili görsel',box:'Seçili kutu',button:'Seçili düğme',icon:'Seçili simge'}[parsed.part];return ({section:'Bölüm kutusu',title:'Bölüm başlığı',copy:'Bölüm açıklaması',image:'Bölüm görseli',button:'Bölüm düğmesi'}[parsed?.part]||'Öğe');}
export function visualContentKeys(id){const parsed=parseVisualElement(id);if(id==='logoImage'||parsed?.part==='image')return ['imageUrl','alt'];if(parsed&&['text','button'].includes(parsed.part))return ['text'];return [];}
export function supportsVisualAsset(id){return ['logo','logoImage'].includes(id)||['icon','image'].includes(parseVisualElement(id)?.part);}
function normalizeContent(value,id,strict){
  if(value===undefined)return undefined;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Öğe içeriği geçerli bir nesne olmalı.');
  const allowed=visualContentKeys(id),result={};
  for(const [key,setting]of Object.entries(value)){
    if(!allowed.includes(key)){if(strict)throw new Error('Bu öğe için desteklenmeyen içerik alanı.');continue;}
    const max=key==='imageUrl'?1900000:key==='alt'?300:2000;
    if(typeof setting!=='string'||setting.length>max)throw new Error(`Öğe içeriği en fazla ${max} karakter olabilir.`);
    if(key==='imageUrl'&&setting&&!/^(?:package:theme-assets\/[a-z0-9_-]+\/[a-z0-9_-]+\.(?:png|webp|jpg)|asset:[0-9a-f-]{36})$/i.test(setting)&&!/^\/media\/(?!.*\.\.)[a-z0-9_/-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(setting)&&!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(setting))throw new Error('Görsel için yerel medya veya PNG/JPEG/WebP yüklemesi kullan.');
    result[key]=setting;
  }
  return result;
}
export function getVisualContent(design,id){return design?.elements?.find(element=>element.id===id)?.content||{};}
export function resolveVisualCategory(design,category){
  if(!category)return category;
  const text=getVisualContent(design,`category:${category.id}:text`),image=getVisualContent(design,`category:${category.id}:image`);
  // An unfinished label edit must never remove a category from the runtime
  // catalogue or make its products disappear from discovery.
  const hasName=typeof text.text==='string'&&text.text.trim().length>0;
  if(!hasName&&!image.imageUrl&&image.alt===undefined)return category;
  return {...category,...(hasName?{name:text.text,label:text.text}:{}),...(image.imageUrl?{imageUrl:image.imageUrl,image:image.imageUrl}:{}),...(image.alt!==undefined?{alt:image.alt}:{})};
}
export function normalizeVisualDesign(value,strict=false){
  if(value===undefined)return {name:'Özel tasarım',blank:false,header:true,footer:true,navigation:true,elements:[]};
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Tasarım çalışma alanı geçerli bir nesne olmalı.');
  const allowed=['name','blank','header','footer','navigation','elements'];
  if(strict&&Object.keys(value).some(key=>!allowed.includes(key)))throw new Error('Tasarım çalışma alanında desteklenmeyen alan.');
  if(value.name!==undefined&&(typeof value.name!=='string'||value.name.length>80))throw new Error('Tasarım adı en fazla 80 karakter olabilir.');
  const result={name:value.name??'Özel tasarım',blank:false,header:true,footer:true,navigation:true,elements:[]};
  for(const key of ['blank','header','footer','navigation']){if(value[key]!==undefined&&typeof value[key]!=='boolean')throw new Error('Tasarım görünürlüğü geçersiz.');if(value[key]!==undefined)result[key]=value[key];}
  if(value.elements!==undefined&&(!Array.isArray(value.elements)||value.elements.length>240))throw new Error('En fazla 240 öğe kişiselleştirilebilir.');
  const seen=new Set();
  for(const entry of value.elements||[]){
    if(!entry||!isVisualElement(entry.id)||seen.has(entry.id))throw new Error('Tasarım öğesi kimliği geçersiz veya yinelenmiş.');
    if(strict&&Object.keys(entry).some(key=>!['id','desktop','tablet','mobile','content','visual','animation','decorations'].includes(key)))throw new Error('Tasarım öğesinde desteklenmeyen alan.');
    seen.add(entry.id);const normalized={id:entry.id};
    const content=normalizeContent(entry.content,entry.id,strict);if(content&&Object.keys(content).length)normalized.content=content;
    if(entry.visual!==undefined){if(!supportsVisualAsset(entry.id))throw new Error('Görsel değişimi için bir simge, logo veya görsel seç.');normalized.visual=visualAssets.normalizeVisual(entry.visual);}
    if(entry.animation!==undefined)normalized.animation=visualAssets.normalizeAnimation(entry.animation);
    if(entry.decorations!==undefined)normalized.decorations=visualAssets.normalizeDecorations(entry.decorations);
    for(const device of ['desktop','tablet','mobile']){
      const styles=entry[device]??{};if(!styles||typeof styles!=='object'||Array.isArray(styles))throw new Error('Cihaz ayarları geçersiz.');
      normalized[device]={};
      for(const [key,setting]of Object.entries(styles)){
        if(STYLE_NUMBERS[key]){const [min,max]=STYLE_NUMBERS[key];if(typeof setting!=='number'||!Number.isFinite(setting)||setting<min||setting>max)throw new Error(`${visualLabel(entry.id)} ölçüsü ${min}–${max} aralığında olmalı.`);}
        else if(COLOR_KEYS.includes(key)){if(typeof setting!=='string'||!/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(setting))throw new Error('Geçerli bir HEX renk kodu kullan.');}
        else if(STYLE_CHOICES[key]){if(!STYLE_CHOICES[key].includes(setting))throw new Error('Desteklenmeyen görünüm seçeneği.');}
        else {if(strict)throw new Error('Desteklenmeyen tasarım özelliği.');continue;}
        normalized[device][key]=setting;
      }
    }
    result.elements.push(normalized);
  }
  return result;
}
export function visualSelector(id,channel='web'){
  const element=VISUAL_ELEMENTS.find(item=>item.id===id);if(element)return `[data-visual-element="${id}"], ${channel==='android'?element.native:element.selectors}`;
  const parsed=parseVisualElement(id);
  if(parsed?.kind==='category'){
    const base=`[data-visual-category-id="${parsed.key}"]`;
    if(parsed.part==='box')return `${base} [data-visual-category-part="box"], ${base}:not(:has([data-visual-category-part="box"]))`;
    return `${base} [data-visual-category-part="${parsed.part}"], ${base}[data-visual-category-part="${parsed.part}"]`;
  }
  if(parsed?.kind==='item')return `[data-visual-item-${parsed.part}="${parsed.key}"]`;
  const match=String(id).match(BLOCK_KEY);if(!match)return '';
  const base=`[data-module-id="${match[1]}"], [data-trial-block-id="${match[1]}"]`;
  const suffix={section:'',title:' :is(h1,h2)',copy:' :is(.studio-copy,.original-description,p)',image:' img',button:' :is(a,button)'}[match[2]];
  return base.split(', ').map(selector=>selector+suffix).join(', ');
}
function styleRules(selector,styles){
  const declarations=[],extra=[];
  const cssKey=key=>key.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`);
  for(const [key,value]of Object.entries(styles)){
    if(['iconSize','imageFit','imageRatio'].includes(key)){
      if(key==='iconSize')extra.push(`:is(${selector}) svg,svg:is(${selector}){width:${value}px!important;height:${value}px!important;}`);
      if(key==='imageFit')extra.push(`:is(${selector}) img,img:is(${selector}){object-fit:${value}!important;}`);
      if(key==='imageRatio')declarations.push(`aspect-ratio:${value}!important`);
    } else if(key==='paddingX')declarations.push(`padding-inline:${value}px!important`);
    else if(key==='fontFamily')declarations.push(`font-family:${value==='system'?'system-ui,sans-serif':value==='Georgia'?'Georgia,serif':`${value},sans-serif`}!important`);
    else if(key==='paddingY')declarations.push(`padding-block:${value}px!important`);
    else if(key==='shadow')declarations.push(`box-shadow:${value==='none'?'none':value==='soft'?'0 6px 24px #142a4012':'0 14px 42px #142a4026'}!important`);
    else if(key==='layout')declarations.push(`display:flex!important;flex-direction:${value}!important`);
    else if(key==='justify')declarations.push(`justify-content:${value}!important`);
    else if(key==='widthPx')declarations.push(`width:${value}px!important;max-width:100%!important`);
    else if(STYLE_NUMBERS[key])declarations.push(`${cssKey(key)}:${value}${STYLE_NUMBERS[key][2]}!important`);
    else declarations.push(`${cssKey(key)}:${value}!important`);
  }
  if(styles.borderWidth!==undefined)declarations.push('border-style:solid!important');
  if(styles.height!==undefined&&selector.includes('[data-visual-element="logoImage"]'))declarations.push('max-height:none!important');
  if(styles.borderRadius!==undefined&&(/img|Image|image|box/.test(selector)))declarations.push('overflow:hidden!important');
  if(styles.width!==undefined||styles.maxWidth!==undefined)declarations.push('margin-inline:auto!important');
  return `${selector}{${declarations.join(';')}}${extra.join('')}`;
}
export function visualDesignCSS(design,channel='web'){
  if(!design)return '';
  const global=[];
  for(const [key,id]of [['header','header'],['footer','footer'],['navigation','nav']])if(design[key]===false)global.push(`${visualSelector(id,channel)}{display:none!important}`);
  if(design.navigation===false)global.push('.demo-pocket-dock,.mobile-bottom-nav,.bottom-nav,.bottom-bar{display:none!important}');
  if(design.blank)global.push('main.page-home{min-height:65vh;background:#fff}.page-home>.trust-strip,.page-home>.home-trust{display:none!important}');
  for(const element of design.elements||[]){const selector=visualSelector(element.id,channel);if(!selector)continue;global.push(styleRules(selector,element.desktop||{}));for(const [device,max]of [['tablet',1050],['mobile',620]])global.push(`@media(max-width:${max}px){${styleRules(selector,element[device]||{})}}`);}
  // Layered important declarations outrank the theme's unlayered important
  // declarations, so explicit editor choices remain effective in every preset.
  return global.length ? `@layer novastore-visual-overrides {\n${global.join('\n')}\n}` : '';
}
export function setVisualStyle(design,id,device,key,value){
  const next=normalizeVisualDesign(design);let element=next.elements.find(item=>item.id===id);
  if(!element){element={id,desktop:{},tablet:{},mobile:{}};next.elements.push(element);}
  if(value!==undefined&&value!==''&&key==='width')delete element[device].widthPx;
  if(value!==undefined&&value!==''&&key==='widthPx')delete element[device].width;
  if(value===undefined||value==='')delete element[device][key];else element[device][key]=value;
  return normalizeVisualDesign(next,true);
}
export function setVisualContent(design,id,key,value){
  const next=normalizeVisualDesign(design);let element=next.elements.find(item=>item.id===id);
  if(!element){element={id,desktop:{},tablet:{},mobile:{}};next.elements.push(element);}
  element.content={...(element.content||{})};if(value===undefined||(key==='imageUrl'&&value===''))delete element.content[key];else element.content[key]=value;
  return normalizeVisualDesign(next,true);
}
export function setVisualEnhancement(design,id,key,value){
  if(!['visual','animation','decorations'].includes(key))throw new Error('Desteklenmeyen görsel düzenlemesi.');
  const next=normalizeVisualDesign(design);let element=next.elements.find(item=>item.id===id);
  if(!element){element={id,desktop:{},tablet:{},mobile:{}};next.elements.push(element);}
  if(value===undefined||value===null)delete element[key];else element[key]=value;
  return normalizeVisualDesign(next,true);
}
export function createBlankDocument(document,channel='web'){
  const next=structuredClone(document);
  next.design={...normalizeVisualDesign(),name:'Adsız tasarım',blank:true,header:false,footer:false,navigation:false};
  next.blocks=[];
  next.theme={...next.theme,demoId:'',family:channel==='android'?'pocket':'nova-commerce',background:'#ffffff',surface:'#f5f7fa',text:'#172b42',muted:'#65778d',border:'#e1e7ef',accent:'#305d90',navy:'#172b42',radius:8,fontFamily:'Inter',fontScale:1,headingScale:1,spacing:1,shadow:'soft'};
  next.chrome.header={...next.chrome.header,background:'#ffffff',textColor:'#172b42',showAnnouncement:false};
  next.chrome.footer={...next.chrome.footer,background:'#f5f7fa',textColor:'#172b42'};
  return next;
}
