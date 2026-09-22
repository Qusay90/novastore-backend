import {normalizeWithDefaults} from '../sandbox/documentModel.js';
import {documentCapabilities,writable} from './document-capabilities.js';
import {nativeDocumentValidator} from './native-document-validation.js';
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
function normalizeDocument(document,channel){
 // Host ports cross an iframe realm. Clone at this trusted transport boundary;
 // the shared validator retains strict plain-object/prototype rejection.
 document=structuredClone(document);
 if(!document||['blocks','theme','menus','pages','app','chrome','commerce','templates','savedSections','design'].some(k=>!Object.hasOwn(document,k)))throw failure('DOCUMENT','Sunucu tam Studio belgesi döndürmeli.');
 nativeDocumentValidator.validateStudio(document,false);
 const normalized=normalizeWithDefaults(document,channel,document,true);
 if(canonical(normalized)!==canonical(document))throw failure('DOCUMENT','Eksik veya geçersiz Studio belgesi.');
 return clone(normalized);
}
const clone = value => structuredClone(value);
const channelNames = ['web','android'];
const scopeEquals = (a,b) => a?.tenantId === b?.tenantId && a?.storeId === b?.storeId;
const failure = (code,message) => Object.assign(new Error(message),{code});
const messages = {CONFLICT:'Taslak başka bir yönetici tarafından değiştirildi. Düzenlemelerin korunuyor; sunucudaki sürümü inceleyip yeniden aç.',FORBIDDEN:'Bu işlem için yetkin yok.',THEME_POLICY_REVISION_CONFLICT:'Düzenleme yetkilerin değişti. Kaydetmeden önce güncel izinleri yenile; bu değişiklik sunucuya kaydedilmedi.',UNAVAILABLE:'Stüdyo bağlantısı kullanılamıyor. Düzenlemeler henüz sunucuya kaydedilmedi.'};

