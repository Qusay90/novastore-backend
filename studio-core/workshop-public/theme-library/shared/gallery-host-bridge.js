/* Scoped persistence for the existing sector-theme workshop. No automatic activation. */
(function(root){
 'use strict';
 const CONTRACT='novastore-gallery-host/1';
 const STYLE_KEYS=new Set(['color','backgroundColor','fontSize','borderRadius','padding','gap','width','maxWidth','minHeight']);
 const copy=value=>structuredClone(value),sameScope=(a,b)=>a?.tenantId===b?.tenantId&&a?.storeId===b?.storeId;
 const fail=(code,message)=>Object.assign(new Error(message),{code});
 function createValidator({themes,baseURL=root.location?.href}={}){
  const allowedThemes=new Set(themes.map(theme=>theme.id)),origin=new URL(baseURL).origin;
  function validateImage(value){
   if(typeof value!=='string'||value.length>2800000)throw fail('SCHEMA','Tema görseli geçersiz veya çok büyük.');
   if(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value))return value;
   let url;try{url=new URL(value,baseURL);}catch{throw fail('SCHEMA','Tema görsel adresi geçersiz.');}
   if(url.origin!==origin||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw fail('SCHEMA','Tema görseli güvenilir aynı kaynak adresi olmalı.');return value;
  }
  function validateLibrary(value){
   if(!value||value.version!==1||!Array.isArray(value.items)||value.items.length>40||Object.keys(value).some(key=>!['version','items'].includes(key)))throw fail('SCHEMA','Tema kütüphanesinin yapısı geçersiz.');
   if(JSON.stringify(value).length>12000000)throw fail('SCHEMA','Tema kütüphanesi 12 MB sınırını aşıyor.');
   const ids=new Set();
   const items=value.items.map(input=>{
    const item=copy(input);
    if(!item||Object.keys(item).some(key=>!['id','theme','name','kind','createdAt','updatedAt','channels','campaigns'].includes(key))||typeof item.id!=='string'||!/^[\w.-]{1,100}$/.test(item.id)||ids.has(item.id)||!allowedThemes.has(item.theme)||typeof item.name!=='string'||item.name.trim().length<2||item.name.length>80||!['working','theme'].includes(item.kind)||!Number.isFinite(Date.parse(item.createdAt))||!Number.isFinite(Date.parse(item.updatedAt))||!item.channels||Object.keys(item.channels).sort().join(',')!=='app,web')throw fail('SCHEMA','Tema kaydı kimliği, adı veya kanalları geçersiz.');
    if(item.campaigns!==undefined){try{if(!root.NovaStoreGalleryCampaigns)throw Error('Ortak kampanya doğrulayıcısı yüklenmedi.');item.campaigns=root.NovaStoreGalleryCampaigns.normalizeChannels(item.campaigns);}catch(error){throw fail('SCHEMA',error.message);}}
    ids.add(item.id);
    for(const channel of ['web','app']){
     const list=item.channels[channel];if(!Array.isArray(list)||list.length>400)throw fail('SCHEMA','Tema öğe listesi geçersiz veya çok büyük.');
     const positions=new Set();
     for(const override of list){
      if(!override||Object.keys(override).some(key=>!['route','selector','styles','text','src','visual','animation','decorations'].includes(key))||typeof override.route!=='string'||!/^#\/[\w/%?=&.+-]{0,198}$/.test(override.route)||typeof override.selector!=='string'||override.selector.length>1800||!(/^(?:#[a-zA-Z_][\w-]*|body(?: > [a-z][a-z0-9-]*:nth-of-type\([1-9][0-9]*\))*)$/.test(override.selector)))throw fail('SCHEMA','Tema öğesinin sayfa veya seçim yolu geçersiz.');
      const position=JSON.stringify([override.route,override.selector]);if(positions.has(position))throw fail('SCHEMA','Aynı tema öğesi birden çok kez kaydedilmiş.');positions.add(position);
      if(override.text!==undefined&&(typeof override.text!=='string'||override.text.length>5000))throw fail('SCHEMA','Tema metni geçersiz veya çok uzun.');
      if(override.src!==undefined)validateImage(override.src);
      for(const [key,normalizer] of Object.entries({visual:'normalizeVisual',animation:'normalizeAnimation',decorations:'normalizeDecorations'}))if(override[key]!==undefined){try{if(!root.NovaStoreVisualAssets)throw Error('Görsel doğrulayıcı yüklenemedi.');override[key]=root.NovaStoreVisualAssets[normalizer](override[key]);}catch{throw fail('SCHEMA','Tema simgesi, görseli veya animasyonu geçersiz.');}}
      if(!override.styles||typeof override.styles!=='object'||Array.isArray(override.styles))throw fail('SCHEMA','Tema stil ayarları geçersiz.');
      for(const [key,value] of Object.entries(override.styles)){
       if(!STYLE_KEYS.has(key)||typeof value!=='string'||value.length>80||!value||/[;{}<>"'\\]|url\s*\(|expression|@/i.test(value))throw fail('SCHEMA','Tema stil ayarı izin verilen kapsam dışında.');
       if(root.CSS?.supports&&!root.CSS.supports(key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),value))throw fail('SCHEMA','Tema stil değeri geçersiz.');
      }
     }
    }
    return copy(item);
   });return{version:1,items};
  }
  return validateLibrary;
 }
 function create(configuration,{themes,baseURL=root.location?.href}={}){
  if(configuration?.contractVersion!==CONTRACT)throw fail('CONFIG','Tema atölyesi admin sözleşmesi uyumsuz.');
  const allowedThemes=new Set(themes.map(theme=>theme.id)),scope=copy(configuration.scope),actor=copy(configuration.actor),capabilities={...configuration.capabilities},ports={...configuration.ports};
  const sourceVersion=configuration.sourceVersion;
  if(!scope||!['tenantId','storeId'].every(key=>typeof scope[key]==='string'&&/^[\w.-]{1,100}$/.test(scope[key]))||!actor?.id||typeof sourceVersion!=='string'||!/^[\w.-]{1,100}$/.test(sourceVersion))throw fail('CONFIG','Atölye mağaza, kullanıcı veya kaynak sürümü eksik.');
  const origin=new URL(baseURL).origin,listeners=new Set(),keys=new Map();
  let library=null,revision=null,generation=0,disposed=false,state={phase:'loading',dirty:false,busy:false,error:'',revision:null};
  const emit=patch=>{if(disposed)return;state={...state,...patch};listeners.forEach(fn=>fn());};
  const requirePort=(permission,port)=>{if(disposed)throw fail('CLOSED','Atölye kapatıldı.');if(capabilities[permission]!==true)throw fail('FORBIDDEN','Bu atölye işlemi için yetkin yok.');if(typeof ports[port]!=='function')throw fail('UNAVAILABLE','Admin atölye bağlantısı yapılandırılmamış.');};
  const request=extra=>({contractVersion:CONTRACT,scope:copy(scope),actor:{id:actor.id},sourceVersion,...extra});
  const response=value=>{if(!sameScope(value?.scope,scope)||value?.sourceVersion!==sourceVersion)throw fail('SCOPE','Atölye yanıtı farklı mağazaya veya kaynak sürümüne ait.');return value;};
  const safeError=error=>({CONFLICT:'Tema kütüphanesi başka bir yönetici tarafından değiştirildi. Çalışman korunuyor; sunucudaki sürümü inceleyerek yeniden aç.',FORBIDDEN:'Bu atölye işlemi için yetkin yok.',UNAVAILABLE:'Admin bağlantısı kullanılamıyor. Tema henüz sunucuya kaydedilmedi.'}[error?.code]||(['CONFIG','SCOPE','SCHEMA','VERSION','URL','DIRTY','STALE'].includes(error?.code)?error.message:'İşlem tamamlanamadı. Tema henüz sunucuya kaydedilmedi.'));
  const operationKey=(operation,stamp)=>{const key=JSON.stringify([operation,revision,stamp]);if(!keys.has(key))keys.set(key,crypto.randomUUID());return keys.get(key);};
  const validateLibrary=createValidator({themes,baseURL});
  function envelope(value){response(value);if(typeof value.revision!=='string'||!value.revision||value.revision.length>200)throw fail('VERSION','Tema kütüphanesi sunucu sürümü eksik.');return{library:validateLibrary(value.library),revision:value.revision};}
  async function initialize(){try{requirePort('read','readLibrary');const next=envelope(await ports.readLibrary(request({})));if(disposed)return;library=next.library;revision=next.revision;emit({phase:'ready',revision,dirty:false,error:''});return read();}catch(error){emit({phase:'error',error:safeError(error)});throw error;}}
  function read(){if(state.phase!=='ready'||!library)throw fail('UNAVAILABLE','Admin tema kütüphanesi yüklenmedi.');return copy(library);}
  function write(value){requirePort('edit','saveLibrary');if(state.phase!=='ready')throw fail('UNAVAILABLE','Admin tema kütüphanesi yüklenmedi.');const next=validateLibrary(value);if(JSON.stringify(next)===JSON.stringify(library))return;library=next;generation++;emit({dirty:true,error:''});}
  async function perform(callback){if(state.busy)throw fail('BUSY','Tema kütüphanesi işlemi devam ediyor.');emit({busy:true,error:''});try{return await callback();}catch(error){emit({error:safeError(error)});throw error;}finally{emit({busy:false});}}
  async function save(){requirePort('edit','saveLibrary');return perform(async()=>{const stamp=generation,beforeRevision=revision;const next=envelope(await ports.saveLibrary(request({expectedRevision:revision,library:read(),idempotencyKey:operationKey('save',stamp)})));if(next.revision===beforeRevision)throw fail('VERSION','Sunucu yeni tema kütüphanesi sürümü üretmedi.');if(disposed)return;if(stamp===generation)library=next.library;revision=next.revision;emit({revision,dirty:stamp!==generation});return revision;});}
  async function preview(item,channel,route='home'){
   requirePort('preview','createPreview');if(!allowedThemes.has(item.theme)||!['web','app'].includes(channel))throw fail('SCHEMA','Önizleme teması veya kanalı geçersiz.');
   const record=validateLibrary({version:1,items:[item]}).items[0],stamp=generation;
   const value=response(await ports.createPreview(request({themeId:item.theme,record,channel,route,revision})));
   if(stamp!==generation)throw fail('STALE','Tema önizleme hazırlanırken değişti. Güncel görünümü yeniden aç.');
   let url;try{url=new URL(value.url,baseURL);}catch{throw fail('URL','Tema önizleme adresi geçersiz.');}
   if(value.themeId!==item.theme||value.channel!==channel||url.origin!==origin||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw fail('URL','Tema önizlemesi bu mağazanın güvenilir aynı kaynak adresinde olmalı.');return url.href;
  }
  async function campaignCatalog(themeId,channel){
   requirePort('catalog','readCampaignCatalog');if(!allowedThemes.has(themeId)||!['web','app'].includes(channel))throw fail('SCHEMA','Kampanya kataloğu tema veya kanalı geçersiz.');
   const stamp=generation;
   const value=response(await ports.readCampaignCatalog(request({themeId,channel,revision})));
   requirePort('catalog','readCampaignCatalog');if(stamp!==generation)throw fail('STALE','Katalog hazırlanırken tema değişti. Kampanya düzenleyicisini yeniden aç.');
   if(value.themeId!==themeId||value.channel!==channel||!Array.isArray(value.products)||value.products.length>1000)throw fail('SCHEMA','Kampanya ürün kataloğu geçersiz.');
   const ids=new Set();return value.products.map(product=>{const id=String(product?.id??'');if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id)||ids.has(id)||typeof product.name!=='string'||!product.name||product.name.length>500)throw fail('SCHEMA','Kampanya ürün kaydı geçersiz.');ids.add(id);return{id,name:product.name};});
  }
  async function requestDraftImport(id){requirePort('import','requestDraftImport');if(state.dirty)throw fail('DIRTY','Taslağa gönderilmeden önce temayı sunucuya kaydet.');return perform(async()=>{const item=read().items.find(item=>item.id===id);if(!item||item.kind!=='theme')throw fail('SCHEMA','Önce yeni bir tema kaydı oluştur.');const value=response(await ports.requestDraftImport(request({expectedRevision:revision,themeDraft:{schemaVersion:1,type:'novastore.theme-draft',libraryId:'nova-store-sector-collection',sourceVersion,baseThemeId:item.theme,editorModel:'channel-route-element-overrides-v1',brand:'Nova Store',locale:'tr-TR',productionReady:false,name:item.name,channels:copy(item.channels),...(item.campaigns?{campaigns:copy(item.campaigns)}:{})},idempotencyKey:operationKey('import',id)})));if(value.status!=='requested'||!value.requestId)throw fail('SCHEMA','Admin tema taslak isteğini doğrulamadı.');return{status:'requested',requestId:value.requestId};});}
  return{initialize,read,write,save,preview,requestDraftImport,campaignCatalog,validateLibrary,can:(permission,port)=>capabilities[permission]===true&&typeof ports[port]==='function',getState:()=>({...state}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},dispose:()=>{disposed=true;listeners.clear();},scope:copy(scope),sourceVersion};
 }
 function mount(container,{galleryURL,configuration}){
  if(!container?.appendChild)throw fail('CONFIG','Atölye kapsayıcısı eksik.');
  const url=new URL(galleryURL,root.location.href);if(url.origin!==root.location.origin||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw fail('URL','Atölye galerisi aynı admin kaynağından gelmeli.');
  const frame=document.createElement('iframe');frame.title='Nova Store sektör tema atölyesi';frame.style.cssText='display:block;border:0;width:100%;height:100%;min-height:800px';
  let disposed=false,settled=false,rejectReady;
  const ready=new Promise((resolve,reject)=>{rejectReady=reject;
   Object.defineProperty(frame,'novaStoreGalleryConfiguration',{configurable:true,value:{...configuration,onReady:value=>{settled=true;resolve(value);},onError:()=>{settled=true;reject(fail('UNAVAILABLE','Admin tema atölyesi açılamadı.'));}}});
   frame.addEventListener('error',()=>{if(!disposed){settled=true;reject(fail('UNAVAILABLE','Atölye kaynak dosyası yüklenemedi.'));}},{once:true});
   frame.src=url.href;container.append(frame);
  });
  return{frame,ready,unmount(){disposed=true;frame.remove();delete frame.novaStoreGalleryConfiguration;if(!settled)rejectReady(fail('CLOSED','Atölye açılmadan kapatıldı.'));}};
 }
 root.NovaStoreGalleryHostBridge=Object.freeze({contractVersion:CONTRACT,create,mount,validateLibrary:(library,options)=>createValidator(options)(library)});
})(globalThis);
