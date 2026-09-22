import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createStudioSession} from '../src/studio-integration/session.js';
import {capabilityFlags,documentOverrides,createPlatformClient} from '../src/studio-integration/platform-bridge.js';
import {nativeCatalog} from '../src/studio-integration/catalog-adapter.js';
const require=createRequire(import.meta.url),{createNativeExample}=require('../../services/themePlatformStudioDocument.js');
const base=createNativeExample(),document=base.studio,scope={tenantId:'10',storeId:'20'},actor={id:'seller:30'};
function fixture(extra={}){
  const ports={readDraft:async({channel})=>({scope,channel,revision:'1',draft:structuredClone(document),published:structuredClone(document)}),saveDraft:async({channel,document})=>({scope,channel,revision:'2',draft:document,published:document}),createPreview:async({channel})=>({scope,channel,url:'https://local.invalid/theme-studio/preview.html'}),...extra.ports};
  const config={scope,actor,availableChannels:['web'],baseURL:'https://local.invalid/theme-studio/',capabilities:{read:true,edit:true,preview:true,publish:true},policy:{'theme.logo':{state:'EDITABLE'},'theme.save_draft':{state:'EDITABLE'}},...extra,ports};
  return createStudioSession(config);
}
test('only assigned channel is fetched; no invented second channel',async()=>{const seen=[];const session=fixture({ports:{readDraft:async request=>{seen.push(request.channel);return {scope,channel:request.channel,revision:'1',draft:document,published:document};}}});await session.initialize();assert.deepEqual(seen,['web']);assert.deepEqual(Object.keys(session.getState().channels),['web']);assert.throws(()=>session.getDocument('android'),/Geçersiz/);});
test('missing complete native document fails without local defaults',async()=>{const broken=structuredClone(document);delete broken.pages;const session=fixture({ports:{readDraft:async()=>({scope,channel:'web',revision:'1',draft:broken,published:document})}});await assert.rejects(session.initialize(),/tam Studio/);assert.deepEqual(session.getState().channels,{});});
test('foreign scope envelope is denied',async()=>{const session=fixture({ports:{readDraft:async()=>({scope:{...scope,storeId:'99'},channel:'web',revision:'1',draft:document,published:document})}});await assert.rejects(session.initialize(),error=>error.code==='SCOPE');});
test('UI draft edit uses same fine-grained diff as server',async()=>{const session=fixture();await session.initialize();const logo=structuredClone(document);logo.chrome.header.logoText='Store';session.edit('web',logo);const protectedDocument=structuredClone(logo);protectedDocument.chrome.header.sticky=false;assert.throws(()=>session.edit('web',protectedDocument),error=>error.code==='FORBIDDEN');assert.equal(session.getDocument('web',true).chrome.header.sticky,true);});
test('revoked edit capability blocks current session',async()=>{const session=fixture();await session.initialize();session.updateCapabilities({read:true,edit:false},{});const changed=structuredClone(document);changed.chrome.header.logoText='Revoked';assert.throws(()=>session.edit('web',changed),error=>error.code==='FORBIDDEN');});
test('unsaved edit cannot masquerade as a saved snapshot preview',async()=>{let previewCalls=0;const session=fixture({ports:{createPreview:async()=>{previewCalls++;}}});await session.initialize();const changed=structuredClone(document);changed.chrome.header.logoText='Dirty';session.edit('web',changed);await assert.rejects(session.preview('web'),error=>error.code==='DIRTY');assert.equal(previewCalls,0);});
test('in-flight save preserves a newer local edit',async()=>{let finish;const session=fixture({ports:{saveDraft:({channel,document})=>new Promise(resolve=>{finish=()=>resolve({scope,channel,revision:'2',draft:document,published:document});})}});await session.initialize();const a=structuredClone(document);a.chrome.header.logoText='First';session.edit('web',a);const save=session.save('web');const b=structuredClone(a);b.chrome.header.logoText='Second';session.edit('web',b);finish();await save;assert.equal(session.getDocument('web',true).chrome.header.logoText,'Second');assert.equal(session.getState().host.dirty.web,true);});

