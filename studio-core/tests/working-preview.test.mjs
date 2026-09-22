import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createStudioSession} from '../src/studio-integration/session.js';
import {nativeDocumentValidator} from '../src/studio-integration/native-document-validation.js';
import {mountPlatformStudio,presentationConfig,contextIdentity} from '../src/studio-integration/platform-bridge.js';
import {routeForPage,routeForHref,trustedPreviewOrder,productsForRoute,APP_TABS,appTabForRoute} from '../src/studio-integration/preview-navigation.js';
import {withPreviewOrder} from '../src/sandbox/studio/previewOrder.js';
const require=createRequire(import.meta.url),{createNativeExample}=require('../../services/themePlatformStudioDocument.js');
const scope={tenantId:'1',storeId:'2'},actor={id:'seller:3'},origin='http://127.0.0.1:52773';
const foreign=value=>vm.runInNewContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`);
const document=createNativeExample().studio;
const policy={'theme.logo':{state:'EDITABLE'},'theme.save_draft':{state:'EDITABLE'}};
function sessionFixture(extra={}){
 const {ports={},...rest}=extra;
 return createStudioSession({scope,actor,availableChannels:['web'],baseURL:origin,capabilities:{read:true,edit:true,preview:true},policy,...rest,ports:{readDraft:async({channel})=>({scope,channel,revision:'1',draft:document,published:document}),saveDraft:async()=>{throw Error('unexpected persistence');},createPreview:async()=>{throw Error('unexpected server snapshot');},createWorkingPreview:async({channel})=>({scope,channel,url:origin+'/theme-studio/preview.html#working'}),...ports}});
}
test('web and app ports cross a genuine vm realm without relaxing strict validator',async()=>{
 for(const [native,server] of [['web','web'],['android','app']]){
  const doc=createNativeExample({channel:server}).studio,remote=foreign(doc);
  assert.notEqual(Object.getPrototypeOf(remote),Object.prototype);
  assert.throws(()=>nativeDocumentValidator.validateStudio(remote,false));
  const session=sessionFixture({availableChannels:[native],ports:{readDraft:async()=>({scope,channel:native,revision:'1',draft:remote,published:remote})}});
  await session.initialize();assert.deepEqual(session.getDocument(native,true),doc);
 }
});
test('cross-realm malicious content remains rejected at the trusted port boundary',async()=>{
 const unsafe=structuredClone(document);unsafe.blocks[0].title='<script>alert(1)</script>';
 const session=sessionFixture({ports:{readDraft:async()=>({scope,channel:'web',revision:'1',draft:foreign(unsafe),published:foreign(document)})}});
 await assert.rejects(session.initialize(),error=>error.code==='THEME_UNSAFE_STUDIO_CONTENT');
 assert.deepEqual(session.getState().channels,{});
});
test('dirty working preview creates no saved snapshot or persistence and retains undo',async()=>{
 let calls=0;const session=sessionFixture({ports:{createWorkingPreview:async request=>{calls++;assert.equal(request.document.chrome.header.logoText,'Local change');return {scope,channel:'web',url:origin+'/theme-studio/preview.html#one'};}}});
 await session.initialize();const next=structuredClone(document);next.chrome.header.logoText='Local change';session.edit('web',next);
 const result=await session.workingPreview('web',{pageKey:'template:account'});
 assert.equal(calls,1);assert.equal(result.working,true);assert.equal(session.getState().host.dirty.web,true);assert.equal(session.getState().host.saved.web,false);assert.equal(session.getState().channels.web.revision,'1');assert.equal(session.getState().host.preview.web,null);assert.equal(session.getHistory('web').canUndo,true);
 await assert.rejects(session.preview('web'),error=>error.code==='DIRTY');
});
test('late working preview cannot acknowledge a newer edit or revoked access',async()=>{
 let finish;const session=sessionFixture({ports:{createWorkingPreview:request=>new Promise(resolve=>{finish=()=>resolve({scope,channel:request.channel,url:origin+'/theme-studio/preview.html#late'});})}});await session.initialize();
 const pending=session.workingPreview('web');const doc=structuredClone(document);doc.chrome.header.logoText='Later';session.edit('web',doc);finish();await assert.rejects(pending,error=>error.code==='STALE');assert.equal(session.getState().host.workingPreview,undefined);
 const revoked=session.workingPreview('web');session.updateCapabilities({read:false,preview:false},{});finish();await assert.rejects(revoked,error=>error.code==='FORBIDDEN');
});
test('readonly working renderer accepts exact scoped typed updates but never permits save',async()=>{
 const session=sessionFixture({readOnly:true,renderOnly:true,workingPreview:true,workingSequence:1,capabilities:{read:true,edit:false,preview:true}});await session.initialize();
 const doc=structuredClone(document);doc.chrome.header.logoText='Live working title';session.replaceWorkingPreview(foreign({scope,channel:'web',document:doc,pageKey:'template:account',sequence:2}));
 assert.equal(session.getDocument('web',true).chrome.header.logoText,'Live working title');assert.equal(session.getState().host.workingPageKey,'template:account');assert.equal(session.getState().host.dirty.web,false);
 await assert.rejects(session.save('web'),error=>error.code==='FORBIDDEN');
 assert.throws(()=>session.replaceWorkingPreview({scope,channel:'web',document:doc,pageKey:'home',sequence:2}),error=>error.code==='STALE');
 assert.throws(()=>session.replaceWorkingPreview({scope:{...scope,storeId:'99'},channel:'web',document:doc,pageKey:'home',sequence:3}),error=>error.code==='SCOPE');
 assert.throws(()=>session.replaceWorkingPreview({scope,channel:'android',document:doc,pageKey:'home',sequence:3}),error=>error.code==='CHANNEL');
 assert.throws(()=>session.replaceWorkingPreview({scope,channel:'web',document:doc,pageKey:'page:missing',sequence:3}),error=>error.code==='DOCUMENT');
 const unsafe=structuredClone(doc);unsafe.blocks[0].image='https://outside.invalid/image.png';assert.throws(()=>session.replaceWorkingPreview({scope,channel:'web',document:unsafe,pageKey:'home',sequence:3}),error=>error.code==='THEME_INVALID_STUDIO_ASSET_REFERENCE');
 const saved=sessionFixture({readOnly:true,renderOnly:true});await saved.initialize();assert.throws(()=>saved.replaceWorkingPreview({scope,channel:'web',document:doc,pageKey:'home',sequence:3}),error=>error.code==='FORBIDDEN');
});
test('routing uses assigned canonical product and category identities only',()=>{
 const catalog={products:[{id:41,slug:'real-product',name:'Canonical'}],categories:[{id:'51',canonicalPath:'real-category',name:'Verified'}]};
 assert.equal(routeForHref('#/urun/real-product',document,catalog).productId,41);
 assert.equal(routeForHref('#/urun/999',document,catalog).type,'unavailable');
 assert.equal(routeForHref('#/kategori/real-category',document,catalog).categoryId,'51');
 assert.equal(routeForHref('#/kategori/demo-sector',document,catalog).type,'unavailable');
 assert.equal(routeForHref('https://other.invalid',document,catalog),null);assert.equal(routeForHref('#/%FF',document,catalog),null);
 for(const [href,type] of [['#/hesabim','account'],['#/sepet','cart'],['#/yardim','support']])assert.equal(routeForHref(href,document,catalog).pageKey,`template:${type}`);
 assert.equal(routeForPage('template:product',document,{products:[],categories:[]}).productId,undefined);
});
test('category template chooses a real category and includes only scoped descendant products',()=>{
 const catalog={categories:[{id:'10',parentId:null,name:'Parent'},{id:'11',parentId:'10',name:'Child'},{id:'12',parentId:'11',name:'Leaf'},{id:'20',parentId:null,name:'Other'}],products:[{id:1,categoryIds:['10']},{id:2,categoryIds:['11']},{id:3,categoryId:'12'},{id:4,categoryIds:['20']},{id:5,categoryIds:['foreign']}]};
 const route=routeForPage('template:category',document,catalog);assert.equal(route.categoryId,'10');assert.deepEqual(productsForRoute(route,catalog).map(x=>x.id),[1,2,3]);
 assert.deepEqual(productsForRoute({...route,categoryId:'missing'},catalog),[]);assert.equal(routeForPage('template:category',document,{categories:[],products:[]}).type,'categories');
 const search=routeForHref('#/arama?q=%C3%A7ay%26kahve',document,catalog);assert.equal(search.query,'çay&kahve');
});
test('every app tab has a Turkish label, navigable target and current-state mapping',()=>{
 const catalog={categories:[],products:[]};
 for(const [key,tab] of Object.entries(APP_TABS)){assert(tab.label.length>0);const route=routeForHref(tab.href,document,catalog);assert(route);assert.equal(appTabForRoute(route),key);}
 assert.equal(routeForHref(APP_TABS.favorites.href,document,catalog).pageKey,'template:account');
});
test('order message requires parent identity, exact origin/channel, and a complete permutation',()=>{
 const parent={},order=document.blocks.map(item=>item.id).reverse(),data={type:'novastore-studio-preview-order',channel:'web',pageKey:'home',order},event={source:parent,origin,data},context={origin,parent,channel:'web',document};
 const accepted=trustedPreviewOrder(event,context);assert.deepEqual(withPreviewOrder(document,accepted).blocks.map(item=>item.id),order);assert.notDeepEqual(document.blocks.map(item=>item.id),order);
 for(const other of [{...event,origin:'https://evil.invalid'},{...event,source:{}},{...event,data:{...data,channel:'android'}},{...event,data:{...data,order:[order[0],order[0]]}},{...event,data:{...data,pageKey:'page:missing'}}])assert.equal(trustedPreviewOrder(other,context),undefined);
});
async function fakeDOM(run){
 const prior={window:globalThis.window,document:globalThis.document,location:globalThis.location};const configurations=[];
 globalThis.window=new EventTarget();globalThis.location={origin};globalThis.document={createElement:()=>({contentWindow:{NovaStoreStudio:{mount:async config=>configurations.push(config),unmount(){},updatePolicy(){},navigate(){}}},remove(){}})};
 const container={replaceChildren(frame){if(frame)queueMicrotask(()=>frame.onload());}};
 try{await run(container,configurations);}finally{globalThis.window=prior.window;globalThis.document=prior.document;globalThis.location=prior.location;}
}
const context=()=>({scope,actor,mode:'seller',serviceId:'s1',readOnly:false,policyRevision:1,availableChannels:['web'],capabilities:{'theme.save_draft':{state:'EDITABLE'},'theme.preview':{state:'EDITABLE'}},channels:{web:{assignmentId:'a1',draftId:'d1',themeVersionId:'v1',revision:1,document:createNativeExample(),catalog:{products:[],categories:[]},commerce:{}}}});
test('selected presentation comes only from server package identity and survives working previews',async()=>fakeDOM(async(container,configs)=>{
 const value=context(),presentation={id:'nova-classic',version:'1.0.0',digest:'a'.repeat(64)};value.channels.web.presentation=presentation;
 const mapped=presentationConfig(value);assert.deepEqual(mapped.presentation,presentation);assert.deepEqual(mapped.presentations.web,presentation);mapped.presentation.id='outside';assert.equal(value.channels.web.presentation.id,'nova-classic');
 const changed=structuredClone(value);changed.channels.web.presentation.digest='b'.repeat(64);assert.notEqual(contextIdentity(value),contextIdentity(changed));
 const mounted=await mountPlatformStudio(container,{context:value,client:{}});assert.deepEqual(configs[0].presentation,presentation);
 let preview;const first=await configs[0].ports.createWorkingPreview({scope,channel:'web',revision:'1',document,pageKey:'home',sequence:1});
 await configs[0].ports.mountPreviewFrame({isConnected:true,contentWindow:{NovaStoreStudio:{mount:async config=>{preview=config;}}}},first.url);assert.deepEqual(preview.presentation,presentation);assert.equal(preview.channels.web.themeVersionId,'v1');mounted.unmount();
 const app=context();app.availableChannels=['app'];app.channels={app:{...app.channels.web,presentation}};assert.deepEqual(presentationConfig(app).presentations.android,presentation);
}));
test('bridge keeps one working iframe URL and updates readonly data without HTTP writes',async()=>fakeDOM(async(container,configs)=>{
 let writes=0,previewConfig,updates=[];const mounted=await mountPlatformStudio(container,{context:context(),client:{write:async()=>{writes++;}}});
 const ports=configs[0].ports,first=await ports.createWorkingPreview(foreign({scope,channel:'web',revision:'1',document,pageKey:'home',sequence:1}));
 const frame={isConnected:true,contentWindow:{NovaStoreStudio:{mount:async config=>{previewConfig=config;},updatePolicy(){},updateWorkingPreview:value=>updates.push(value)}}};
 await ports.mountPreviewFrame(frame,first.url);assert.equal(previewConfig.readOnly,true);assert.equal(previewConfig.workingPreview,true);
 const doc=structuredClone(document);doc.chrome.header.logoText='While editing';const next=await ports.createWorkingPreview(foreign({scope,channel:'web',revision:'1',document:doc,pageKey:'template:account',sequence:2}));
 assert.equal(first.url,next.url);assert.equal(updates.length,1);assert.equal(updates[0].pageKey,'template:account');assert.equal(updates[0].document.chrome.header.logoText,'While editing');
 await assert.rejects(previewConfig.ports.uploadAsset('x'),error=>error.code==='FORBIDDEN');await assert.rejects(previewConfig.ports.saveDraft({}),error=>error.code==='FORBIDDEN');await assert.rejects(previewConfig.ports.requestPublication({}),error=>error.code==='FORBIDDEN');assert.equal(writes,0);mounted.unmount();await assert.rejects(ports.createWorkingPreview({scope,channel:'web',document,pageKey:'home',sequence:3}),/kapandı/);
}));
test('refresh notifies latest profile without replacing the unsaved draft and invalidation never notifies',async()=>fakeDOM(async(container,configs)=>{
 const value=context(),fresh=structuredClone(value),seen=[];fresh.profile={code:'BASIC'};fresh.policyRevision=2;fresh.channels.web.document.studio.chrome.header.logoText='Server next';
 const mounted=await mountPlatformStudio(container,{context:value,contextPath:'/services/s1/editor-context',client:{get:async()=>fresh},onContextUpdated:next=>seen.push(next)});await mounted.refresh();assert.equal(seen.length,1);assert.equal(seen[0].profile.code,'BASIC');assert.equal(seen[0].channels.web.document.studio.chrome.header.logoText,value.channels.web.document.studio.chrome.header.logoText);
 fresh.scope.storeId='99';await mounted.refresh();assert.equal(seen.length,1);mounted.unmount();
}));