// Synchronous editor cache; only explicit async host ports persist it.
// No browser storage, endpoint guesses, credential handling or sample fallback.
export function createStudioSession(config) {
  const {scope,actor,ports={}} = config;
  let capabilities=config.capabilities||{}, policy=config.policy||{};
  const channelNames=config.availableChannels||['web','android'];
  const guardEdit=(previous,next)=>{for(const code of documentCapabilities(previous,next)){if(!writable(policy[code]?.state))throw failure('FORBIDDEN',messages.FORBIDDEN);}};
  if (!scope?.tenantId || !scope?.storeId || !actor?.id) throw failure('CONFIG','Admin kapsamı eksik.');
  const listeners = new Set(), history = {}, generation = {}, catalogs = {}, operationKeys = new Map(), workingRequests = {};
  let state = {schemaVersion:4,channels:{},host:{phase:'loading',error:'',saved:{},dirty:{},pending:{},preview:{}}};
  let disposed = false;
  const emit = () => { if(!disposed) listeners.forEach(fn=>fn()); };
  const setHost = patch => { state = {...state,host:{...state.host,...patch}};emit(); };
  const assertChannel = channel => { if(!channelNames.includes(channel)) throw failure('CHANNEL','Geçersiz yayın kanalı.'); };
  const assertAccess = (capability,port) => {
    if(disposed) throw failure('CLOSED','Stüdyo bağlantısı kapatıldı.');
    if(capabilities[capability] !== true) throw failure('FORBIDDEN',messages.FORBIDDEN);
    if(port && typeof ports[port] !== 'function') throw failure('UNAVAILABLE',messages.UNAVAILABLE);
  };
  const request = (channel,extra={}) => ({contractVersion:'novastore-studio-host/1',scope:clone(scope),actor:{id:actor.id},channel,...extra});
  const operationKey = (channel,operation,revision,stamp='') => {const key=JSON.stringify([channel,operation,revision,stamp]);if(!operationKeys.has(key))operationKeys.set(key,crypto.randomUUID());return operationKeys.get(key);};
  const checkScope = (value,channel) => { if(!scopeEquals(value?.scope,scope) || value?.channel !== channel) throw failure('SCOPE','Sunucu yanıtı başka bir mağazaya veya kanala ait. İşlem reddedildi.');return value; };
  const checkEnvelope = (value,channel) => {
    checkScope(value,channel);
    if(typeof value.revision !== 'string' || !value.revision || value.revision.length > 200) throw failure('VERSION','Sunucu taslak sürümü eksik.');
    if(![value.draft,value.published].every(doc=>doc&&Array.isArray(doc.blocks)&&Array.isArray(doc.pages)&&doc.theme&&doc.chrome&&doc.templates&&Array.isArray(doc.menus))) throw failure('DOCUMENT','Sunucu tam Studio tasarım belgesi döndürmeli.');
    return {draft:normalizeDocument(value.draft,channel),published:normalizeDocument(value.published,channel),revision:value.revision,history:[]};
  };
  const sanitizeError = error => (error?.status===403 ? 'Bu işlem için güncel yetkin yok. Değişiklikler sunucuya kaydedilmedi; izinleri yenile.' : messages[error?.code]) || (['SCOPE','VERSION','DOCUMENT','CHANNEL','CONFIG','NOT_READY','DIRTY','URL','STALE'].includes(error?.code) ? error.message : messages.UNAVAILABLE);
  async function initialize() {
    assertAccess('read','readDraft');
    const entries = await Promise.all(channelNames.map(async channel=>{
      const entry = checkEnvelope(await ports.readDraft(request(channel)),channel);
      if(typeof ports.readCatalog === 'function') {
        const catalog = checkScope(await ports.readCatalog(request(channel)),channel);
        if(!Array.isArray(catalog.products) || !Array.isArray(catalog.categories)) throw failure('DOCUMENT','Ürün seçim kaynağı geçersiz.');
        catalogs[channel] = clone({products:catalog.products,categories:catalog.categories,collections:catalog.collections||[]});
      } else catalogs[channel] = {products:[],categories:[]};
      history[channel] = {past:[],future:[]};generation[channel]=0;
      return [channel,entry];
    }));
    if(disposed) return;
    state={schemaVersion:4,channels:Object.fromEntries(entries),host:{phase:'ready',error:'',saved:{web:true,android:true},dirty:{web:false,android:false},pending:{},preview:{},workingSequence:config.workingSequence??-1,workingPageKey:config.pageKey||'home'}};emit();return state;
  }
  function edit(channel,document) {
    assertChannel(channel);assertAccess('edit','saveDraft');
    if(state.host.phase !== 'ready') throw failure('UNAVAILABLE',messages.UNAVAILABLE);
    const next=normalizeDocument(document,channel), previous=state.channels[channel].draft;
    if(JSON.stringify(previous)===JSON.stringify(next))return;
    guardEdit(previous,next);
    history[channel].past.push(clone(previous));history[channel].past=history[channel].past.slice(-40);history[channel].future=[];
    generation[channel]+=1;
    state={...state,channels:{...state.channels,[channel]:{...state.channels[channel],draft:next}},host:{...state.host,error:'',dirty:{...state.host.dirty,[channel]:true},saved:{...state.host.saved,[channel]:false},preview:{...state.host.preview,[channel]:null}}};emit();
  }
  function navigateHistory(channel,direction) {
    assertChannel(channel);assertAccess('edit','saveDraft');
    const source=history[channel]?.[direction==='undo'?'past':'future'];if(!source?.length)return false;
    const destination=history[channel][direction==='undo'?'future':'past'];destination.push(clone(state.channels[channel].draft));
    const next=source[source.length-1];guardEdit(state.channels[channel].draft,next);source.pop();generation[channel]+=1;
    state={...state,channels:{...state.channels,[channel]:{...state.channels[channel],draft:next}},host:{...state.host,error:'',dirty:{...state.host.dirty,[channel]:true},saved:{...state.host.saved,[channel]:false},preview:{...state.host.preview,[channel]:null}}};emit();return true;
  }
  async function perform(channel,name,callback) {
    assertChannel(channel);
    if(state.host.pending[channel]) throw failure('BUSY','Bu kanalın işlemi devam ediyor.');
    setHost({error:'',pending:{...state.host.pending,[channel]:name}});
    try{return await callback();}catch(error){if(!disposed)setHost({error:sanitizeError(error)});throw error;}finally{if(!disposed)setHost({pending:{...state.host.pending,[channel]:null}});}
  }
  async function save(channel) {
    assertAccess('edit','saveDraft');
    return perform(channel,'save',async()=>{
      const before=state.channels[channel], stamp=generation[channel], idempotencyKey=operationKey(channel,'save',before.revision,stamp);
      const value=await ports.saveDraft(request(channel,{expectedRevision:before.revision,document:clone(before.draft),idempotencyKey}));
      const result=checkEnvelope(value,channel);
      if(result.revision===before.revision) throw failure('VERSION','Sunucu yeni taslak sürümü üretmedi.');
      if(disposed)return;
      const unchanged=generation[channel]===stamp;
      state={...state,channels:{...state.channels,[channel]:{...result,draft:unchanged?result.draft:state.channels[channel].draft}},host:{...state.host,saved:{...state.host.saved,[channel]:unchanged},dirty:{...state.host.dirty,[channel]:!unchanged},preview:{...state.host.preview,[channel]:null}}};emit();return result.revision;
    });
  }
  async function preview(channel,options={}) {
    assertAccess('preview','createPreview');
    if(state.host.dirty[channel])throw failure('DIRTY','Önizleme için önce taslağı sunucuya kaydet.');
    let previewAt;
    if(options.previewAt!==undefined){
      assertAccess('scheduledPreview');
      if(typeof options.previewAt!=='string'||!Number.isFinite(Date.parse(options.previewAt)))throw failure('DATE','Önizleme tarihi geçersiz.');
      previewAt=new Date(options.previewAt).toISOString();
    }
    return perform(channel,'preview',async()=>{
      const stamp=generation[channel];
      const value=checkScope(await ports.createPreview(request(channel,{revision:state.channels[channel].revision,document:clone(state.channels[channel][options.published===true?'published':'draft']),pageKey:options.pageKey||'home',published:options.published===true,...(previewAt?{previewAt}:{})})),channel);
      if(previewAt&&value.previewAt!==previewAt)throw failure('DATE','Sunucu seçilen önizleme anını doğrulamadı.');
      if(!options.published&&generation[channel]!==stamp)throw failure('STALE','Tasarım önizleme hazırlanırken değişti. Güncel taslak için tekrar önizleme hazırla.');
      let url;try{url=new URL(value.url,config.baseURL);}catch{throw failure('URL','Önizleme adresi geçersiz.');}
      const allowed=new URL(config.baseURL).origin;
      if(url.origin!==allowed || !['http:','https:'].includes(url.protocol) || url.username || url.password) throw failure('URL','Önizleme aynı admin alanında ve güvenli bir adreste olmalı.');
      if(disposed)return;
      const result={url:url.href,revision:state.channels[channel].revision,pageKey:options.pageKey||'home',published:options.published===true,...(previewAt?{previewAt}:{})};
      setHost({preview:{...state.host.preview,[channel]:result}});return result.url;
    });
  }
  async function workingPreview(channel,{pageKey='home'}={}) {
    assertChannel(channel);assertAccess('read');assertAccess('preview','createWorkingPreview');
    const sequence=(workingRequests[channel]||0)+1;workingRequests[channel]=sequence;
    const document=normalizeDocument(state.channels[channel].draft,channel),stamp=generation[channel];
    const value=checkScope(await ports.createWorkingPreview(request(channel,{revision:state.channels[channel].revision,document,pageKey,sequence})),channel);
    assertAccess('read');assertAccess('preview');
    if(sequence!==workingRequests[channel]||stamp!==generation[channel])throw failure('STALE','Daha yeni bir çalışma taslağı var.');
    const url=new URL(value.url,config.baseURL);
    if(url.origin!==new URL(config.baseURL).origin||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw failure('URL','Çalışma önizlemesi aynı alanda olmalı.');
    const item={url:url.href,pageKey,sequence,revision:state.channels[channel].revision,working:true};
    setHost({workingPreview:{...state.host.workingPreview,[channel]:item}});return item;
  }
  function replaceWorkingPreview(value) {
    if(disposed||config.renderOnly!==true||config.readOnly!==true||config.workingPreview!==true)throw failure('FORBIDDEN','Yalnız çalışma önizlemesi güncellenebilir.');
    assertAccess('read');assertChannel(value?.channel);checkScope(value,value.channel);
    if(!Number.isSafeInteger(value.sequence)||value.sequence<0||value.sequence<=(state.host.workingSequence??-1))throw failure('STALE','Eski çalışma önizlemesi reddedildi.');
    const document=normalizeDocument(value.document,value.channel);
    const validPage=value.pageKey==='home'||(value.pageKey?.startsWith('template:')&&Object.hasOwn(document.templates,value.pageKey.slice(9)))||(value.pageKey?.startsWith('page:')&&document.pages.some(page=>page.id===value.pageKey.slice(5)));
    if(!validPage)throw failure('DOCUMENT','Çalışma önizlemesi sayfası bulunamadı.');
    state={...state,channels:{...state.channels,[value.channel]:{...state.channels[value.channel],draft:document,published:clone(document)}},host:{...state.host,workingSequence:value.sequence,workingPageKey:value.pageKey}};emit();return true;
  }
  async function inspectReadiness(channel){
    assertAccess('read','readReadiness');
    return perform(channel,'readiness',async()=>{
      const revision=state.channels[channel].revision,stamp=generation[channel];
      const value=checkScope(await ports.readReadiness(request(channel,{revision})),channel);
      if(generation[channel]!==stamp||state.channels[channel].revision!==revision)throw failure('STALE','Kontrol sırasında tasarım değişti. Güncel sürümü yeniden kontrol et.');
      if(value.revision!==revision||typeof value.ready!=='boolean')throw failure('VERSION','Sunucu güncel sürüm için bir sonuç döndürmedi.');
      const commerceReady=value.commerce?.contractVersion==='novastore-theme-host/1'&&value.commerce?.ready===true&&scopeEquals(value.commerce?.scope,scope);
      return {scope:clone(scope),channel,revision,checkedAt:new Date().toISOString(),ready:value.ready===true&&commerceReady&&!state.host.dirty[channel],commerceReady,unsaved:state.host.dirty[channel]===true};
    });
  }
  async function requestPublication(channel,note='') {
    assertAccess('publish','requestPublication');assertAccess('publish','readReadiness');
    if(state.host.dirty[channel]) throw failure('DIRTY','Yayın isteğinden önce taslağı sunucuya kaydet.');
    return perform(channel,'publication',async()=>{
      const revision=state.channels[channel].revision,stamp=generation[channel];
      const readiness=checkScope(await ports.readReadiness(request(channel,{revision})),channel);
      assertAccess('publish','requestPublication');
      if(state.host.dirty[channel]||generation[channel]!==stamp||state.channels[channel].revision!==revision)throw failure('DIRTY','Tasarım yayın kontrolü sırasında değişti. Güncel taslağı kaydedip yeniden incele.');
      if(readiness.revision!==revision || readiness.ready!==true || readiness.commerce?.contractVersion!=='novastore-theme-host/1' || readiness.commerce.ready!==true || !scopeEquals(readiness.commerce.scope,scope)) throw failure('NOT_READY','Bu mağazanın tema ve ticaret bağlantıları yayın için doğrulanmamış.');
      const response=checkScope(await ports.requestPublication(request(channel,{expectedRevision:revision,note:String(note).slice(0,300),idempotencyKey:operationKey(channel,'publication',revision)})),channel);
      if(response.status!=='requested' || typeof response.requestId!=='string' || !response.requestId) throw failure('DOCUMENT','Admin yayın isteğini doğrulamadı.');
      return {status:'requested',requestId:response.requestId};
    });
  }
  return {updateCapabilities(next,decisions){capabilities=next;policy=decisions;setHost({policyRevision:Date.now()});},initialize,save,preview,workingPreview,replaceWorkingPreview,inspectReadiness,requestPublication,edit,undo:channel=>navigateHistory(channel,'undo'),redo:channel=>navigateHistory(channel,'redo'),getState:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getDocument:(channel='web',draft=false)=>{assertChannel(channel);return clone(state.channels[channel][draft?'draft':'published']);},getHistory:channel=>({canUndo:!!history[channel]?.past.length,canRedo:!!history[channel]?.future.length}),getCatalog:channel=>clone(catalogs[channel]||{products:[],categories:[]}),dispose:()=>{disposed=true;listeners.clear();},get config(){return config;}};
}
