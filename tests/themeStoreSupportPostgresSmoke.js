'use strict';
// Actual owned PostgreSQL/HTTP/authentication. Only active publication readiness
// is a named test double. No provider, push-delivery or browser claim.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const http=require('node:http');
const express=require('express');
const startDisposable=require('./helpers/themePlatformDisposableDb');
const {seedWave2}=require('./helpers/themePlatformWave2Fixtures');
const gates=[];let db,server;
const gate=async(name,run)=>{try{await run();gates.push({name,status:'PASS'});db.originalConsole.log(`PASS ${name}`);}
    catch(error){gates.push({name,status:'FAIL'});throw new Error(`${name}: ${error.stack||error.message}`);}};
(async()=>{
    db=await startDisposable();const {pool}=db,fixture=await seedWave2(pool,db.sensitive);
    const {admin,support,themeAdmin,a,b,viewer,storeA,storeB}=fixture;
    assert(db.migrations.includes('20260919_wave2_zzsupport_routing'));
    const versionId=crypto.randomUUID(),themeId=crypto.randomUUID(),document={schemaVersion:1,tokens:{},assetIds:[],components:[]};
    await pool.query("INSERT INTO themes(id,slug,name) VALUES($1,'support-fixture','Support fixture')",[themeId]);
    await pool.query("INSERT INTO theme_versions(id,theme_id,version,status,document,digest) VALUES($1,$2,'1','PUBLISHED',$3,$4)",[versionId,themeId,document,require('../services/themePlatformValidation').digest(document)]);
    for(const [store,host]of [[storeA,'support-a.test'],[storeB,'support-b.test']]){
        store.serviceId=crypto.randomUUID();store.host=host;const assignmentId=crypto.randomUUID();
        await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro')",[store.serviceId,store.org,store.id]);
        await pool.query("INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel,commerce_mode,status,accepted_at) VALUES($1,$2,$3,$4,$5,'web','SINGLE_STORE','ACCEPTED',NOW())",[assignmentId,store.serviceId,store.org,store.id,versionId]);
        await pool.query("INSERT INTO theme_domain_bindings(id,hostname,service_id,organization_id,store_id,assignment_id,status,verified_at,verification_reference) VALUES($1,$2,$3,$4,$5,$6,'VERIFIED',NOW(),'owned-test-not-dns')",[crypto.randomUUID(),host,store.serviceId,store.org,store.id,assignmentId]);
    }
    const auth=require('../middlewares/authMiddleware');
    const sellerAuth=require('../middlewares/sellerAuthMiddleware').createSellerAuthMiddleware({verifyAccessToken:fixture.tokenService.verify});
    const tenant=require('../middlewares/sellerTenantContext').createSellerTenantContextMiddleware();
    const runtimeAuthority=async(_client,scope)=>({enabled:true,contractVersion:2,storeId:Number(scope.legacy_store_id)});
    const app=express();app.use(express.json({limit:'32kb'}));app.locals.sellerDatabase=pool;
    app.use(require('../services/themePlatformCommerceService').createThemeStorefrontHostGuard({database:pool,enabled:true,trustedPlatformHosts:['localhost','127.0.0.1']}));
    app.use('/api/theme-storefront',require('../routes/themeStorefrontRoutes').createThemeStorefrontRouter({database:pool,enabled:true,customerRuntimeAuthority:runtimeAuthority}));
    app.use('/api/admin/theme-platform',require('../routes/themePlatformRoutes').createAdminThemeRouter({database:pool,enabled:true}));
    app.use('/api/seller/v1/theme-platform',require('../routes/themePlatformRoutes').createSellerThemeRouter({database:pool,enabled:true,auth:sellerAuth,tenant}));
    app.use((_req,res)=>res.status(404).json({code:'NOT_FOUND'}));
    server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
    const customer=async(label)=>{
        const password=crypto.randomBytes(20).toString('base64url');db.sensitive.add(password);
        const userId=Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,$3,'customer',TRUE) RETURNING id",[label,`${label}@example.test`,await require('bcrypt').hash(password,10)])).rows[0].id);
        const session=await require('../services/authSessionService').issueAccessSession({queryable:pool,userId,role:'customer',principal:'customer'});db.sensitive.add(session.token);return{...session,userId};
    };
    const alice=await customer('support-customer-a'),bob=await customer('support-customer-b');
    const oldThread=Number((await pool.query('INSERT INTO support_threads(customer_id) VALUES($1) RETURNING id',[alice.userId])).rows[0].id);
    await pool.query('INSERT INTO messages(support_thread_id,sender_id,receiver_id,message) VALUES($1,$2,$3,$4)',[oldThread,alice.userId,admin.userId,'OLD PLATFORM PRIVATE SUPPORT SECRET']);
    const request=(path,{actor=alice,host=storeA.host,method='GET',body,headers={}}={})=>new Promise((resolve,reject)=>{
        const encoded=body===undefined?undefined:JSON.stringify(body);
        const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{host,...(actor?{authorization:`Bearer ${actor.token}`}:{ }),...headers,...(encoded===undefined?{}:{'content-type':'application/json','content-length':Buffer.byteLength(encoded)})}},res=>{
            let text='';res.setEncoding('utf8');res.on('data',part=>text+=part);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text),headers:res.headers});}catch(e){reject(e);}});
        });req.on('error',reject);req.end(encoded);
    });
    const ok=(r,status=200)=>{assert.equal(r.status,status,`${r.status}: ${r.body.code||r.body.error}`);return r.body;};
    const cp='/api/theme-storefront/customer/support';
    const customerApi=(path='',options)=>request(cp+path,options);
    const operatorApi=(actor,path='',options={})=>request(`/api/${[admin,support,themeAdmin].includes(actor)?'admin':'seller/v1'}/theme-platform/services/${options.serviceId||storeA.serviceId}/support${path}`,{...options,actor,host:'localhost'});
    const body=(text='Müşteri test mesajı')=>({body:text,clientMessageId:crypto.randomUUID()});
    const create=async(subject='Teslimat sorusu',options={})=>ok(await customerApi('/threads',{method:'POST',body:{subject,...body(),...(options.body||{})},...options}));
    const legacyCount=async()=>(await pool.query('SELECT (SELECT count(*)::int FROM support_threads) AS platform,(SELECT count(*)::int FROM seller_support_messages) AS seller,(SELECT count(*)::int FROM notifications) AS notifications')).rows[0];
    const beforeLegacy=await legacyCount();let first,foreign,platform,firstPayload,reply;
    await gate('T01 default recipient is server-owned SELLER and guest/admin rejected',async()=>{
        const context=ok(await customerApi('/context'));assert.deepEqual(context,{enabled:true,recipient:'SELLER',label:'Mağaza desteği',externalNotifications:false});
        ok(await customerApi('/context',{actor:null}),401);ok(await customerApi('/context',{actor:admin}),401);ok(await customerApi('/context?recipient=PLATFORM'),400);
        ok(await customerApi('/context',{host:'unknown.test',headers:{'x-forwarded-host':storeA.host}}),421);
    });
    await gate('T02 create durable customer thread and first message with atomic replay',async()=>{
        firstPayload={subject:'Siparişim hakkında',...body()};first=ok(await customerApi('/threads',{method:'POST',body:firstPayload}));
        assert.equal(first.thread.recipient,'SELLER');assert.equal(first.message.senderKind,'CUSTOMER');assert.equal(first.reused,false);
        const replay=ok(await customerApi('/threads',{method:'POST',body:firstPayload}));assert.equal(replay.thread.id,first.thread.id);assert.equal(replay.message.id,first.message.id);assert.equal(replay.reused,true);
        ok(await customerApi('/threads',{method:'POST',body:{...firstPayload,body:'Changed'}}),409);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM theme_store_support_messages')).rows[0].n,1);
    });
    await gate('T03 customer cannot select tenant recipient or operator identity',async()=>{
        for(const extra of [{recipient:'PLATFORM'},{storeId:storeB.id},{senderKind:'ADMIN'},{customerId:bob.userId}])ok(await customerApi('/threads',{method:'POST',body:{subject:'forged',...body(),...extra}}),400);
        ok(await customerApi('/threads',{method:'POST',body:{subject:'blank',...body('   ')}}),400);
        ok(await customerApi('/threads',{method:'POST',body:{subject:'oversized',...body('a'.repeat(5001))}}),400);
    });
    await gate('T04 store and customer isolation precede every thread read/write',async()=>{
        foreign=await create('Başka mağaza',{host:storeB.host});
        for(const options of [{actor:bob},{host:storeB.host}]){
            ok(await customerApi(`/threads/${first.thread.id}`,options),404);
            ok(await customerApi(`/threads/${first.thread.id}/messages`,{...options,method:'POST',body:body()}),404);
            ok(await customerApi(`/threads/${first.thread.id}/read`,{...options,method:'POST',body:{throughMessageId:first.message.id}}),404);
        }
        assert.deepEqual(ok(await customerApi('/threads',{actor:bob})).threads,[]);
        assert.deepEqual(ok(await customerApi('/threads')).threads.map(r=>r.id),[first.thread.id]);
    });
    await gate('T05 actual Seller inbox sees only canonical assigned-store customer threads',async()=>{
        const inbox=ok(await operatorApi(a,'/threads'));assert.deepEqual(inbox.threads.map(r=>r.id),[first.thread.id]);assert.equal(inbox.threads[0].unreadCount,1);
        ok(await operatorApi(b,`/threads/${first.thread.id}`),404);ok(await operatorApi(viewer,'/threads'),403);
        ok(await operatorApi(admin,`/threads/${first.thread.id}`),404);assert.deepEqual(ok(await operatorApi(support,'/threads')).threads,[]);
    });
    await gate('T06 Seller reply persists exactly once and customer unread is truthful',async()=>{
        const payload=body('Mağazamızdan yanıt');reply=ok(await operatorApi(a,`/threads/${first.thread.id}/messages`,{method:'POST',body:payload}));
        assert.equal(reply.message.senderKind,'SELLER');assert.equal(ok(await operatorApi(a,`/threads/${first.thread.id}/messages`,{method:'POST',body:payload})).reused,true);
        const detail=ok(await customerApi(`/threads/${first.thread.id}`));assert.equal(detail.thread.unreadCount,1);assert.equal(detail.messages.length,2);assert.equal(detail.messages[1].body,payload.body);
        assert(!JSON.stringify(detail).includes('sender_user_id'));assert(!JSON.stringify(detail).includes('organization_id'));
    });
    await gate('T07 read cursor is monotonic scoped and cannot acknowledge foreign messages',async()=>{
        ok(await customerApi(`/threads/${first.thread.id}/read`,{method:'POST',body:{throughMessageId:foreign.message.id}}),404);
        const read=ok(await customerApi(`/threads/${first.thread.id}/read`,{method:'POST',body:{throughMessageId:reply.message.id}}));assert.equal(read.thread.unreadCount,0);
        const old=ok(await customerApi(`/threads/${first.thread.id}/read`,{method:'POST',body:{throughMessageId:first.message.id}}));assert.equal(old.thread.unreadCount,0);
        assert.equal(ok(await operatorApi(a,`/threads/${first.thread.id}/read`,{method:'POST',body:{throughMessageId:first.message.id}})).thread.unreadCount,0);
    });
    await gate('T08 close/reopen has CAS and cannot accept a new message while closed',async()=>{
        const current=ok(await customerApi(`/threads/${first.thread.id}`)).thread;
        const closed=ok(await customerApi(`/threads/${first.thread.id}/state`,{method:'PATCH',body:{status:'CLOSED',expectedRevision:current.revision}}));
        ok(await customerApi(`/threads/${first.thread.id}/messages`,{method:'POST',body:body()}),409);
        ok(await operatorApi(a,`/threads/${first.thread.id}/state`,{method:'PATCH',body:{status:'OPEN',expectedRevision:current.revision}}),409);
        assert.equal(ok(await operatorApi(a,`/threads/${first.thread.id}/state`,{method:'PATCH',body:{status:'OPEN',expectedRevision:closed.thread.revision}})).thread.status,'OPEN');
    });
    await gate('T09 only live super_admin may approve platform recipient with CAS audit',async()=>{
        const policy={recipient:'PLATFORM',expectedRevision:0,reason:'Owned routing test'};
        assert.deepEqual(ok(await operatorApi(admin,'/policy')),{recipient:'SELLER',revision:0});ok(await operatorApi(support,'/policy'),403);
        ok(await operatorApi(a,'/policy',{method:'PUT',body:policy}),404);
        ok(await operatorApi(support,'/policy',{method:'PUT',body:policy}),403);ok(await operatorApi(themeAdmin,'/policy',{method:'PUT',body:policy}),403);
        const saved=ok(await operatorApi(admin,'/policy',{method:'PUT',body:policy}));assert.equal(saved.revision,1);
        ok(await operatorApi(admin,'/policy',{method:'PUT',body:policy}),409);
        assert.equal(ok(await customerApi('/context')).recipient,'PLATFORM');
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM theme_audit_events WHERE action='theme.support.routing.changed'")).rows[0].n,1);
    });
    await gate('T10 changing routing never relabels previous threads or exposes platform messages to Seller',async()=>{
        platform=await create('Platform yardımı');assert.equal(platform.thread.recipient,'PLATFORM');
        assert.equal(ok(await customerApi(`/threads/${first.thread.id}`)).thread.recipient,'SELLER');
        assert.deepEqual(ok(await operatorApi(a,'/threads')).threads.map(r=>r.id),[first.thread.id]);
        ok(await operatorApi(a,`/threads/${platform.thread.id}`),404);
        assert.deepEqual(ok(await operatorApi(support,'/threads')).threads.map(r=>r.id),[platform.thread.id]);
        assert.equal(ok(await operatorApi(support,`/threads/${platform.thread.id}/messages`,{method:'POST',body:body('Nova Store yanıtı')})).message.senderKind,'ADMIN');
        ok(await operatorApi(themeAdmin,`/threads/${platform.thread.id}/messages`,{method:'POST',body:body()}),403);
    });
    await gate('T11 immutable DB identity/history rejects recipient owner and message edits',async()=>{
        await assert.rejects(pool.query("UPDATE theme_store_support_threads SET recipient='PLATFORM' WHERE id=$1",[first.thread.id]));
        await assert.rejects(pool.query('UPDATE theme_store_support_threads SET customer_id=$2 WHERE id=$1',[first.thread.id,bob.userId]));
        await assert.rejects(pool.query("UPDATE theme_store_support_messages SET body='edited' WHERE id=$1",[first.message.id]));
        await assert.rejects(pool.query('DELETE FROM theme_store_support_messages WHERE id=$1',[first.message.id]));
    });
    await gate('T12 concurrent same idempotency key inserts one durable response',async()=>{
        const payload=body('Eşzamanlı yanıt'),url=`/threads/${first.thread.id}/messages`;
        const results=await Promise.all([operatorApi(a,url,{method:'POST',body:payload}),operatorApi(a,url,{method:'POST',body:payload})]);
        results.forEach(r=>ok(r));assert.equal(results[0].body.message.id,results[1].body.message.id);assert.deepEqual(results.map(r=>r.body.reused).sort(),[false,true]);
    });
    await gate('T15 full router mount exposes no previous global platform conversation',async()=>{
        for(const response of [await customerApi('/threads'),await customerApi(`/threads/${first.thread.id}`),await operatorApi(a,'/threads'),await operatorApi(support,'/threads')]){
            ok(response);assert(!JSON.stringify(response.body).includes('OLD PLATFORM PRIVATE SUPPORT SECRET'));
        }
        assert.equal((await pool.query('SELECT message FROM messages WHERE support_thread_id=$1',[oldThread])).rows[0].message,'OLD PLATFORM PRIVATE SUPPORT SECRET');
        ok(await customerApi(`/threads/${oldThread}`),400);
    });
    await gate('T16 support cannot bypass missing actual publication runtime authority',async()=>{
        const service=require('../services/themeStoreSupportService').createThemeStoreSupportService({database:pool});
        await assert.rejects(service.customerAction({headers:{host:storeA.host}},'context'),e=>e.code==='THEME_CUSTOMER_RUNTIME_NOT_ACTIVE');
    });
    await gate('T17 bounded message cursor returns correct next page without exposing another thread',async()=>{
        // Seed only extra historical rows; public pagination reads real DB data.
        for(let i=0;i<101;i+=1)await pool.query(`INSERT INTO theme_store_support_messages(thread_id,service_id,organization_id,store_id,sender_kind,sender_user_id,body,client_message_id,request_hash)
            VALUES($1,$2,$3,$4,'CUSTOMER',$5,$6,$7,$8)`,[first.thread.id,storeA.serviceId,storeA.org,storeA.id,alice.userId,`History ${i}`,crypto.randomUUID(),'a'.repeat(64)]);
        const one=ok(await customerApi(`/threads/${first.thread.id}`));assert.equal(one.messages.length,100);assert.equal(one.nextAfter,one.messages[99].id);
        const two=ok(await customerApi(`/threads/${first.thread.id}?after=${one.nextAfter}`));assert(two.messages.length>0);assert.equal(two.nextAfter,null);assert(two.messages.every(row=>row.id>one.nextAfter));
        assert.deepEqual(ok(await operatorApi(a,`/threads/${first.thread.id}/after/${one.nextAfter}`)).messages,two.messages);
        ok(await customerApi(`/threads/${first.thread.id}?after=-1`),400);ok(await customerApi(`/threads/${first.thread.id}?after=1&storeId=${storeB.id}`),400);
    });
    await gate('T13 revoked live authorization is checked before idempotency replay',async()=>{
        await pool.query("UPDATE seller_sessions SET status='revoked' WHERE id=$1",[a.sessionId]);
        ok(await operatorApi(a,`/threads/${first.thread.id}/messages`,{method:'POST',body:body()}),401);
        await pool.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[alice.sessionId]);
        ok(await customerApi('/threads',{method:'POST',body:firstPayload}),401);
        await pool.query('UPDATE theme_admin_roles SET active=FALSE WHERE user_id=$1',[admin.userId]);
        ok(await operatorApi(admin,'/policy',{method:'PUT',body:{recipient:'SELLER',expectedRevision:1,reason:'Must not apply'}}),403);
    });
    await gate('T14 no global inbox or notification duplication and external delivery remains unclaimed',async()=>{
        assert.deepEqual(await legacyCount(),beforeLegacy);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM theme_store_support_threads')).rows[0].n,3);
        assert.equal((await operatorApi(support,'/threads')).headers['cache-control'],'private, no-store');
    });
    db.originalConsole.log(JSON.stringify({result:'PASS',pass:gates.length,fail:0,skip:0,gates,postgresVersion:db.postgresVersion,migrations:db.migrations.length,
        testDoubles:['active publication runtime authority only'],real:['Host mapping','customer and operator sessions','store ownership','durable messages','inbox routing','CAS','idempotency','unread cursors'],externalDelivery:false,browserAcceptance:false,productionWrites:0}));
})().catch(e=>{(db?.originalConsole||console).error(db?db.redact(e.stack):e.stack);process.exitCode=1;})
.finally(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.cleanup();});
