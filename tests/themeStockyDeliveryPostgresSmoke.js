'use strict';

// Actual PC1 HTTP/auth/services + PostgreSQL + actual Stocky PHP receiver over
// loopback HTTP. No provider or production database is permitted by the owner DB harness.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const gates=[];
const trace=[];
let db, server, fixture, cleanup, storageRoot;
const gate=async(name,work)=>{try{await work();gates.push({name,status:'PASS'});}catch(error){gates.push({name,status:'FAIL'});throw error;}};

(async()=>{
    db=await require('./helpers/themePlatformDisposableDb')();
    const {pool,sensitive}=db;
    const seed=await require('./helpers/themePlatformWave2Fixtures').seedWave2(pool,sensitive);
    const connector=require('../services/stockySystemConnectorService');
    const delivery=require('../services/themeStockyDeliveryService');
    const stockyRoot=process.env.NOVASTORE_THEME_STOCKY_SOURCE;
    assert(stockyRoot&&path.isAbsolute(stockyRoot),'Explicit owned Stocky source required');
    const {startStockyFixture}=require(path.join(stockyRoot,'tests/r21/stockyFixtureHarness.cjs'));
    const secrets={};
    const stores=[seed.storeA,seed.storeB].map((store,index)=>{
        const label=index?'B':'A'; secrets[`theme-${label}`]=crypto.randomBytes(48).toString('base64url');
        sensitive.add(secrets[`theme-${label}`]);
        return{label,connectionKey:crypto.randomUUID(),remoteStoreId:`pc1-store-${store.id}`,keyId:'theme-v1',secret:secrets[`theme-${label}`],products:[]};
    });
    fixture=await startStockyFixture({stores});
    const environment={...process.env,NOVASTORE_STOCKY_THEME_DELIVERY_ENABLED:'true',NOVASTORE_STOCKY_THEME_DELIVERY_WORKER_ENABLED:'true',
        NOVASTORE_STOCKY_THEME_DELIVERY_ACTIVATION_MODE:'local',NOVASTORE_STOCKY_THEME_DELIVERY_ALLOWED_HOSTS:'127.0.0.1',
        NOVASTORE_STOCKY_THEME_DELIVERY_LOCAL_TRANSPORT_ENABLED:'true',NOVASTORE_STOCKY_SYSTEM_COMMERCE_SECRETS_JSON:JSON.stringify(secrets)};
    sensitive.add(environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_SECRETS_JSON);
    const runtime=delivery.resolveThemeDeliveryRuntime({environment,startupSafety:require('../config/startupSafety').resolveStartupSafety(environment)});
    const bindings={};
    for(const [index,store] of [seed.storeA,seed.storeB].entries()) {
        const remote=stores[index]; bindings[remote.label]=await connector.createStockyConnectorBinding(pool,{
            id:remote.connectionKey,organizationId:store.org,storeId:store.id,remoteStoreId:remote.remoteStoreId,
            endpointOrigin:fixture.origins[remote.label],keyId:remote.keyId,secretRef:`theme-${remote.label}`},{runtime});
    }
    storageRoot=await fs.mkdtemp(path.join(os.tmpdir(),'novastore-theme-delivery-assets-'));
    const {createAdminThemeRouter}=require('../routes/themePlatformRoutes');
    const app=express();app.use(express.json({limit:'24mb'}));
    app.use('/api/admin/theme-platform',createAdminThemeRouter({database:pool,enabled:true,storageRoot}));
    server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
    const ap=`http://127.0.0.1:${server.address().port}/api/admin/theme-platform`;
    const request=async(route,body,method='POST',key=crypto.randomUUID())=>{
        const response=await fetch(ap+route,{method,headers:{authorization:`Bearer ${seed.admin.token}`,
            'content-type':'application/json','idempotency-key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});
        const json=await response.json();assert.equal(response.status,200,`${route}: ${response.status} ${json.code||''}`);return json;
    };
    const reason='Owned local Theme Delivery acceptance';
    const pkg=JSON.parse(await fs.readFile(path.join(__dirname,'../theme-platform/packages/nova-classic-studio-web-v1_1.json'),'utf8'));
    const version=(await request('/experience/packages',{package:pkg,reason})).result;
    const services={};
    for(const [index,store] of [seed.storeA,seed.storeB].entries())services[index?'B':'A']=(await request('/services',{
        storeId:store.id,plan:'pro',status:'ACTIVE',startsAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',reason})).result;
    const prepared={};
    for(const label of ['A','B']) {
        const offer=(await request(`/services/${services[label].id}/offers`,{themeVersionId:version.id,channel:'web',commerceMode:'SINGLE_STORE',
            profileCode:'BASIC',overrides:{},expectedRevision:Number(services[label].policy_revision),reason})).result;
        prepared[label]=await request(`/offers/${offer.id}/prepare`,{expectedRevision:Number(offer.revision),reason});
    }
    const state=async label=>(await pool.query('SELECT d.*,o.payload,o.payload_hash,o.status AS outbox_status FROM theme_stocky_deliveries d JOIN theme_outbox o ON o.id=d.outbox_id WHERE d.outbox_id=$1',[prepared[label].result.delivery.eventId])).rows[0];
    const now=async label=>pool.query('UPDATE theme_outbox SET next_attempt_at=clock_timestamp() WHERE id=$1',[prepared[label].result.delivery.eventId]);
    const send=connector.createSafeStockyThemeTransport({timeoutMs:10000});
    const record=async input=>{const response=await send(input);let decoded;try{decoded=JSON.parse(response.rawBody);}catch{} trace.push({method:input.method,path:new URL(input.url).pathname,status:response.statusCode,signed:Boolean(connector.getHeader(response.headers,connector.RESPONSE_SIGNATURE_HEADER)),code:decoded?.code||null,resultStatus:decoded?.data?.processing_status||null});return response;};
    const worker=delivery.createThemeDeliveryWorker({database:pool,runtime,send:record});
    await gate('D01 Admin offer transaction produces immutable event and exact scoped delivery record',async()=>{
        for(const label of ['A','B']) {
            const row=await state(label);assert.equal(row.status,'DELIVERY_PENDING');assert.equal(row.receipt,null);
            assert.equal(row.payload.assignment.theme_version_id,version.id);assert.equal(row.connection_id,bindings[label].id);
            assert.equal(row.payload_hash,connector.sha256Hex(connector.stableStringify(row.payload)));
            assert.equal(prepared[label].result.deliveryVerified,false);
        }
    });
    await gate('D02 original order and theme transport path domains cannot proxy each other',async()=>{
        assert.throws(()=>connector.signStockyRequest({method:'POST',path:connector.THEME_EVENT_PATH,body:'{}',connection:bindings.A,runtime}));
        for(const forbidden of [connector.EVENT_PATH,'/api/seller/me',connector.THEME_EVENT_PATH+'?url=x',connector.THEME_EVENT_PATH+'/../orders/events'])
            assert.throws(()=>connector.signStockyThemeRequest({method:'POST',path:forbidden,body:'{}',connection:bindings.A,runtime}));
    });
    await gate('D03 lost signed response retries same logical event without duplicate receipt',async()=>{
        await pool.query("UPDATE theme_outbox SET next_attempt_at=clock_timestamp()+INTERVAL '1 hour' WHERE id=$1",[prepared.B.result.delivery.eventId]);
        let lost=false;
        const failing=delivery.createThemeDeliveryWorker({database:pool,runtime,send:async input=>{
            const response=await record(input);if(!lost&&new URL(input.url).pathname===connector.THEME_EVENT_PATH){lost=true;throw new Error('LOCAL_LOST_RESPONSE');}return response;}});
        assert.equal((await failing.tick()).state,'RETRY_PENDING');assert(lost);assert.equal((await state('A')).receipt,null);
        await now('A');const retry=await worker.tick();assert.equal(retry.state,'RECEIPT_CONFIRMED',JSON.stringify(retry));
        const row=await state('A');assert.equal(row.receipt.processing_status,'delivered');assert.equal(row.status,'RECEIPT_CONFIRMED');
        assert.equal((await pool.query('SELECT COUNT(*)::int n FROM theme_inbox WHERE event_id=$1',[row.outbox_id])).rows[0].n,1);
    });
    await gate('D04 lost ACK keeps durable delivered receipt and retries only exact acknowledgement',async()=>{
        await now('B');let lost=false;
        const failing=delivery.createThemeDeliveryWorker({database:pool,runtime,send:async input=>{
            const response=await record(input);if(new URL(input.url).pathname.endsWith('/receipt')&&!lost){lost=true;throw new Error('LOCAL_LOST_ACK');}return response;}});
        assert.equal((await failing.tick()).state,'RETRY_PENDING');assert(lost);
        const before=await state('B');assert.equal(before.status,'DELIVERED');assert(before.receipt);assert.equal(before.acknowledged_at,null);
        const postCount=trace.filter(r=>r.path===connector.THEME_EVENT_PATH).length;
        await now('B');assert.equal((await worker.tick()).state,'RECEIPT_CONFIRMED');
        const after=await state('B');assert.equal(after.result_id,before.result_id);assert.deepEqual(after.receipt,before.receipt);
        assert.equal(trace.filter(r=>r.path===connector.THEME_EVENT_PATH).length,postCount);
    });
    await gate('D05 operation read distinguishes receipt confirmation from seller visibility',async()=>{
        const operation=await request(`/operations/${prepared.A.operationId}`,undefined,'GET');
        assert.equal(operation.themeDelivery[0].status,'RECEIPT_CONFIRMED');assert(operation.themeDelivery[0].resultId);
        assert.equal(operation.result.deliveryVerified,false,'Historical prepared result remains immutable');
        assert(!JSON.stringify(operation.themeDelivery).includes('VISIBLE_TO_SELLER'));
    });
    await gate('D06 durable delivery identity and receipt cannot be rewritten',async()=>{
        await assert.rejects(pool.query('UPDATE theme_stocky_deliveries SET connection_id=$2 WHERE outbox_id=$1',[prepared.A.result.delivery.eventId,bindings.B.id]),/IMMUTABLE/);
        await assert.rejects(pool.query("UPDATE theme_stocky_deliveries SET receipt='{}' WHERE outbox_id=$1",[prepared.A.result.delivery.eventId]),/IMMUTABLE/);
        await assert.rejects(pool.query('DELETE FROM theme_stocky_deliveries WHERE outbox_id=$1',[prepared.A.result.delivery.eventId]),/DURABLE/);
    });
    await gate('D07 actual signed receiver rejects another connection store and altered logical replay',async()=>{
        const row=await state('A');const raw=connector.stableStringify(row.payload);
        const invoke=async(connection,body)=>{const signed=connector.signStockyThemeRequest({method:'POST',path:connector.THEME_EVENT_PATH,body,connection,runtime});
            const response=await record({url:signed.url,method:'POST',body,headers:signed.headers,runtime});
            connector.verifyStockyResponse({...response,path:connector.THEME_EVENT_PATH,connection,runtime,expectedNonce:signed.nonce,expectedTimestamp:signed.timestamp});return response;};
        const foreign=await invoke(bindings.B,raw);assert.equal(foreign.statusCode,409);
        assert.equal(JSON.parse(foreign.rawBody).code,'THEME_STORE_MAPPING_MISMATCH');
        const changed=structuredClone(row.payload);changed.assignment.theme_name+=' changed';
        assert.equal((await invoke(bindings.A,connector.stableStringify(changed))).statusCode,409);
    });
    await gate('D08 normal Admin withdrawal atomically queues and delivers separate revocation',async()=>{
        const assignment=prepared.A.result.assignment;
        await request(`/assignments/${assignment.id}/withdraw`,{expectedRevision:Number(assignment.revision),reason});
        const candidates=(await pool.query("SELECT id,payload FROM theme_outbox WHERE event_type='theme.assignment.revoked' AND service_id=$1",[services.A.id])).rows;
        assert.equal(candidates.length,1);assert.equal(candidates[0].payload.assignment_id,assignment.id);
        assert.equal((await worker.tick()).state,'RECEIPT_CONFIRMED');
        const row=(await pool.query('SELECT receipt FROM theme_stocky_deliveries WHERE outbox_id=$1',[candidates[0].id])).rows[0];
        assert.equal(row.receipt.processing_status,'revoked');
    });
    await gate('D09 simultaneous workers claim a live revocation once and do not mutate commerce',async()=>{
        const assignment=prepared.B.result.assignment;
        await request(`/assignments/${assignment.id}/withdraw`,{expectedRevision:Number(assignment.revision),reason});
        const count=trace.filter(row=>row.path===connector.THEME_EVENT_PATH).length;
        const results=await Promise.all([worker.tick(),delivery.createThemeDeliveryWorker({database:pool,runtime,send:record}).tick()]);
        assert.deepEqual(results.map(result=>result.state).sort(),['IDLE','RECEIPT_CONFIRMED']);
        assert.equal(trace.filter(row=>row.path===connector.THEME_EVENT_PATH).length,count+1);
        assert.equal((await worker.tick()).state,'IDLE');
        assert.equal((await pool.query('SELECT COUNT(*)::int n FROM orders')).rows[0].n,0);
        assert.equal((await pool.query('SELECT COUNT(*)::int n FROM theme_stocky_deliveries')).rows[0].n,4);
    });
    await gate('D10 disabled independent theme flag causes no network or delivery claim',async()=>{
        const disabled=delivery.resolveThemeDeliveryRuntime({environment:{...environment,NOVASTORE_STOCKY_THEME_DELIVERY_ENABLED:'false'},startupSafety:require('../config/startupSafety').resolveStartupSafety(environment)});
        assert.equal((await delivery.createThemeDeliveryWorker({database:pool,runtime:disabled,send:()=>{throw new Error('Network must not run');}}).tick()).state,'DISABLED');
    });
    db.originalConsole.log(JSON.stringify({transportTrace:trace}));
})().catch(error=>{(db?.originalConsole.error||console.error)(db?db.redact(error.stack||error.message):error.message);process.exitCode=1;})
    .finally(async()=>{
        if(server)await new Promise(resolve=>server.close(resolve));
        try{if(fixture)await fixture.close();}catch(error){console.error(error.message);process.exitCode=1;}
        try{if(db)cleanup=await db.cleanup();}catch(error){console.error(error.message);process.exitCode=1;}
        const result={suite:'themeStockyDeliveryPostgresSmoke',result:process.exitCode?'FAIL':'PASS',pass:gates.filter(g=>g.status==='PASS').length,
            fail:gates.filter(g=>g.status==='FAIL').length,skip:0,gates,trace,cleanup,migrationCount:db?.migrations.length,
            scope:'Actual authenticated PC1 Admin HTTP, PostgreSQL, Stocky Laravel/PHP+SQLite receiver and signed HTTP. No human Seller login, MySQL concurrency, Studio, production or provider claim.'};
        const flag=process.argv.indexOf('--evidence-dir');if(flag!==-1){const dir=path.resolve(process.argv[flag+1]);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'theme-stocky-delivery-result.json'),JSON.stringify(result,null,2)+'\n');}
        console.log(JSON.stringify(result));
    });
