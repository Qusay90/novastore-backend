'use strict';
// Actual disposable PG48 + actual worker/signature verifier. The send function
// is an explicit fault/signed-response TEST DOUBLE, never a Stocky receiver UAT.
// Historical accepted assignments/outbox rows are seeded directly; no fake READY
// decision is inserted and the strict new-offer presentation gate is not bypassed.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const startDisposable=require('./helpers/themePlatformDisposableDb');
const gates=[];let db;
const gate=async(name,run)=>{try{await run();gates.push({name,status:'PASS'});db.originalConsole.log(`PASS ${name}`);}
    catch(error){gates.push({name,status:'FAIL'});throw new Error(`${name}: ${error.stack||error.message}`);}};
(async()=>{
    db=await startDisposable();const{pool}=db;
    assert.equal(db.migrations.length,48);
    const fixture=await require('./helpers/themePlatformWave2Fixtures').seedWave2(pool,db.sensitive);
    const transport=require('../services/stockySystemConnectorService'),delivery=require('../services/themeStockyDeliveryService'),v=require('../services/themePlatformValidation');
    const secret=crypto.randomBytes(48).toString('base64url');db.sensitive.add(secret);
    const environment={...process.env,NOVASTORE_STOCKY_THEME_DELIVERY_ENABLED:'true',NOVASTORE_STOCKY_THEME_DELIVERY_WORKER_ENABLED:'true',
        NOVASTORE_STOCKY_THEME_DELIVERY_ACTIVATION_MODE:'local',NOVASTORE_STOCKY_THEME_DELIVERY_ALLOWED_HOSTS:'127.0.0.1',
        NOVASTORE_STOCKY_THEME_DELIVERY_LOCAL_TRANSPORT_ENABLED:'true',NOVASTORE_STOCKY_SYSTEM_COMMERCE_SECRETS_JSON:JSON.stringify({'retry-test':secret})};
    db.sensitive.add(environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_SECRETS_JSON);
    const runtime=delivery.resolveThemeDeliveryRuntime({environment,startupSafety:require('../config/startupSafety').resolveStartupSafety(environment)});
    const store=fixture.storeA,serviceId=crypto.randomUUID(),themeId=crypto.randomUUID(),versionId=crypto.randomUUID();
    await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro')",[serviceId,store.org,store.id]);
    const connection=await transport.createStockyConnectorBinding(pool,{id:crypto.randomUUID(),organizationId:store.org,storeId:store.id,
        remoteStoreId:`pc1-store-${store.id}`,endpointOrigin:'http://127.0.0.1:65530',keyId:'retry-key',secretRef:'retry-test'},{runtime});
    const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'../theme-platform/packages/nova-classic-studio-web-v1_1.json'),'utf8'));
    await pool.query("INSERT INTO themes(id,slug,name) VALUES($1,'historical-worker-test','Historical worker test')",[themeId]);
    await pool.query("INSERT INTO theme_versions(id,theme_id,version,status,document,digest) VALUES($1,$2,'historical-1','PUBLISHED',$3,$4)",[versionId,themeId,pkg.document,v.digest(pkg.document)]);
    const seeded=[];
    const seed=async()=>{
        const assignmentId=crypto.randomUUID(),operationId=crypto.randomUUID(),eventId=crypto.randomUUID();
        // Preserve older historical assignments without violating one active
        // assignment per channel. Their sealed outbox identities stay intact.
        await pool.query("UPDATE theme_assignments SET status='WITHDRAWN',withdrawn_at=clock_timestamp() WHERE service_id=$1 AND status<>'WITHDRAWN'",[serviceId]);
        await pool.query("INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel,commerce_mode,status,accepted_at) VALUES($1,$2,$3,$4,$5,'web','SINGLE_STORE','ACCEPTED',NOW())",[assignmentId,serviceId,store.org,store.id,versionId]);
        const payload={contract_version:'theme.v1',event_id:eventId,event_type:'theme.assignment.upserted',event_version:1,occurred_at:new Date().toISOString(),
            store_id:connection.remote_store_id,service_id:serviceId,assignment_id:assignmentId,assignment_revision:1,
            assignment:{theme_id:themeId,theme_version_id:versionId,theme_name:'Nova Store',package_sha256:v.digest(pkg),renderer_id:pkg.renderer.id,renderer_version:pkg.renderer.version,
                document_schema_version:2,channel:'web',experience_profile:'BASIC',policy_revision:1,capabilities:{},document:pkg.document}};
        const raw=transport.stableStringify(payload);
        await pool.query(`INSERT INTO theme_operations(id,service_id,organization_id,store_id,scope_key,actor_id,type,status,idempotency_key,request_hash,correlation_id)
            VALUES($1,$2::uuid,$3,$4,$2::text,'fixture:historical','historical_delivery','COMPLETED',$5,$6,$7)`,[operationId,serviceId,store.org,store.id,crypto.randomUUID(),v.digest(payload),crypto.randomUUID()]);
        await pool.query(`INSERT INTO theme_outbox(id,service_id,organization_id,store_id,operation_id,event_type,payload,payload_hash)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[eventId,serviceId,store.org,store.id,operationId,payload.event_type,payload,transport.sha256Hex(raw)]);
        await pool.query('INSERT INTO theme_stocky_deliveries(outbox_id,connection_id,service_id,organization_id,store_id,assignment_id) VALUES($1,$2,$3,$4,$5,$6)',[eventId,connection.id,serviceId,store.org,store.id,assignmentId]);
        const row={eventId,payload};seeded.push(row);return row;
    };
    const state=async item=>(await pool.query(`SELECT d.*,o.attempts,o.status AS outbox_status,o.next_attempt_at,
        EXTRACT(EPOCH FROM o.next_attempt_at-clock_timestamp()) AS delay_seconds FROM theme_stocky_deliveries d JOIN theme_outbox o ON o.id=d.outbox_id WHERE d.outbox_id=$1`,[item.eventId])).rows[0];
    const due=item=>pool.query('UPDATE theme_outbox SET next_attempt_at=clock_timestamp() WHERE id=$1',[item.eventId]);
    const receipt=(item,acknowledged=false)=>({contract_version:'theme.v1',event_type:'theme.processing_result',source_event_id:item.eventId,
        store_id:connection.remote_store_id,service_id:serviceId,assignment_id:item.payload.assignment_id,assignment_revision:1,theme_version_id:versionId,
        package_sha256:item.payload.assignment.package_sha256,channel:'web',processing_status:'delivered',result_revision:1,processed_at:'2026-09-19T10:00:00+00:00',
        result_id:transport.sha256Hex(item.eventId),receipt_status:acknowledged?'acknowledged':'awaiting_ack',acknowledged_at:acknowledged?'2026-09-19T10:01:00+00:00':null});
    const signedResponse=(input,data,statusCode=200)=>{
        const rawBody=JSON.stringify({success:true,data}),requestPath=new URL(input.url).pathname;
        const nonce=transport.getHeader(input.headers,transport.NONCE_HEADER),timestamp=transport.getHeader(input.headers,transport.TIMESTAMP_HEADER);
        const canonical=['v1-response',String(statusCode),requestPath,'127.0.0.1',connection.id,connection.key_id,timestamp,nonce,transport.sha256Hex(rawBody)].join('\n');
        return{statusCode,rawBody,headers:{[transport.CONNECTION_HEADER]:connection.id,[transport.KEY_ID_HEADER]:connection.key_id,
            [transport.REQUEST_TIMESTAMP_HEADER]:timestamp,[transport.REQUEST_NONCE_HEADER]:nonce,[transport.RESPONSE_SIGNATURE_HEADER]:`sha256=${crypto.createHmac('sha256',secret).update(canonical).digest('hex')}`}};
    };
    const worker=(send,maxAttempts=3)=>delivery.createThemeDeliveryWorker({database:pool,runtime,send,maxAttempts});
    const inboxCount=async item=>Number((await pool.query('SELECT count(*)::int AS n FROM theme_inbox WHERE event_id=$1',[item.eventId])).rows[0].n);
    let transient,transientWorker,calls=0,ackItem,ackWorker,ackCalls=[];
    await gate('R01 disabled worker leaves durable pending event and attempts unchanged',async()=>{
        transient=await seed();const disabled=delivery.createThemeDeliveryWorker({database:pool,runtime:{...runtime,workerEnabled:false},send:async()=>{throw Error('Must not send');}});
        assert.equal((await disabled.tick()).state,'DISABLED');assert.equal((await state(transient)).attempts,0);
    });
    await gate('R02 first network failure releases lease and schedules 30-second retry',async()=>{
        transientWorker=worker(async()=>{calls++;throw Error('Explicit transport failure');});
        assert.equal((await transientWorker.tick()).state,'RETRY_PENDING');const row=await state(transient);
        assert.equal(row.status,'DELIVERY_PENDING');assert.equal(row.outbox_status,'PENDING');assert.equal(row.attempts,1);assert.equal(row.lease_token,null);
        assert(Number(row.delay_seconds)>28&&Number(row.delay_seconds)<=30);assert.equal(row.receipt,null);assert.equal(await inboxCount(transient),0);
    });
    await gate('R03 backoff prevents early retries and doubles to 60 seconds',async()=>{
        assert.equal((await transientWorker.tick()).state,'IDLE');assert.equal(calls,1);
        await due(transient);assert.equal((await transientWorker.tick()).state,'RETRY_PENDING');const row=await state(transient);
        assert.equal(row.attempts,2);assert(Number(row.delay_seconds)>58&&Number(row.delay_seconds)<=60);
    });
    await gate('R04 exhausted delivery becomes REJECTED and DEAD without fabricated receipt',async()=>{
        await due(transient);assert.equal((await transientWorker.tick()).state,'REJECTED');const row=await state(transient);
        assert.equal(row.outbox_status,'DEAD');assert.equal(row.status,'REJECTED');assert.equal(row.attempts,3);assert.equal(row.receipt,null);assert.equal(row.result_id,null);assert.equal(await inboxCount(transient),0);
        await due(transient);assert.equal((await transientWorker.tick()).state,'IDLE');assert.equal(calls,3);
    });
    await gate('R05 lost ACK retains actual durable local receipt and retries ACK path only',async()=>{
        ackItem=await seed();ackWorker=worker(async input=>{const path=new URL(input.url).pathname;ackCalls.push(path);if(path.endsWith('/receipt'))throw Error('Explicit lost ACK');return signedResponse(input,receipt(ackItem),201);},2);
        assert.equal((await ackWorker.tick()).state,'RETRY_PENDING');const row=await state(ackItem);
        assert.equal(row.status,'DELIVERED');assert.equal(row.outbox_status,'DELIVERED');assert.deepEqual(row.receipt,receipt(ackItem));assert.equal(await inboxCount(ackItem),1);assert.equal(row.acknowledged_at,null);
    });
    await gate('R06 exhausted ACK is ACK_BLOCKED with DELIVERED receipt preserved and outbox DEAD',async()=>{
        const before=await state(ackItem);await due(ackItem);assert.equal((await ackWorker.tick()).state,'ACK_BLOCKED');const after=await state(ackItem);
        assert.equal(after.status,'DELIVERED');assert.equal(after.outbox_status,'DEAD');assert.deepEqual(after.receipt,before.receipt);assert.equal(after.delivered_at.toISOString(),before.delivered_at.toISOString());assert.equal(after.receipt_hash,before.receipt_hash);assert.equal(after.acknowledged_at,null);
        assert.equal(ackCalls.filter(path=>path===transport.THEME_EVENT_PATH).length,1);assert.equal(ackCalls.filter(path=>path.endsWith('/receipt')).length,2);assert.equal(await inboxCount(ackItem),1);
        await due(ackItem);assert.equal((await ackWorker.tick()).state,'IDLE');assert.equal(ackCalls.length,3);
    });
    await gate('R07 malformed or wrong HMAC response cannot create any receipt',async()=>{
        for(const signature of ['not-a-signature',`sha256=${'0'.repeat(64)}`]){
            const item=await seed();const runtimeWorker=worker(async input=>{const response=signedResponse(input,receipt(item),201);response.headers[transport.RESPONSE_SIGNATURE_HEADER]=signature;return response;},1);
            const result=await runtimeWorker.tick();assert.equal(result.state,'REJECTED');assert.equal(result.code,'STOCKY_CONNECTOR_RESPONSE_SIGNATURE_INVALID');assert.equal((await state(item)).receipt,null);assert.equal(await inboxCount(item),0);
        }
    });
    await gate('R08 signed permanent delivery HTTP rejection terminates immediately below maxAttempts',async()=>{
        const item=await seed(),result=await worker(input=>Promise.resolve(signedResponse(input,{code:'OWNED_TEST_REJECTED'},422)),8).tick();
        assert.equal(result.state,'REJECTED');assert.equal((await state(item)).attempts,1);assert.equal((await state(item)).outbox_status,'DEAD');assert.equal(await inboxCount(item),0);
    });
    await gate('R09 signed permanent ACK rejection keeps delivered receipt even on first attempt',async()=>{
        const item=await seed(),runtimeWorker=worker(input=>Promise.resolve(signedResponse(input,receipt(item),new URL(input.url).pathname.endsWith('/receipt')?403:201)),8);
        assert.equal((await runtimeWorker.tick()).state,'ACK_BLOCKED');const row=await state(item);assert.equal(row.attempts,1);assert.equal(row.status,'DELIVERED');assert.equal(row.outbox_status,'DEAD');assert.equal(await inboxCount(item),1);
    });
    await gate('R10 signed foreign receipt identity is terminal and never durable',async()=>{
        const item=await seed(),runtimeWorker=worker(input=>Promise.resolve(signedResponse(input,{...receipt(item),store_id:'foreign-store'},201)),8);
        const result=await runtimeWorker.tick();assert.equal(result.state,'REJECTED');assert.equal(result.code,'THEME_DELIVERY_RECEIPT_IDENTITY');assert.equal(await inboxCount(item),0);
    });
    await gate('R11 bounded backoff caps at one hour without sleeping or auto retry loop',async()=>{
        const item=await seed();await pool.query('UPDATE theme_outbox SET attempts=7 WHERE id=$1',[item.eventId]);
        const runtimeWorker=worker(async()=>{throw Error('Explicit cap check');},9);assert.equal((await runtimeWorker.tick()).state,'RETRY_PENDING');const row=await state(item);
        assert.equal(row.attempts,8);assert(Number(row.delay_seconds)>3598&&Number(row.delay_seconds)<=3600);
        await due(item);assert.equal((await runtimeWorker.tick()).state,'REJECTED');assert.equal((await state(item)).attempts,9);
    });
    await gate('R12 concurrent workers do not send a claimed event twice before lease expiry',async()=>{
        const item=await seed();let release,entered;const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});let sent=0;
        const runtimeWorker=worker(async()=>{sent++;entered();await held;throw Error('Explicit held failure');},1);
        const first=runtimeWorker.tick();await started;assert.equal((await runtimeWorker.tick()).state,'IDLE');release();assert.equal((await first).state,'REJECTED');assert.equal(sent,1);assert.equal((await state(item)).attempts,1);
    });
    await gate('R13 recovery before maxAttempts confirms receipt once without duplicate inbox',async()=>{
        const item=await seed();let sent=0;
        const runtimeWorker=worker(async input=>{sent++;if(sent===1)throw Error('Explicit one-time failure');return signedResponse(input,receipt(item,new URL(input.url).pathname.endsWith('/receipt')),200);});
        assert.equal((await runtimeWorker.tick()).state,'RETRY_PENDING');await due(item);assert.equal((await runtimeWorker.tick()).state,'RECEIPT_CONFIRMED');
        const row=await state(item);assert.equal(row.attempts,2);assert.equal(row.status,'RECEIPT_CONFIRMED');assert.equal(await inboxCount(item),1);assert(row.acknowledged_at);assert.equal(row.lease_token,null);
    });
    await gate('R14 retry policy rejects unbounded or nonintegral limits before claiming',async()=>{
        for(const limit of [0,-1,101,1.5,Infinity])assert.throws(()=>worker(async()=>{},limit),e=>e.code==='THEME_INVALID_INTEGER');
        assert.equal((await worker(async()=>{throw Error('No pending event expected');}).tick()).state,'IDLE');
    });
    db.originalConsole.log(JSON.stringify({result:'PASS',pass:gates.length,fail:0,skip:0,gates,postgresVersion:db.postgresVersion,migrations:db.migrations.length,
        testDoubles:['fault transport','signed response bodies generated in-process; not actual Stocky receiver'],fixtureAuthority:'explicit historical accepted assignment/outbox seed; no READY mutation',
        actual:['PostgreSQL constraints and durable state','worker backoff and terminal transitions','HMAC response verifier','concurrent claim lock'],signedStockyReceiverAcceptance:false,productionWrites:0,seededEvents:seeded.length}));
})().catch(error=>{(db?.originalConsole||console).error(db?db.redact(error.stack):error.stack);process.exitCode=1;}).finally(async()=>{if(db)await db.cleanup();});
