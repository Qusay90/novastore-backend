// Local demo profiles only. Store documents and commerce state are scoped by callers.
export const MERCHANT_REGISTRY_STORAGE_KEY = 'novastore-isolated-merchant-registry:v1';
const REGISTRY_EVENT = 'novastore-merchant-registry-change';
const MAX_CUSTOM_MERCHANTS = 100;

export const MERCHANT_SECTORS = Object.freeze([
  {id:'fashion',name:'Moda & giyim',defaultDesign:'fashion-studio'},
  {id:'living',name:'Mobilya & yaşam',defaultDesign:'living-atelier'},
  {id:'beauty',name:'Bakım & kozmetik',defaultDesign:'ritual-beauty'},
  {id:'sport',name:'Spor & açık hava',defaultDesign:'trail-outdoor'},
  {id:'kids',name:'Çocuk & oyun',defaultDesign:'little-wonder'},
  {id:'tech',name:'Teknoloji',defaultDesign:'nova-commerce'},
  {id:'market',name:'Günlük market',defaultDesign:'daily-market'},
  {id:'workspace',name:'Çalışma alanı',defaultDesign:'stocky-purple'},
  {id:'gallery',name:'Tasarım objeleri',defaultDesign:'editorial-gallery'},
].map(Object.freeze));

const seed = (id,slug,name) => Object.freeze({id,slug,name,catalogFamily:id,defaultDesign:MERCHANT_SECTORS.find(sector=>sector.id===id).defaultDesign});
export const DEFAULT_MERCHANTS = Object.freeze([
  seed('fashion','forma-studio','Forma Studio'),
  seed('living','mora-living','Mora Living'),
  seed('beauty','ritual','Ritual'),
  seed('sport','trail','Trail'),
  seed('kids','little-wonder','Little Wonder'),
  seed('tech','nova-teknoloji','Nova Teknoloji'),
  seed('market','taze','Taze'),
  seed('workspace','desk-room','Desk Room'),
  seed('gallery','obje','Obje'),
]);

export function merchantSlug(value) {
  return String(value ?? '').trim().toLocaleLowerCase('tr').replace(/ı/g,'i')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48).replace(/-+$/g,'');
}

