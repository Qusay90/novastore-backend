import {nativeCatalog} from './catalog-adapter.js';
import {assetCacheKey} from './asset-cache.js';
import {nativeDocumentValidator} from './native-document-validation.js';
import {previewPageBlocks} from './preview-navigation.js';
// Thin authenticated transport shared by Admin and Seller shells. No role is inferred here.
const clone = value => structuredClone(value);
const nativeChannel = value => value === 'app' ? 'android' : 'web';
const serverChannel = value => value === 'android' || value === 'app' ? 'app' : 'web';
const writable = value => ['EDITABLE', 'MANAGE', 'PUBLISH'].includes(value);
export function createPlatformClient({kind, token, onUnauthorized = () => {}}) {
  if (!['admin','seller'].includes(kind)) throw Error('Geçersiz oturum türü.');
  const prefix = `/api/${kind==='admin'?'admin':'seller/v1'}/theme-platform`;
  const pending = new Map();
  async function request(path, options={}) {
    if (!/^\/[a-z0-9/%.:_-]*$/i.test(path) || path.includes('..') || path.includes('//') || /%2e|%5c/i.test(path)) throw Error('Geçersiz API yolu.');
    const requestToken=token();
    const headers = {'Authorization':`Bearer ${requestToken}`, ...(options.body?{'Content-Type':'application/json'}:{})};
    const method=options.method||'GET', body=options.body&&JSON.stringify(options.body);
    const identity=JSON.stringify([method,path,body]);
    if(method!=='GET') { if(!pending.has(identity))pending.set(identity,crypto.randomUUID());headers['Idempotency-Key']=options.key||pending.get(identity);if(options.body?.expectedRevision!==undefined)headers['If-Match']=`"${options.body.expectedRevision}"`; }
    const response=await fetch(prefix+path,{method,headers,body,credentials:'same-origin',cache:'no-store',signal:options.signal});
    if(!response.ok){if(response.status===401)onUnauthorized(requestToken);const detail=await response.json().catch(()=>({}));throw Object.assign(new Error(detail.code||'THEME_CONNECTION_FAILED'),{code:detail.code,status:response.status});}
    const result=options.blob?await response.blob():await response.json();
    if(method!=='GET')pending.delete(identity);
    return result;
  }
  return {kind,prefix,request,get:(path,options={})=>request(path,options),write:(path,body,method='POST',key)=>request(path,{method,body,key}),blob:(path,options={})=>request(path,{...options,blob:true})};
}
export const capabilityFlags = context => ({read:true,edit:!context.readOnly&&writable(context.capabilities?.['theme.save_draft']?.state),preview:context.readOnly?!!context.capabilities?.['theme.preview']&&context.capabilities['theme.preview'].state!=='HIDDEN':writable(context.capabilities?.['theme.preview']?.state),publish:!context.readOnly&&context.capabilities?.['theme.publish']?.state==='PUBLISH',scheduledPreview:false});
// Explicit channel policy wins, even when empty after revocation. Legacy hosts
// may supply only the conservative top-level intersection.
export function channelCapabilities(value,channel){
 const entry=value.channels?.[serverChannel(channel)];
 return entry?.effectivePolicy?entry.effectivePolicy.capabilities||{}:entry&&Object.hasOwn(entry,'capabilities')?entry.capabilities||{}:value.capabilities||{};
}
export function channelPolicyConfig(value){return Object.fromEntries(value.availableChannels.map(channel=>{const policy=channelCapabilities(value,channel);return [nativeChannel(channel),{policy,capabilities:capabilityFlags({...value,capabilities:policy})}];}));}
export function documentOverrides(base, document) {
  const diff=(a,b)=>{if(JSON.stringify(a)===JSON.stringify(b))return undefined;if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const out={};for(const key of Object.keys(b)){const value=diff(a[key],b[key]);if(value!==undefined)out[key]=value;}return out;}return clone(b);};
  return {studio:diff(base.studio,document)||{}};
}
export const contextIdentity = value => JSON.stringify([value.scope?.tenantId,value.scope?.storeId,value.actor?.id,value.serviceId,value.mode,!!value.readOnly,[...(value.availableChannels||[])].sort().map(channel=>[channel,value.channels?.[channel]?.assignmentId,value.channels?.[channel]?.draftId,value.channels?.[channel]?.themeVersionId,value.channels?.[channel]?.presentation?.id,value.channels?.[channel]?.presentation?.version,value.channels?.[channel]?.presentation?.digest])]);
// Presentation identity is immutable server package metadata, never a draft field.
export const presentationConfig = value => ({
  presentation:clone(value.channels[value.availableChannels[0]]?.presentation||null),
  presentations:Object.fromEntries(value.availableChannels.map(channel=>[nativeChannel(channel),clone(value.channels[channel]?.presentation||null)])),
});
export async function mountPlatformStudio(container, {client,context,contextPath,renderOnly=false,pageKey='home',externalShell=false,initialSection='editor',onError=()=>{},onContextUpdated=()=>{},signal}) {
  if (!context.scope?.tenantId || !context.scope?.storeId || !context.actor?.id || !Array.isArray(context.availableChannels)) throw Error('Sunucu Studio kapsamını doğrulamadı.');
  if (!context.availableChannels.length) {container.textContent='Bu mağazada atanmış bir Studio taslağı yok.';return {unmount(){container.replaceChildren();}};}
  for(const channel of context.availableChannels) if(context.channels[channel]?.document?.schemaVersion!==2) throw Error('Bu paket native Studio v4 düzenleyicisini desteklemiyor.');
  let current=clone(context),closed=false,invalid=false,frame,refreshing=false,timer=null,rejectMount;
  const identity=contextIdentity(context),controller=new AbortController();
  const assetURLs={},blobURLs=new Set(),snapshots=new Map(),workingKeys=new Map(),workingFrames=new Map(),workingSequences=new Map();
  const assertOpen=()=>{if(closed||invalid)throw Error('Studio bağlantısı kapandı. Çalışma alanını yeniden açın.');};
  function invalidate(error){invalid=true;clearInterval(timer);frame?.contentWindow?.NovaStoreStudio?.updatePolicy({read:false,edit:false,preview:false,publish:false},{},{},{});onError(error);}
  const verifyContext=fresh=>{assertOpen();if(contextIdentity(fresh)!==identity){const error=Error('Mağaza, atama veya oturum kapsamı değişti. Çalışma alanını yeniden açın.');invalidate(error);throw error;}};
  const resource=(channel)=>{assertOpen();const entry=current.channels[serverChannel(channel)];if(!entry)throw Error('Atama bulunamadı.');return entry;};
  function dispose(){if(closed)return;closed=true;controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);signal?.removeEventListener('abort',dispose);rejectMount?.(new Error('Studio açılışı iptal edildi.'));try{frame?.contentWindow?.NovaStoreStudio?.unmount();}finally{frame?.remove();blobURLs.forEach(url=>URL.revokeObjectURL(url));blobURLs.clear();snapshots.clear();workingFrames.clear();workingKeys.clear();}}
  signal?.addEventListener('abort',dispose,{once:true});
  if(signal?.aborted){dispose();throw Error('Studio açılışı iptal edildi.');}
  const envelope=(channel)=>({scope:clone(current.scope),channel,revision:String(resource(channel).revision),draft:clone(resource(channel).document.studio),published:clone(resource(channel).document.studio)});
  async function loadAssets(document,entry){
    assertOpen();
    const refs=new Set();const walk=value=>{if(typeof value==='string'&&/^(package:|asset:)/.test(value))refs.add(value);else if(value&&typeof value==='object')Object.values(value).forEach(walk);};walk(document);
    await Promise.all([...refs].map(async ref=>{const key=assetCacheKey(ref,entry.themeVersionId);if(assetURLs[key])return;assertOpen();const path=ref.startsWith('asset:')?`/assets/${ref.slice(6)}/content`:`${client.kind==='seller'?`/services/${current.serviceId}`:''}/versions/${entry.themeVersionId}/assets/${encodeURIComponent(ref.slice(8))}`;const blob=await client.blob(path,{signal:controller.signal});assertOpen();if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size>6000000)throw Error('Görsel yanıtı geçersiz.');const url=URL.createObjectURL(blob);blobURLs.add(url);assetURLs[key]=url;}));
  }
  const commercePath=channel=>{const entry=resource(channel);return contextPath?.startsWith('/offers/')?contextPath.replace('/seller-preview','')+'/commerce': '/services/'+current.serviceId+'/assignments/'+entry.assignmentId+'/commerce';};
  const ports={
    loadProduct:({channel,productId})=>client.get(commercePath(channel)+'/products/'+Number(productId)),
    quote:({channel,body})=>client.write(commercePath(channel)+'/quote',body),
    readDraft:async({channel})=>envelope(channel),
    readCatalog:async({channel})=>({scope:clone(current.scope),channel,...nativeCatalog(resource(channel).catalog)}),
    saveDraft:async({channel,expectedRevision,document,idempotencyKey})=>{
      if(current.readOnly)throw Error('Salt okunur taşıma.');
      const entry=resource(channel);
      await client.write(`/drafts/${entry.draftId}`,{expectedRevision:Number(expectedRevision),policyRevision:current.policyRevision,overrides:documentOverrides(entry.base,document),reason:'Studio taslağı kaydedildi'},'PUT',idempotencyKey);
      const next=await client.get(contextPath);verifyContext(next);await loadAssets(next.channels[serverChannel(channel)].document,next.channels[serverChannel(channel)]);current=next;
      assertOpen();onContextUpdated(clone(current),{reason:'saved'});
      return envelope(channel);
    },
    createPreview:async({channel,revision,pageKey,published})=>{
      if(published)throw Object.assign(Error('Yayımlanan görünüm bu çalışma alanında sunulmuyor.'),{code:'NOT_READY'});
      const entry=resource(channel);let document=entry.document;
      if(!current.readOnly){const response=await client.write(`/drafts/${entry.draftId}/previews`,{expectedRevision:Number(revision),policyRevision:current.policyRevision,reason:'Studio önizlemesi'});const snapshot=await client.get(`/previews/${response.result.id}`);document=snapshot.artifact.document;}
      await loadAssets(document,entry);const key=crypto.randomUUID();snapshots.set(key,{channel,pageKey,document});
      return {scope:clone(current.scope),channel,url:`${location.origin}/theme-studio/preview.html#${key}`};
    },
    createWorkingPreview:async({scope,channel,revision,pageKey,document,sequence})=>{
      if(scope?.tenantId!==current.scope.tenantId||scope?.storeId!==current.scope.storeId)throw Error('Çalışma önizlemesi kapsamı değişti.');
      if(!capabilityFlags({...current,capabilities:channelCapabilities(current,channel)}).preview)throw Object.assign(Error('Önizleme yetkisi yok.'),{code:'FORBIDDEN'});
      document=clone(document);
      nativeDocumentValidator.validateStudio(document,false);if(!previewPageBlocks(document,pageKey)||!Number.isSafeInteger(sequence)||sequence<1)throw Error('Çalışma önizlemesi belgesi geçersiz.');
      const entry=resource(channel);workingSequences.set(channel,sequence);
      await loadAssets(document,entry);assertOpen();
      if(workingSequences.get(channel)!==sequence)throw Object.assign(Error('Daha yeni bir çalışma önizlemesi var.'),{code:'STALE'});
      const key=workingKeys.get(channel)||crypto.randomUUID();workingKeys.set(channel,key);
      const snapshot={channel,revision,pageKey,document:{schemaVersion:2,studio:clone(document)},sequence,working:true};snapshots.set(key,snapshot);
      const target=workingFrames.get(key);
      if(target?.isConnected&&target.contentWindow?.NovaStoreStudio){const policy=channelCapabilities(current,channel);target.contentWindow.NovaStoreStudio.updatePolicy(capabilityFlags({...current,readOnly:true,capabilities:policy}),policy,assetURLs,channelPolicyConfig({...current,readOnly:true}));target.contentWindow.NovaStoreStudio.updateWorkingPreview({scope:clone(current.scope),channel,document:snapshot.document.studio,pageKey,sequence});}
      return {scope:clone(current.scope),channel,url:`${location.origin}/theme-studio/preview.html#${key}`};
    },
    mountPreviewFrame:async(target,url)=>{
      const key=new URL(url).hash.slice(1),snapshot=snapshots.get(key);if(!snapshot)throw Error('Önizleme bulunamadı.');
      assertOpen();const entry=resource(snapshot.channel),channel=serverChannel(snapshot.channel);
      const previewContext={...clone(current),readOnly:true,availableChannels:[channel],channels:{[channel]:{...clone(entry),document:snapshot.document}}};
      await target.contentWindow.NovaStoreStudio.mount({...config(previewContext),renderOnly:true,pageKey:snapshot.pageKey,workingPreview:snapshot.working===true,workingSequence:snapshot.sequence});assertOpen();
      if(target.isConnected===false)return;
      if(snapshot.working){workingFrames.set(key,target);const latest=snapshots.get(key);if(latest.sequence>snapshot.sequence)target.contentWindow.NovaStoreStudio.updateWorkingPreview({scope:clone(current.scope),channel:snapshot.channel,document:latest.document.studio,pageKey:latest.pageKey,sequence:latest.sequence});}
    },
    uploadAsset:async(bytesBase64)=>{
      if(current.readOnly)throw Error('Salt okunur taşıma.');
      const response=await client.write(`/services/${current.serviceId}/stored-assets`,{bytesBase64,reason:'Studio görsel yükleme'}),ref=`asset:${response.result.id}`;
      await loadAssets({image:ref},current.channels[current.availableChannels[0]]);frame?.contentWindow.NovaStoreStudio.updatePolicy(capabilityFlags(current),current.capabilities,assetURLs,channelPolicyConfig(current));return ref;
    },
    readReadiness:async({channel,revision})=>{
      const fresh=await client.get(contextPath);verifyContext(fresh);const entry=fresh.channels[serverChannel(channel)];
      const ready=entry?.status==='ACCEPTED'&&Number(revision)===entry.revision&&channelCapabilities(fresh,channel)['theme.publish']?.state==='PUBLISH'&&(entry.effectivePolicy?.presentationReadiness||entry.presentationReadiness)?.assignmentEligible===true;
      return {scope:clone(fresh.scope),channel,revision,ready,commerce:{contractVersion:'novastore-theme-host/1',scope:clone(fresh.scope),ready}};
    },
    requestPublication:async({channel,expectedRevision,note,idempotencyKey})=>{
      if(current.readOnly)throw Error('Salt okunur taşıma.');
      const result=await client.write(`/drafts/${resource(channel).draftId}/publications`,{expectedRevision:Number(expectedRevision),policyRevision:current.policyRevision,reason:note||'Studio yayın isteği'},'POST',idempotencyKey);
      return {scope:clone(current.scope),channel,status:'requested',requestId:result.result.id};
    }
  };
  const guardedPorts=Object.fromEntries(Object.entries(ports).map(([name,port])=>[name,async(...args)=>{assertOpen();try{const result=await port(...args);assertOpen();return result;}catch(error){if(!closed&&!invalid&&['saveDraft','uploadAsset','requestPublication'].includes(name))onError(error);throw error;}}]));
  function config(value){const deny=async()=>{throw Object.assign(Error('Önizleme sunucuda değişiklik yapamaz.'),{code:'FORBIDDEN'});};const readonlyPorts=value.readOnly?{...guardedPorts,saveDraft:deny,uploadAsset:deny,requestPublication:deny,readDraft:async({channel})=>{assertOpen();const entry=value.channels[serverChannel(channel)];return {scope:clone(value.scope),channel,revision:String(entry.revision),draft:clone(entry.document.studio),published:clone(entry.document.studio)};},readCatalog:async({channel})=>{assertOpen();return {scope:clone(value.scope),channel,...nativeCatalog(value.channels[serverChannel(channel)].catalog)};}}:guardedPorts;return {...value,...presentationConfig(value),availableChannels:value.availableChannels.map(nativeChannel),activeChannel:nativeChannel(value.availableChannels[0]),themeVersions:Object.fromEntries(value.availableChannels.map(channel=>[nativeChannel(channel),value.channels[channel].themeVersionId])),capabilities:capabilityFlags({...value,capabilities:channelCapabilities(value,value.availableChannels[0])}),policy:channelCapabilities(value,value.availableChannels[0]),channelPolicies:channelPolicyConfig(value),commerce:value.channels[value.availableChannels[0]].commerce,assetURLs,ports:readonlyPorts,renderOnly,pageKey,externalShell,initialSection};}
  async function refresh(){if(closed||invalid||refreshing||!contextPath)return;refreshing=true;try{const fresh=await client.get(contextPath,{signal:controller.signal});verifyContext(fresh);current={...current,capabilities:fresh.capabilities,policyRevision:fresh.policyRevision,profile:fresh.profile,channels:Object.fromEntries(current.availableChannels.map(channel=>[channel,{...current.channels[channel],effectivePolicy:{capabilities:channelCapabilities(fresh,channel)}}]))};frame.contentWindow.NovaStoreStudio.updatePolicy(capabilityFlags(current),current.capabilities,assetURLs,channelPolicyConfig(current));assertOpen();onContextUpdated(clone(current),{reason:'policy-refreshed'});}catch(error){if(!closed&&!invalid)invalidate(error);}finally{refreshing=false;}}
  try{
    for(const channel of current.availableChannels)await loadAssets(current.channels[channel].document,current.channels[channel]);
    assertOpen();frame=document.createElement('iframe');frame.title=current.mode==='admin'?'Admin Studio':'Seller Studio';frame.src='/theme-studio/studio-module.html';frame.className='theme-studio-frame';
    await new Promise((resolve,reject)=>{rejectMount=reject;frame.onload=async()=>{try{assertOpen();await frame.contentWindow.NovaStoreStudio.mount(config(current));assertOpen();resolve();}catch(error){reject(error);}};frame.onerror=()=>reject(Error('Studio modülü yüklenemedi.'));container.replaceChildren(frame);});
    rejectMount=null;assertOpen();timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);
    return {frame,refresh,navigate:section=>{assertOpen();frame.contentWindow.NovaStoreStudio.navigate(section);},unmount:dispose};
  }catch(error){dispose();throw error;}
}
