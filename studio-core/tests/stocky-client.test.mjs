import test from 'node:test';
import assert from 'node:assert/strict';
import {createStockyThemeClient,stockyCsrf} from '../src/studio-integration/stocky-client.js';
const ok=data=>({ok:true,status:200,json:async()=>data});
test('BFF transport uses only normal CSRF cookie with finite same-origin POST envelope',async()=>{
 let seen;const client=createStockyThemeClient({csrf:()=> 'normal-csrf',fetcher:async(...args)=>{seen=args;return ok([]);}});
 await client.get('/assignments');assert.equal(client.kind,'seller');assert.equal(seen[0],'/novastore/theme/dispatch');
 assert.equal(seen[1].credentials,'same-origin');assert.equal(seen[1].headers.Authorization,undefined);
 assert.equal(seen[1].headers['X-XSRF-TOKEN'],'normal-csrf');assert.deepEqual(JSON.parse(seen[1].body),{method:'GET',path:'/assignments'});
});
test('write carries exact revision and stable retry key without automatic retry',async()=>{
 const seen=[];let fail=true;const client=createStockyThemeClient({csrf:()=> 'csrf',fetcher:async(_,options)=>{seen.push(JSON.parse(options.body));if(fail){fail=false;throw Error('offline');}return ok({});}});
 const body={expectedRevision:7,overrides:{studio:{}},reason:'save'};
 await assert.rejects(client.write('/drafts/abc',body,'PUT'));assert.equal(seen.length,1);
 await client.write('/drafts/abc',body,'PUT');assert.equal(seen[1].ifMatch,'"7"');assert.equal(seen[0].idempotencyKey,seen[1].idempotencyKey);assert.deepEqual(seen[1].body,body);
});
test('authorization loss rejects delayed responses and stops future writes',async()=>{
 let release,unauthorized=0;const client=createStockyThemeClient({csrf:()=> 'csrf',onUnauthorized:()=>unauthorized++,fetcher:async(_,options)=>{
  if(JSON.parse(options.body).path==='/assignments')return new Promise(resolve=>{release=()=>resolve(ok([{id:'old'}]));});
  return {ok:false,status:401,json:async()=>({code:'THEME_AUTH_REQUIRED'})};}});
 const pending=client.get('/assignments');await assert.rejects(client.get('/drafts/id'),error=>error.status===401);
 release();await assert.rejects(pending,error=>error.status===401);await assert.rejects(client.write('/drafts/id',{},'PUT'),error=>error.status===401);assert.equal(unauthorized,1);
});
test('arbitrary URLs, traversal, GET bodies and unsupported verbs fail before network',async()=>{
 let calls=0;const client=createStockyThemeClient({csrf:()=> 'csrf',fetcher:async()=>{calls++;return ok({});}});
 for(const path of ['https://invalid.test/','//invalid','/../admin','/%2e%2e/admin','/a%5cb'])await assert.rejects(client.get(path));
 await assert.rejects(client.request('/assignments',{body:{}}));await assert.rejects(client.request('/assignments',{method:'DELETE'}));assert.equal(calls,0);
});
test('binary adapter accepts only validated image payloads and preserves MIME',async()=>{
 let payload={mime:'image/png',bytesBase64:'AQID'};const client=createStockyThemeClient({csrf:()=> 'csrf',fetcher:async()=>ok(payload)});
 const blob=await client.blob('/assets/id/content');assert.equal(blob.type,'image/png');assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())],[1,2,3]);
 payload={mime:'text/html',bytesBase64:'AQID'};await assert.rejects(client.blob('/assets/id/content'));
});
test('missing/malformed CSRF does not silently submit anonymous mutations',async()=>{
 assert.equal(stockyCsrf('XSRF-TOKEN=hello%2Bworld; test=1'),'hello+world');assert.equal(stockyCsrf('XSRF-TOKEN=%broken'),'');
 let calls=0;const client=createStockyThemeClient({csrf:()=>'',fetcher:async()=>{calls++;return ok({});}});
 await assert.rejects(client.write('/drafts/id',{},'PUT'),error=>error.status===401);assert.equal(calls,0);
});
test('support state PATCH is finite and preserves compare-and-set; queries remain prohibited',async()=>{
 const id='11111111-1111-4111-8111-111111111111';let seen;
 const client=createStockyThemeClient({csrf:()=> 'csrf',fetcher:async(_,options)=>{seen=JSON.parse(options.body);return ok({});}});
 await client.write(`/services/${id}/support/threads/${id}/state`,{status:'CLOSED',expectedRevision:4},'PATCH');
 assert.equal(seen.method,'PATCH');assert.equal(seen.ifMatch,'"4"');
 await assert.rejects(client.write(`/drafts/${id}`,{},'PATCH'));
 await assert.rejects(client.get(`/services/${id}/support/threads/${id}?after=1`));
});
