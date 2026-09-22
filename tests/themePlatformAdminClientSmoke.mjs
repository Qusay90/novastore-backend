import assert from 'node:assert/strict';
import {createAdminThemeClient,createAdminRootLoginLocation} from '../admin-commerce-pro/src/theme-platform/adminThemeClient.js';
import {createAdminHttp,ADMIN_TOKEN_KEY,ADMIN_LOGIN_URL} from '../admin-commerce-pro/src/integration/adminHttp.js';
import {resolveIntegratedAdminPage,integratedAdminPageHash} from '../admin-commerce-pro/src/integration/adminHistory.js';
import {readStudioWorkshopLaunch} from '../admin-commerce-pro/src/theme-platform/studioWorkshopLaunch.js';

let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log(`PASS ${name}`);};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const token=`test.${Buffer.from(JSON.stringify({id:7,role:'admin',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.unsigned-unit-only`;
const values=new Map([[ADMIN_TOKEN_KEY,token]]);
const storage={getItem:key=>values.get(key),removeItem:key=>values.delete(key)};
const location={href:''};
const previousStorage=globalThis.localStorage,previousLocation=globalThis.location;
Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});
Object.defineProperty(globalThis,'location',{value:location,configurable:true});
const calls=[];
let mode='ok';
const fetchImpl=async(path,init)=>{calls.push({path,init});if(mode==='network')throw Error('unit network interruption');if(mode==='401')return json({code:'SESSION_REVOKED'},401);if(mode==='403')return json({code:'FORBIDDEN'},403);if(mode==='image')return new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}});if(mode==='html')return new Response('<html>not an image</html>',{headers:{'content-type':'text/html'}});return json({operationId:'unit-operation',result:{revision:2}});};
const http=createAdminHttp({fetchImpl,storage,location});
const client=createAdminThemeClient(http,{fetchImpl});
try {
  await check('nested workshop login resolves only the fixed Admin origin-root path',()=>{const target={href:'https://nova.example/studio-pro/?surface=admin'};const location=createAdminRootLoginLocation(target);location.href=ADMIN_LOGIN_URL;assert.equal(target.href,'/'+ADMIN_LOGIN_URL);assert.equal(new URL(target.href,'https://nova.example/studio-pro/').origin,'https://nova.example');assert.throws(()=>{location.href='https://other.example/login';});assert.throws(()=>{location.href='/login?token=unsafe';});assert.equal(target.href,'/'+ADMIN_LOGIN_URL);});
  await check('Studio launch accepts only the fixed authenticated original workshop descriptor',()=>{const valid={url:'/studio-pro/?surface=admin',mode:'AUTHORING_WITH_SCOPED_OFFERS',liveData:false,uiPreserved:true,sellerOffers:'SERVER_SCOPED'};const parsed=readStudioWorkshopLaunch(valid);assert.equal(parsed.url,valid.url);assert.equal(parsed.sellerOffersURL,'/studio-pro/?surface=admin&panel=seller-offers');for(const change of [{url:'javascript:alert(1)'},{url:'https://example.test/studio-pro/?surface=admin'},{url:'//example.test/studio-pro/'},{url:'/studio-pro/?surface=admin&token=unit'},{url:'/other/'},{url:'/studio-pro/?surface=storefront'},{mode:'LIVE'},{liveData:true},{uiPreserved:false},{sellerOffers:'LOCAL'}])assert.throws(()=>readStudioWorkshopLaunch({...valid,...change}));});
  await check('Admin history resolves real Studio route and rejects arbitrary route',()=>{assert.equal(resolveIntegratedAdminPage('#/themePlatform'),'themePlatform');assert.equal(integratedAdminPageHash('themePlatform'),'#/themePlatform');assert.equal(resolveIntegratedAdminPage('#/unknown'),'dashboard');});
  await check('JSON requests reuse existing Admin bearer session and same-origin policy',async()=>{await client.get('/experience/catalog');const {path,init}=calls.at(-1);assert.equal(path,'/api/admin/theme-platform/experience/catalog');assert.equal(init.headers.get('Authorization'),`Bearer ${token}`);assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');});
  await check('CAS revision and mutation body reach existing transport without double encoding',async()=>{await client.write('/services/test/experience',{expectedRevision:4,profileCode:'BASIC',overrides:{},reason:'test'},'PUT');const {init}=calls.at(-1);assert.equal(init.method,'PUT');assert.equal(init.headers.get('If-Match'),'"4"');assert.equal(JSON.parse(init.body).expectedRevision,4);assert.match(init.headers.get('Idempotency-Key'),/^[0-9a-f-]{36}$/);});
  await check('uncertain failure preserves idempotency key; confirmed next operation gets a new key',async()=>{const body={expectedRevision:1,reason:'retry'};mode='network';await assert.rejects(client.write('/offers/test/prepare',body),{code:'NETWORK_ERROR'});const first=calls.at(-1).init.headers.get('Idempotency-Key');mode='ok';await client.write('/offers/test/prepare',body);assert.equal(calls.at(-1).init.headers.get('Idempotency-Key'),first);await client.write('/offers/test/prepare',body);assert.notEqual(calls.at(-1).init.headers.get('Idempotency-Key'),first);});
  await check('external and traversal paths never reach network',async()=>{const before=calls.length;for(const path of ['https://remote.test','//remote.test','/../secrets','/x?token=bad','/x#fragment'])await assert.rejects(client.get(path));assert.equal(calls.length,before);});
  await check('403 stays forbidden and is not replaced by fake success',async()=>{mode='403';await assert.rejects(client.write('/offers/test/prepare',{reason:'denied'}),{status:403,code:'ADMIN_FORBIDDEN'});mode='ok';});
  await check('authenticated thumbnail bytes use same session with redirects blocked',async()=>{mode='image';const blob=await client.blob('/versions/test/assets/gallery%2Fweb.png');assert.equal(blob.type,'image/png');assert.equal(blob.size,4);const {path,init}=calls.at(-1);assert.equal(init.redirect,'error');assert.equal(init.credentials,'same-origin');assert.equal(init.headers.get('Authorization'),`Bearer ${token}`);assert(!path.includes(token));});
  await check('HTML response cannot become an authenticated thumbnail',async()=>{mode='html';await assert.rejects(client.blob('/versions/test/assets/x'));});
  await check('401 from authenticated asset reuses existing clear and root login redirect',async()=>{mode='401';await assert.rejects(client.blob('/versions/test/assets/x'),{status:401,code:'ADMIN_SESSION_EXPIRED'});assert.equal(values.get(ADMIN_TOKEN_KEY),undefined);assert.equal(location.href,'/'+ADMIN_LOGIN_URL);});
  await check('expired local session makes no subsequent network request',async()=>{const before=calls.length;await assert.rejects(client.get('/experience/catalog'),{status:401});assert.equal(calls.length,before);});
  console.log(JSON.stringify({result:'PASS',checks,scope:'real Admin client and session helper; mock HTTP transport; no browser, database, signed backend authentication, or live UAT'}));
} finally {
  Object.defineProperty(globalThis,'localStorage',{value:previousStorage,configurable:true});
  Object.defineProperty(globalThis,'location',{value:previousLocation,configurable:true});
}
