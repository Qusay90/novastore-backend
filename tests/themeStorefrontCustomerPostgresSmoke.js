'use strict';

// Actual scoped HTTP/controllers/authentication/PostgreSQL. The only runtime
// activation authority is an EXPLICIT TEST DOUBLE, not a verified publication.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const express=require('express');
const http=require('node:http');
const startDisposable=require('./helpers/themePlatformDisposableDb');
const {seedVariantCartV2}=require('./helpers/variantCartV2Fixture');
const caps={'X-Cart-Schema-Version':'2','X-Cart-Variant-Line-Identity':'true','X-Cart-CAS':'true'};
const gates=[];let db,server;
const gate=async(name,run)=>{try{await run();gates.push({name,status:'PASS'});db.originalConsole.log(`PASS ${name}`);}
    catch(error){gates.push({name,status:'FAIL'});throw new Error(`${name}: ${error.stack||error.message}`);}};
(async()=>{
    db=await startDisposable();const{pool}=db;
    const loginPassword=`Owned-QA-${crypto.randomBytes(12).toString('base64url')}!`;db.sensitive.add(loginPassword);
    const fixture=await seedVariantCartV2(pool,db.sensitive,{loginPassword});const{a,b,alice,bob,createCustomer,createOrder}=fixture;
    const themeId=crypto.randomUUID(),versionId=crypto.randomUUID();
    const document={schemaVersion:1,tokens:{},assetIds:[],components:[]};
    await pool.query("INSERT INTO themes(id,slug,name) VALUES($1,'scoped-customer-test','Scoped customer fixture')",[themeId]);
    await pool.query("INSERT INTO theme_versions(id,theme_id,version,status,document,digest) VALUES($1,$2,'1','PUBLISHED',$3,$4)",[versionId,themeId,document,require('../services/themePlatformValidation').digest(document)]);
    for(const[store,name]of[[a,'store-a'],[b,'store-b']]){
        store.host=`${name}.test`;store.serviceId=crypto.randomUUID();store.assignmentId=crypto.randomUUID();
        await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro')",[store.serviceId,store.organizationId,store.sellerStoreId]);
        await pool.query("INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel,commerce_mode,status,accepted_at) VALUES($1,$2,$3,$4,$5,'web','SINGLE_STORE','ACCEPTED',NOW())",[store.assignmentId,store.serviceId,store.organizationId,store.sellerStoreId,versionId]);
        await pool.query("INSERT INTO theme_domain_bindings(id,hostname,service_id,organization_id,store_id,assignment_id,status,verified_at,verification_reference) VALUES($1,$2,$3,$4,$5,$6,'VERIFIED',NOW(),'explicit-disposable-not-dns')",[crypto.randomUUID(),store.host,store.serviceId,store.organizationId,store.sellerStoreId,store.assignmentId]);
    }
    const adminId=Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES('Scoped Admin','scoped-admin@example.test','unused','admin',TRUE) RETURNING id")).rows[0].id);
    const admin=await fixture.auth.issueAccessSession({queryable:pool,userId:adminId,role:'admin',principal:'admin'});db.sensitive.add(admin.token);
    const app=express();app.use(express.json());
    const commerce=require('../services/themePlatformCommerceService'),routes=require('../routes/themeStorefrontRoutes');
    app.use(commerce.createThemeStorefrontHostGuard({database:pool,enabled:true,trustedPlatformHosts:['127.0.0.1','localhost']}));
    app.use('/api/shared-state',require('../routes/sharedStateRoutes'));
    let runtimeEnabled=true;
    app.use('/api/theme-storefront',routes.createThemeStorefrontRouter({database:pool,enabled:true,
        customerRuntimeAuthority:async(_client,scope)=>({enabled:runtimeEnabled,contractVersion:2,storeId:Number(scope.legacy_store_id),evidence:'EXPLICIT_TEST_DOUBLE'})}));
    app.use('/disabled',routes.createThemeStorefrontRouter({database:pool,enabled:true}));
    app.use((_req,res)=>res.status(404).json({code:'RESOURCE_NOT_FOUND'}));
    server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
    const request=async(route='cart',{store=a,user=alice,method='GET',body,headers={},capability=caps,fullPath}={})=>new Promise((resolve,reject)=>{
        const encoded=body===undefined?undefined:JSON.stringify(body);
        const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:fullPath||`/api/theme-storefront/customer/${route}`,method,
            headers:{host:store?.host||'localhost',...(user?{authorization:`Bearer ${user.token}`}:{ }),...capability,...headers,...(encoded!==undefined?{'content-type':'application/json','content-length':Buffer.byteLength(encoded)}:{})}},res=>{
            let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;});res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text),headers:res.headers});}catch(error){reject(error);}});
        });req.on('error',reject);req.end(encoded);
    });
    const ok=(response,status=200,code)=>{assert.equal(response.status,status,`HTTP ${response.status}: ${response.body.code||response.body.error||'unexpected response'}`);if(code)assert.equal(response.body.code,code);return response.body;};
    const global=(route='cart',options={})=>request(route,{...options,store:null,fullPath:`/api/shared-state/${route}`});
    const get=async(store=a,user=alice,key='cart')=>ok(await request(key,{store,user}));
    const globalGet=async(user=alice,key='cart')=>ok(await global(key,{user}));
    const line=(variantId=901,quantity=1)=>({productId:variantId===903?601:501,variantId,quantity});
    const put=(items,revision,{store=a,user=alice,key='cart',...extra}={})=>request(key,{store,user,method:'PUT',body:{expectedRevision:revision,payload:{cartSchemaVersion:2,items},...extra}});
    const globalPut=async(items,user=alice,key='cart')=>ok(await global(key,{user,method:'PUT',body:{expectedRevision:(await globalGet(user,key)).revision,payload:{cartSchemaVersion:2,items}}}));
    const variants=state=>state.payload.items.map(row=>row.variantId).sort();
    const snapshot=async user=>(await pool.query('SELECT state_key,payload,cart_schema_version,revision FROM user_shared_state WHERE user_id=$1 ORDER BY state_key',[user.userId])).rows;
    await gate('S01 missing publication authority fails closed before customer API',async()=>{
        // Separate ordinary router; host guard prefix above would intentionally
        // reject /disabled on custom domains, so call service directly here.
        const service=require('../services/themeStorefrontCustomerService').createThemeStorefrontCustomerService({database:pool});
        await assert.rejects(service.transaction({headers:{host:a.host}},()=>null),e=>e.code==='THEME_CUSTOMER_RUNTIME_NOT_ACTIVE');
        const wrong=require('../services/themeStorefrontCustomerService').createThemeStorefrontCustomerService({database:pool,runtimeAuthority:async()=>({enabled:true,contractVersion:2,storeId:b.storeId})});
        await assert.rejects(wrong.transaction({headers:{host:a.host}},()=>null),e=>e.code==='THEME_CUSTOMER_RUNTIME_NOT_ACTIVE');
    });
    await gate('S02 signed-out and Admin sessions cannot use customer cart',async()=>{
        ok(await request('cart',{user:null}),401);ok(await request('cart',{user:admin}),401);
        ok(await request('cart',{headers:{'x-forwarded-host':b.host},store:{host:'unknown.test'}}),421);
    });
    await gate('S03 ordinary customer login and me retain existing canonical auth',async()=>{
        const response=await request('users/login',{user:null,method:'POST',body:{email:alice.email,password:loginPassword}});
        if(response.body.token)db.sensitive.add(response.body.token);if(response.body.refreshToken)db.sensitive.add(response.body.refreshToken);
        ok(response);assert(response.body.token);const me=ok(await request('users/me',{user:{token:response.body.token}}));
        assert.equal(Number(me.id||me.user?.id),alice.userId);
    });
    await gate('S04 store GET projects own tuples with global account CAS revision',async()=>{
        const saved=await globalPut([line(901),line(902),line(903)]);
        const own=await get(),foreign=await get(b);assert.deepEqual(variants(own),[901,902]);assert.deepEqual(variants(foreign),[903]);assert.equal(own.revision,saved.revision);assert.equal(foreign.revision,saved.revision);
        assert(!JSON.stringify(own.payload.items).includes('601'));assert.equal((await request()).headers['cache-control'],'private, no-store');
    });
    await gate('S05 scoped PUT removes own sibling only and preserves foreign line',async()=>{
        const current=await get();const saved=ok(await put([line(902,2)],current.revision));assert.deepEqual(variants(saved),[902]);
        assert.deepEqual(variants(await globalGet()),[902,903]);assert.equal((await get(b)).payload.items[0].quantity,1);
    });
    await gate('S06 foreign product/variant/store forgery cannot mutate cart',async()=>{
        const current=await get(),before=await snapshot(alice);
        for(const item of [line(903),{...line(901),storeId:b.storeId},{productId:501,variantId:903,quantity:1}]){
            const response=await put([item],current.revision);assert.notEqual(response.status,200);
        }
        ok(await request(`cart?storeId=${b.storeId}`),400);assert.deepEqual(await snapshot(alice),before);
    });
    await gate('S07 cross-store concurrent same revision has one winner without line loss',async()=>{
        const current=await get();const results=await Promise.all([put([line(901),line(902)],current.revision),put([line(903,2)],current.revision,{store:b})]);
        assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(results.find(r=>r.status===409).body.code,'CART_REVISION_CONFLICT');
        const all=await globalGet();assert(all.payload.items.some(row=>row.variantId===902));assert(all.payload.items.some(row=>row.variantId===903));
    });
    await gate('S08 scoped DELETE retains foreign cart and global tombstone guard',async()=>{
        const before=await get(),foreign=(await get(b)).payload.items;
        ok(await request('cart',{method:'DELETE',body:{expectedRevision:before.revision}}));assert.deepEqual((await get()).payload.items,[]);assert.deepEqual((await get(b)).payload.items,foreign);
        ok(await global('cart',{capability:{},method:'DELETE'}),426,'CART_CLIENT_UPGRADE_REQUIRED');
    });
    await gate('S09 scoped checkout changes preserve other-store tuples',async()=>{
        await globalPut([line(901),line(903)],alice,'checkout');const checkout=await get(a,alice,'checkout');
        ok(await put([line(902)],checkout.revision,{key:'checkout'}));assert.deepEqual(variants(await globalGet(alice,'checkout')),[902,903]);
        ok(await request('checkout',{method:'DELETE',body:{expectedRevision:(await get(a,alice,'checkout')).revision}}));assert.deepEqual(variants(await globalGet(alice,'checkout')),[903]);
    });
    await gate('S10 every scoped legacy method requires V2 capability without mutation',async()=>{
        const before=await snapshot(alice);
        for(const key of ['cart','checkout'])for(const method of ['GET','PUT','DELETE'])ok(await request(key,{capability:{},method,...(method==='PUT'?{body:{payload:{version:1,items:[]}}}:{})}),426,'CART_CLIENT_UPGRADE_REQUIRED');
        assert.deepEqual(await snapshot(alice),before);
    });
    await gate('S11 scoped V1 migration preserves and hides foreign ambiguous lines',async()=>{
        const legacy=await createCustomer('scoped-legacy');const payload={version:1,items:[{productId:501,quantity:2,name:'A'},{productId:601,quantity:3,name:'B'},{productId:602,quantity:1,name:'B Simple'}]};
        const original=ok(await global('cart',{user:legacy,capability:{},method:'PUT',body:{payload}})).payload;
        const own=await get(a,legacy);assert.deepEqual(own.migration.unresolvedItems.map(row=>row.productId),[501]);assert.deepEqual(own.payload.items,[]);
        const saved=ok(await put([line(902,2)],own.revision,{user:legacy,resolveLegacyProductIds:[501]}));assert.equal(saved.migration.status,'NONE');
        const full=await globalGet(legacy);assert(full.payload.items.some(row=>row.productId===602));assert.deepEqual(full.migration.unresolvedItems.map(row=>row.productId),[601]);
        const before=await snapshot(legacy);ok(await put([],saved.revision,{user:legacy,resolveLegacyProductIds:[601]}),400,'CART_MIGRATION_RESOLUTION_INVALID');assert.deepEqual(await snapshot(legacy),before);
        const archive=(await pool.query("SELECT payload FROM user_shared_state_v1_archive WHERE user_id=$1 AND state_key='cart'",[legacy.userId])).rows;assert.equal(archive.length,1);assert.deepEqual(archive[0].payload,original);
    });
    let ownOrder,foreignOrder,mixedOrder,otherOrder;
    await gate('S12 canonical orders retain store identity and filter customer history',async()=>{
        ownOrder=await createOrder(alice.userId,[line(901)],{paid:true});foreignOrder=await createOrder(alice.userId,[line(903)],{paid:true});
        mixedOrder=await createOrder(alice.userId,[line(901),line(903)],{paid:true});otherOrder=await createOrder(bob.userId,[line(901)],{paid:true});
        const orders=ok(await request('orders'));assert.deepEqual(orders.map(row=>row.id),[Number(ownOrder.id)]);
        const own=ok(await request(`orders/${ownOrder.id}`));assert(own.items.every(item=>Number(item.store_id)===a.storeId));
        for(const order of [foreignOrder,mixedOrder,otherOrder])ok(await request(`orders/${order.id}`),404,'RESOURCE_NOT_FOUND');
    });
    await gate('S13 finalize paid own-store order consumes exact variant once only',async()=>{
        const saved=await globalPut([line(901,2),line(902),line(903,2)]);
        const finalized=ok(await request('cart/finalize',{method:'POST',body:{expectedRevision:saved.revision,orderId:Number(ownOrder.id)}}));assert.equal(finalized.payload.items.find(row=>row.variantId===901).quantity,1);
        const again=ok(await request('cart/finalize',{method:'POST',body:{expectedRevision:0,orderId:Number(ownOrder.id)}}));assert.equal(again.reused,true);
        const full=await globalGet();assert.equal(full.payload.items.find(row=>row.variantId===903).quantity,2);assert.equal(full.payload.items.find(row=>row.variantId===902).quantity,1);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM user_cart_finalizations WHERE user_id=$1 AND order_id=$2',[alice.userId,ownOrder.id])).rows[0].n,1);
    });
    await gate('S14 foreign-store mixed and other-account paid orders cannot finalize',async()=>{
        const before=await snapshot(alice),revision=(await get()).revision;
        for(const order of [foreignOrder,mixedOrder,otherOrder])ok(await request('cart/finalize',{method:'POST',body:{expectedRevision:revision,orderId:Number(order.id)}}),404,'CART_ORDER_NOT_FOUND');
        assert.deepEqual(await snapshot(alice),before);
    });
    await gate('S15 favorites stay scoped and foreign add/delete never execute',async()=>{
        ok(await request('favorites/501',{method:'POST',body:{}}));ok(await request('favorites/601',{store:b,method:'POST',body:{}}));
        assert.deepEqual(ok(await request('favorites')).productIds,[501]);assert.deepEqual(ok(await request('favorites',{store:b})).productIds,[601]);
        for(const method of ['POST','DELETE'])ok(await request('favorites/601',{method,body:{}}),404,'RESOURCE_NOT_FOUND');
        assert.deepEqual(ok(await request('favorites',{store:b})).productIds,[601]);ok(await request('favorites/501',{method:'DELETE',body:{}}));assert.deepEqual(ok(await request('favorites')).productIds,[]);
    });
    await gate('S16 agreement preview rejects cross-store cart before legal/payment service',async()=>{
        const response=await request('agreements/preview',{method:'POST',body:{cartItems:[{id:601,variant_id:903,quantity:1}]}});ok(response,404,'RESOURCE_NOT_FOUND');
        ok(await request('agreements/preview',{method:'POST',body:{cartItems:[{product_id:601,variant_id:903,quantity:1}]}}),404,'RESOURCE_NOT_FOUND');
        ok(await request('agreements/preview',{method:'POST',body:{cartItems:[{id:501,product_id:601,variant_id:903,quantity:1}]}}),400,'INVALID_REQUEST');
        ok(await request('agreements/preview',{method:'POST',body:{cartItems:[{id:501,quantity:1}],storeId:b.storeId}}),400,'INVALID_REQUEST');
    });
    await gate('S17 payment status foreign ownership cannot reach provider status projection',async()=>{
        for(const[order,label]of[[foreignOrder,'foreign'],[mixedOrder,'mixed'],[otherOrder,'other']]){
            const ref=`scoped-${label}-${crypto.randomUUID()}`;await pool.query('UPDATE orders SET payment_ref=$2 WHERE id=$1',[order.id,ref]);
            ok(await request(`payments/status?paymentRef=${ref}&orderId=${order.id}`),404,'RESOURCE_NOT_FOUND');
        }
        ok(await request('payments/status?paymentRef=missing&storeId=999'),400,'INVALID_REQUEST');
    });
    await gate('S18 foreign review and question requests cannot create records',async()=>{
        for(const route of ['questions','reviews'])ok(await request(route,{method:'POST',body:{productId:601,question:'Foreign attempt',comment:'Foreign attempt',rating:5}}),404,'RESOURCE_NOT_FOUND');
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_questions WHERE user_id=$1',[alice.userId])).rows[0].n,0);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM reviews WHERE user_id=$1',[alice.userId])).rows[0].n,0);
    });
    await gate('S19 payment activation remains blocked and scoped support exposes actual recipient',async()=>{
        assert.equal(ok(await request('payments/capability')).ready,false);
        assert.deepEqual(ok(await request('support/context')),{enabled:true,recipient:'SELLER',label:'Mağaza desteği',externalNotifications:false});
        ok(await request('anything-admin'),404);ok(await request('cart',{fullPath:'/api/products'}),404);ok(await request('cart',{fullPath:'/api/payments'}),404);
    });
    await gate('S20 forwarded host cannot change selected canonical store',async()=>{
        const state=ok(await request('cart',{headers:{'x-forwarded-host':b.host}}));assert(state.payload.items.every(row=>row.storeId===a.storeId));
        ok(await request('cart',{store:{host:'not-verified.test'}}),421);
    });
    await gate('S21 account switch and revoked session never reuse another cart',async()=>{
        assert.deepEqual((await get(a,bob)).payload.items,[]);const before=await snapshot(alice);
        await pool.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1',[bob.sessionId]);ok(await request('cart',{user:bob}),401);assert.deepEqual(await snapshot(alice),before);
    });
    await gate('S22 guest payment capability is safe public metadata only after verified host and runtime authority',async()=>{
        const before=await snapshot(alice);
        const capability=ok(await request('payments/capability',{user:null,capability:{}}));
        assert.deepEqual(capability,{ready:false,state:'theme_payment_activation_required',message:'Bu mağazada ödeme bağlantısı henüz etkinleştirilmedi.'});
        ok(await request('payments/capability?storeId=999',{user:null}),400,'INVALID_REQUEST');
        ok(await request('payments/capability',{user:null,store:{host:'unknown.test'},headers:{'x-forwarded-host':a.host}}),421,'HOST_NOT_CONFIGURED');
        runtimeEnabled=false;
        try{ok(await request('payments/capability',{user:null}),503,'THEME_CUSTOMER_RUNTIME_NOT_ACTIVE');}
        finally{runtimeEnabled=true;}
        for(const[route,method]of [['cart','PUT'],['cart','DELETE'],['cart/finalize','POST'],['favorites/501','POST'],['agreements/preview','POST'],['reviews','POST'],['questions','POST'],['support/threads','POST'],['payments/capability','POST'],['orders','GET'],['payments/status','GET']]) {
            ok(await request(route,{user:null,method,...(method!=='GET'?{body:{}}:{})}),401);
        }
        assert.deepEqual(await snapshot(alice),before);
    });
    await gate('S23 authenticated own-product reviews expose canonical Seller handoff without permitting writes',async()=>{
        const before=(await pool.query('SELECT count(*)::int AS n FROM reviews')).rows[0].n;
        const response=await request('products/501/reviews?limit=1&pagination=cursor');
        const data=ok(response);assert(Array.isArray(data.reviews));
        assert.deepEqual(data.reviewPermission,{canReview:false,requiresAuth:false,code:'SELLER_REVIEW_HANDOFF_REQUIRED',
            message:'Bu satıcı ürünü için değerlendirme iş akışı satıcı operasyonları açılana kadar kullanılamaz.'});
        assert.match(response.headers['cache-control'],/no-store/);
        ok(await request('reviews',{method:'POST',body:{productId:501,rating:5,comment:'Scoped write remains blocked'}}),403,'SELLER_REVIEW_HANDOFF_REQUIRED');
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM reviews')).rows[0].n,before);
    });
    await gate('S24 reviews require normal customer auth and foreign products have the same denial as unknown ones',async()=>{
        ok(await request('products/501/reviews',{user:null}),401);
        ok(await request('products/501/reviews',{user:admin}),401);
        ok(await request('products/501/reviews',{user:bob}),401);
        const foreign=await request('products/601/reviews'),unknown=await request('products/999999/reviews');
        ok(foreign,404,'RESOURCE_NOT_FOUND');ok(unknown,404,'RESOURCE_NOT_FOUND');assert.deepEqual(foreign.body,unknown.body);
        ok(await request('products/0/reviews'),400,'INVALID_REFERENCE');
        ok(await request('products/501/reviews?storeId=999'),400,'INVALID_REQUEST');
        ok(await request('products/501/reviews?limit=999'),400,'PUBLIC_LIMIT_INVALID');
    });
    await gate('S25 authenticated review reads retain host and live publication guards',async()=>{
        ok(await request('products/501/reviews',{store:{host:'unknown.test'}}),421,'HOST_NOT_CONFIGURED');
        runtimeEnabled=false;
        try{ok(await request('products/501/reviews'),503,'THEME_CUSTOMER_RUNTIME_NOT_ACTIVE');}
        finally{runtimeEnabled=true;}
        const own=ok(await request('products/501/reviews',{headers:{'x-forwarded-host':b.host}}));
        assert.equal(own.reviewPermission.code,'SELLER_REVIEW_HANDOFF_REQUIRED');
    });
    await gate('S26 canonical first-party delivered-order review eligibility passes through without an adapter override',async()=>{
        // Explicit owned fixture scenario: use the real migrated first-party
        // store and canonical order creation. Never rename a Seller into it.
        const slug=require('../services/categoryV2BackfillService').PLATFORM_STORE.slug;
        const rows=(await pool.query('SELECT id FROM stores WHERE slug=$1',[slug])).rows;assert.equal(rows.length,1);
        const firstParty={storeId:Number(rows[0].id),host:'first-party.test',serviceId:crypto.randomUUID(),assignmentId:crypto.randomUUID()};
        firstParty.organizationId=Number((await pool.query('INSERT INTO seller_organizations(external_key,display_name) VALUES($1,$2) RETURNING id',[crypto.randomUUID(),'First-party test context'])).rows[0].id);
        firstParty.sellerStoreId=Number((await pool.query('INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,$3) RETURNING id',[firstParty.organizationId,firstParty.storeId,'First-party test store'])).rows[0].id);
        await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro')",[firstParty.serviceId,firstParty.organizationId,firstParty.sellerStoreId]);
        await pool.query("INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel,commerce_mode,status,accepted_at) VALUES($1,$2,$3,$4,$5,'web','SINGLE_STORE','ACCEPTED',NOW())",[firstParty.assignmentId,firstParty.serviceId,firstParty.organizationId,firstParty.sellerStoreId,versionId]);
        await pool.query("INSERT INTO theme_domain_bindings(id,hostname,service_id,organization_id,store_id,assignment_id,status,verified_at,verification_reference) VALUES($1,$2,$3,$4,$5,$6,'VERIFIED',NOW(),'explicit-disposable-not-dns')",[crypto.randomUUID(),firstParty.host,firstParty.serviceId,firstParty.organizationId,firstParty.sellerStoreId,firstParty.assignmentId]);
        await pool.query("INSERT INTO products(id,name,price,stock,store_id,publication_status,is_customer_visible,variant_selection_required) VALUES(801,'First-party review fixture',50,10,$1,'active',TRUE,FALSE)",[firstParty.storeId]);
        const firstPartyOrder=await createOrder(alice.userId,[{id:801,quantity:1}],{paid:true});
        await pool.query('UPDATE orders SET status=$2 WHERE id=$1',[firstPartyOrder.id,require('../constants/orderStatus').ORDER_STATUS.TESLIM_EDILDI]);
        const data=ok(await request('products/801/reviews',{store:firstParty}));
        assert.deepEqual(data.reviewPermission,{canReview:true,requiresAuth:false,code:'ELIGIBLE',message:null});
        assert.equal(ok(await request('products/501/reviews')).reviewPermission.code,'SELLER_REVIEW_HANDOFF_REQUIRED');
    });
    db.originalConsole.log(JSON.stringify({result:'PASS',pass:gates.length,fail:0,skip:0,gates,postgresVersion:db.postgresVersion,migrations:db.migrations.length,
        testDoubles:['runtimeAuthority accepted publication only'],real:['HTTP Host resolution','canonical customer login/session','scoped cart CAS','orders and variants','favorites','legal/payment access guards'],productionWrites:0,providerCalls:0,browserAcceptance:false}));
})().catch(error=>{(db?.originalConsole||console).error(db?db.redact(error.stack||error.message):error.stack);process.exitCode=1;})
.finally(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.cleanup();});