test('policy revision rejection shows trusted permission text and preserves the unsaved draft without retry',async()=>{
  let writes=0,submitted;
  const denied=Object.assign(new Error('private-upstream-detail <script>unsafe</script>'),{status:409,code:'THEME_POLICY_REVISION_CONFLICT'});
  const session=fixture({ports:{saveDraft:async request=>{writes++;submitted=structuredClone(request);throw denied;}}});
  await session.initialize();const changed=structuredClone(document);changed.chrome.header.logoText='Unsaved permitted edit';session.edit('web',changed);
  await assert.rejects(session.save('web'),error=>error===denied);
  const state=session.getState();
  assert.equal(state.host.error,'Düzenleme yetkilerin değişti. Kaydetmeden önce güncel izinleri yenile; bu değişiklik sunucuya kaydedilmedi.');
  assert.equal(state.host.error.includes('private-upstream-detail'),false);assert.equal(state.host.error.includes('<script>'),false);
  assert.equal(writes,1);assert.equal(submitted.expectedRevision,'1');assert.deepEqual(submitted.document,changed);
  assert.deepEqual(session.getDocument('web',true),changed);assert.deepEqual(session.getDocument('web'),document);
  assert.equal(state.channels.web.revision,'1');assert.equal(state.host.dirty.web,true);assert.equal(state.host.saved.web,false);
  assert.equal(state.host.pending.web,null);assert.equal(session.getHistory('web').canUndo,true);
});

test('unknown conflict and transport errors keep the sanitized unavailable fallback',async()=>{
  for(const denied of [Object.assign(new Error('private-response'),{status:409,code:'THEME_UNKNOWN_CONFLICT'}),new TypeError('private-network-url')]){
    let writes=0;const session=fixture({ports:{saveDraft:async()=>{writes++;throw denied;}}});
    await session.initialize();const changed=structuredClone(document);changed.chrome.header.logoText='Still unsaved';session.edit('web',changed);
    await assert.rejects(session.save('web'),error=>error===denied);
    assert.equal(session.getState().host.error,'Stüdyo bağlantısı kullanılamıyor. Düzenlemeler henüz sunucuya kaydedilmedi.');
    assert.equal(session.getState().host.error.includes('private-'),false);assert.equal(writes,1);
    assert.deepEqual(session.getDocument('web',true),changed);assert.equal(session.getState().host.dirty.web,true);
  }
});
test('publication reasserts authority after asynchronous readiness',async()=>{let finish,requests=0;const session=fixture({ports:{readReadiness:()=>new Promise(resolve=>{finish=()=>resolve({scope,channel:'web',revision:'1',ready:true,commerce:{contractVersion:'novastore-theme-host/1',scope,ready:true}});}),requestPublication:async()=>{requests++;}}});await session.initialize();const work=session.requestPublication('web');session.updateCapabilities({read:true,edit:true,publish:false},{});finish();await assert.rejects(work,error=>error.code==='FORBIDDEN');assert.equal(requests,0);});
test('readonly preview projection disables all mutation flags',()=>{const flags=capabilityFlags({readOnly:true,capabilities:{'theme.save_draft':{state:'MANAGE'},'theme.publish':{state:'PUBLISH'},'theme.preview':{state:'READ_ONLY'}}});assert.equal(flags.edit,false);assert.equal(flags.publish,false);assert.equal(flags.preview,true);});
test('missing preview grant fails closed',()=>assert.equal(capabilityFlags({capabilities:{}}).preview,false));
test('server 403 preserves dirty edits and displays permission failure without upstream details',async()=>{
  let writes=0;
  const denied=Object.assign(new Error('private-upstream'),{status:403,code:'THEME_PERMISSION_DENIED'});
  const session=fixture({ports:{saveDraft:async()=>{writes++;throw denied;}}});
  await session.initialize();const changed=structuredClone(document);changed.chrome.header.logoText='Unsaved';session.edit('web',changed);
  await assert.rejects(session.save('web'),error=>error===denied);
  assert.equal(writes,1);assert.equal(session.getState().host.dirty.web,true);assert.equal(session.getState().channels.web.revision,'1');
  assert.deepEqual(session.getDocument('web',true),changed);
  assert.equal(session.getState().host.error,'Bu işlem için güncel yetkin yok. Değişiklikler sunucuya kaydedilmedi; izinleri yenile.');
});
test('minimal typed override has no copied base or price data',()=>{const changed=structuredClone(document);changed.chrome.header.logoText='Store';assert.deepEqual(documentOverrides(base,changed),{studio:{chrome:{header:{logoText:'Store'}}}});});
test('canonical catalog adapter preserves exact price and stock',()=>{const catalog=nativeCatalog({products:[{id:1,name:'Real',price:12.35,stock:7,old_price:15,average_rating:4.2,review_count:5,category_ids:[2]}],categories:[{id:2,parent_id:null,name:'Category',slug:'category',product_count:1}]});assert.equal(catalog.products[0].price,12.35);assert.equal(catalog.products[0].stock,7);assert.deepEqual(catalog.products[0].categoryIds,['2']);assert.equal(catalog.categories[0].path,'category');});
test('missing canonical price cannot become a zero-priced demo',()=>assert.throws(()=>nativeCatalog({products:[{id:1,stock:7}]})));
test('transport refuses arbitrary URLs before fetching',async()=>{const client=createPlatformClient({kind:'seller',token:()=>''});await assert.rejects(client.get('https://external.invalid/api'));await assert.rejects(client.get('/../admin'));});