function cleanProfile(input) {
  if(!input || typeof input!=='object' || Array.isArray(input)) return null;
  const {id,slug,name,catalogFamily,defaultDesign}=input;
  const sector=MERCHANT_SECTORS.find(item=>item.id===catalogFamily);
  if(typeof slug!=='string' || slug.length<2 || slug.length>48 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  if(id!==`shop-${slug}` || typeof name!=='string' || name.length<2 || name.length>60 || /[\u0000-\u001f\u007f]/.test(name) || name.trim()!==name) return null;
  if(!sector || defaultDesign!==sector.defaultDesign) return null;
  return Object.freeze({id,slug,name,catalogFamily,defaultDesign});
}

function storage() {
  try { return typeof localStorage==='undefined' ? null : localStorage; }
  catch { return null; }
}

function readCustomProfiles(strict=false) {
  try {
    const persistence=storage();
    if(!persistence) { if(strict) throw new Error('storage'); return []; }
    const raw=persistence.getItem(MERCHANT_REGISTRY_STORAGE_KEY);
    if(!raw) return [];
    const saved=JSON.parse(raw);
    if(saved?.version!==1 || !Array.isArray(saved.merchants) || saved.merchants.length>MAX_CUSTOM_MERCHANTS) throw new Error('registry');
    const occupied=new Set(DEFAULT_MERCHANTS.flatMap(item=>[item.id,item.slug]));
    return saved.merchants.flatMap(value=>{
      const profile=cleanProfile(value);
      if(!profile || occupied.has(profile.id) || occupied.has(profile.slug)) {
        if(strict) throw new Error('profile');
        return [];
      }
      occupied.add(profile.id); occupied.add(profile.slug);
      return [profile];
    });
  } catch {
    if(strict) throw new Error('Kayıtlı mağazalar okunamadı. Tarayıcı depolamasını kontrol edip tekrar dene.');
    return [];
  }
}

export function listMerchants() { return [...DEFAULT_MERCHANTS,...readCustomProfiles()]; }

export function getMerchant(id) {
  if(typeof id!=='string' || !id) return null;
  return listMerchants().find(merchant=>merchant.id===id) || null;
}

function merchantQuery() {
  try {
    const current=typeof location!=='undefined' ? location : typeof window!=='undefined' ? window.location : null;
    const params=new URLSearchParams(current?.search || '');
    const matches=params.getAll('shop');
    return {present:matches.length>0,id:matches.length===1?matches[0]:null};
  } catch { return {present:false,id:null}; }
}

export function getCurrentMerchant() {
  const query=merchantQuery();
  return query.present && query.id ? getMerchant(query.id) : null;
}

export function isUnknownMerchant() {
  const query=merchantQuery();
  return query.present && (!query.id || !getMerchant(query.id));
}

export function createMerchant(input) {
  const name=String(input?.name ?? '').trim().replace(/\s+/g,' ');
  const slug=String(input?.slug ?? '').trim();
  const sector=MERCHANT_SECTORS.find(item=>item.id===input?.catalogFamily);
  if(name.length<2 || name.length>60 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Mağaza adı 2–60 karakter olmalı.');
  if(slug.length<2 || slug.length>48 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Kısa ad 2–48 karakter olmalı; küçük harf, rakam ve arada tire kullan.');
  if(!sector) throw new Error('Mağaza için geçerli bir sektör seç.');
  const custom=readCustomProfiles(true);
  if(custom.length>=MAX_CUSTOM_MERCHANTS) throw new Error('Bu denemede oluşturulabilecek mağaza sayısına ulaşıldı.');
  const id=`shop-${slug}`,occupied=new Set([...DEFAULT_MERCHANTS,...custom].flatMap(merchant=>[merchant.id,merchant.slug]));
  if(occupied.has(slug) || occupied.has(id)) throw new Error('Bu kısa ad kullanılıyor. Mağazana farklı bir kısa ad ver.');
  const profile=Object.freeze({id,slug,name,catalogFamily:sector.id,defaultDesign:sector.defaultDesign});
  try {
    const persistence=storage();
    if(!persistence) throw new Error('storage');
    persistence.setItem(MERCHANT_REGISTRY_STORAGE_KEY,JSON.stringify({version:1,merchants:[...custom,profile]}));
  } catch { throw new Error('Mağaza kaydedilemedi. Tarayıcı depolaması dolu veya kapalı olabilir.'); }
  if(typeof window!=='undefined' && typeof window.dispatchEvent==='function') window.dispatchEvent(new Event(REGISTRY_EVENT));
  return profile;
}

export function subscribeMerchants(listener) {
  if(typeof window==='undefined' || typeof window.addEventListener!=='function') return ()=>{};
  const onStorage=event=>{if(event.key===MERCHANT_REGISTRY_STORAGE_KEY || event.key===null) listener();};
  window.addEventListener('storage',onStorage);
  window.addEventListener(REGISTRY_EVENT,listener);
  return ()=>{window.removeEventListener('storage',onStorage);window.removeEventListener(REGISTRY_EVENT,listener);};
}

export function withMerchantScope(href,id=getCurrentMerchant()?.id) {
  const value=String(href ?? '');
  if(!id) return value;
  const merchant=getMerchant(id);
  if(!merchant) throw new Error('Bu mağaza bulunamadı.');
  const current=typeof location!=='undefined' ? location : typeof window!=='undefined' ? window.location : null;
  const base=current?.href || 'http://localhost/';
  const url=new URL(value,base),origin=new URL(base).origin;
  if(!['http:','https:'].includes(url.protocol) || url.origin!==origin) return value;
  url.searchParams.set('shop',merchant.id);
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//') ? url.href : `${url.pathname}${url.search}${url.hash}`;
}
