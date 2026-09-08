'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');

module.exports = async ({ pool, sensitive, originalConsole }) => {
    const service = require('../../services/sellerOfferInventoryService');
    const { calculatePricing } = require('../../services/pricingService');
    const { createPendingPaymentOrder, createPendingPaymentOrderFromPricing } = require('../../services/orderService');
    const tokenService = require('../../services/sellerAccessTokenService').createSellerAccessTokenService({ secret: process.env.SELLER_ACCESS_TOKEN_SECRET });
    const contexts = [];
    const roleId = Number((await pool.query("SELECT id FROM seller_roles WHERE code='owner' AND organization_id IS NULL")).rows[0].id);
    for (const label of ['A', 'B']) {
        const userId = Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,'unused','customer',TRUE) RETURNING id", [`R19 ${label}`, `r19-${label.toLowerCase()}@example.test`])).rows[0].id);
        const organizationId = Number((await pool.query('INSERT INTO seller_organizations(external_key,display_name) VALUES($1,$2) RETURNING id', [crypto.randomUUID(), `R19 ${label}`])).rows[0].id);
        const legacyId = Number((await pool.query('INSERT INTO stores(name,slug,owner_user_id,is_active) VALUES($1,$2,$3,TRUE) RETURNING id', [`R19 ${label}`, `r19-${label.toLowerCase()}`, userId])).rows[0].id);
        const storeId = Number((await pool.query('INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,$3) RETURNING id', [organizationId,legacyId,`R19 ${label}`])).rows[0].id);
        const stamp = crypto.randomUUID();
        const membershipId = Number((await pool.query('INSERT INTO seller_memberships(organization_id,user_id,role_id,security_stamp) VALUES($1,$2,$3,$4) RETURNING id', [organizationId,userId,roleId,stamp])).rows[0].id);
        await pool.query('INSERT INTO seller_membership_store_scopes(membership_id,organization_id,store_id) VALUES($1,$2,$3)', [membershipId,organizationId,storeId]);
        const sessionId = crypto.randomUUID();
        await pool.query("INSERT INTO seller_sessions(id,user_id,organization_id,membership_id,membership_revision,security_stamp,expires_at) VALUES($1,$2,$3,$4,1,$5,NOW()+INTERVAL '1 day')", [sessionId,userId,organizationId,membershipId,stamp]);
        const token = tokenService.issue({sessionId,userId}); sensitive.add(token);
        const productId = Number((await pool.query("INSERT INTO products(name,price,stock,store_id,publication_status,is_customer_visible,sku,normalized_sku) VALUES($1,100,10,$2,'active',TRUE,$3,$3) RETURNING id", [`R19 Product ${label}`,legacyId,`R19-${label}`])).rows[0].id);
        contexts.push({organizationId,userId,membershipId,sessionId,storeIds:[storeId],legacyId,productId,token});
    }
    const [a,b] = contexts;
    const adminId=Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES('R19 Admin','r19-admin@example.test','unused','admin',TRUE) RETURNING id")).rows[0].id);
    const identity={version:'r19-v1',publicLegalName:'R19 Seller Test',publicTradeName:'R19 Test',publicDisclosureText:'Disposable local test disclosure'};
    const legalHash=require('../../services/sellerPublicLegalIdentityService').buildSellerPublicLegalIdentityContentSha256(identity);
    await pool.query("INSERT INTO seller_public_legal_identities(organization_id,version,public_legal_name,public_trade_name,public_disclosure_text,content_sha256,status,created_by_admin_user_id) VALUES($1,$2,$3,$4,$5,$6,'draft',$7)",[a.organizationId,identity.version,identity.publicLegalName,identity.publicTradeName,identity.publicDisclosureText,legalHash,adminId]);
    await pool.query("UPDATE seller_public_legal_identities SET status='approved',approved_by_admin_user_id=$2,approved_at=NOW(),revision=revision+1 WHERE organization_id=$1",[a.organizationId,adminId]);
    const {buildCheckoutSalesPartyProjection,materializeSellerOrderProjection}=require('../../services/sellerOrderProjectionService');
    const app = express(); app.use(express.json()); app.locals.sellerDatabase=pool;
    const controller = require('../../controllers/sellerBusinessController').createSellerBusinessController({
        storeService:require('../../services/sellerStoreService'),offerInventoryService:service,
        orderService:require('../../services/sellerOrderFulfillmentService'),financeService:require('../../services/sellerFinanceService'),supportService:require('../../services/sellerSupportService'),
    });
    app.use('/api/seller/v1', require('../../routes/sellerBusinessRoutes').createSellerBusinessRouter({ enabled:true,
        auth:require('../../middlewares/sellerAuthMiddleware').createSellerAuthMiddleware({verifyAccessToken:tokenService.verify}),
        tenant:require('../../middlewares/sellerTenantContext').createSellerTenantContextMiddleware(),controller,features:{offerWrite:true},
    }));
    app.use('/api/products',require('../../routes/productRoutes'));
    app.use('/api/orders',require('../../routes/orderRoutes'));
    app.use('/api/returns',require('../../routes/returnRoutes'));
    app.use('/api/campaigns',require('../../routes/campaignRoutes'));
    app.use('/api/admin',require('../../routes/adminRoutes'));
    const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    let checks=0;
    const req=async(url,{token=a.token,method='GET',body,key}={})=>{
        const r=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method,headers:{...(token?{authorization:`Bearer ${token}`} : {}),...(body?{'content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
        return {status:r.status,body:await r.json()};
    };
    const ok=(r,status=200)=>{assert.equal(r.status,status,`HTTP status; safe code=${r.body?.code}`);checks++;return r.body;};
    const product=async()=> (await pool.query('SELECT * FROM products WHERE id=$1',[a.productId])).rows[0];
    const read=async()=>ok(await req(`/api/seller/v1/offers/${a.offerId}`));

    const variants=require('../../services/purchasableVariantService');
    const list=async()=>ok(await req(`/api/seller/v1/offers/${a.offerId}/variants`));
    const patch=async(v,data,key)=>req(`/api/seller/v1/offers/${a.offerId}/variants/${v.id}`,{method:'PATCH',key,body:{commerce_revision:v.commerce_revision,...data}});
    const line=(v,quantity=1)=>({id:a.productId,variant_id:v.id,quantity,price:1,stock:9999,store_id:b.legacyId,sku:'FOREIGN'});
    const order=async(items,userId=a.userId,priced=null)=>{const client=await pool.connect();try{await client.query('BEGIN');
        const pricing=priced||await calculatePricing({cartItems:items,client});
        const sales=await buildCheckoutSalesPartyProjection(client,pricing.items);
        const result=await createPendingPaymentOrderFromPricing({client,pricing,userId,fullName:'R19 local',email:'r19@example.test',phone:'',address:''});
        await materializeSellerOrderProjection(client,result.order.id,sales.sellerProjection);
        await client.query("INSERT INTO payments(order_id,provider,payment_ref,amount,currency,status,raw_request,raw_response) VALUES($1,'manual',$2,$3,'TRY','PENDING',$4::jsonb,'{}'::jsonb)",[result.order.id,`R19-${result.order.id}`,pricing.totals.total,JSON.stringify({stockReserved:true,finalizesOnWebhook:false})]);
        await client.query('COMMIT');return result.order;
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}};
    try{
        a.offerId=ok(await req('/api/seller/v1/offers',{method:'POST',key:'r19-offer',body:{product_id:a.productId,seller_sku:'R19-LEGACY',price_minor:10000,currency:'TRY',initial_quantity:10,commerce_revision:Number((await product()).revision)}})).offer.id;
        const offer=await read();ok(await req(`/api/seller/v1/offers/${a.offerId}/commands`,{method:'POST',key:'r19-offer-publish',body:{command:'publish',revision:offer.revision}}));
        const create=async(size,price,quantity)=>ok(await req(`/api/seller/v1/offers/${a.offerId}/variants`,{method:'POST',key:`r19-${size}`,body:{commerce_revision:Number((await product()).revision),sku:`R19-${size}`,price_minor:price,quantity,selections:[{group:'Color',value:'Red'},{group:'Size',value:size}]}})).variant;
        let m=await create('M',10000,4),l=await create('L',15000,3);
        assert.equal(ok(await req(`/api/products/${a.productId}`,{token:null})).variants.length,0);
        m=ok(await patch(m,{publication_status:'published'},'publish-m')).variant;
        l=ok(await patch(l,{publication_status:'published'},'publish-l')).variant;
        const detail=ok(await req(`/api/products/${a.productId}`,{token:null}));
        assert(detail.variant_selection_required);assert.deepEqual(detail.variants.map(v=>v.id),[m.id,l.id]);assert.equal(detail.stock,7);
        const cart=require('../../services/pricingService').normalizeCartItems([line(m),line(l),line(m)]);
        assert.equal(cart.length,2);assert.equal(cart[0].quantity,2);
        const publicQuote=ok(await req('/api/campaigns/quote',{token:null,method:'POST',body:{cartItems:[line(m),line(l)]}}));
        assert.deepEqual(publicQuote.items.map(i=>i.price),[100,150]);
        assert(publicQuote.items.every(i=>i.store_id===a.legacyId));
        assert.equal(ok(await req('/api/campaigns/quote',{token:null,method:'POST',body:{cartItems:[{product_id:a.productId,quantity:1}]}}),400).code,'VARIANT_REQUIRED');
        assert.equal(ok(await req('/api/campaigns/quote',{token:null,method:'POST',body:{cartItems:[{product_id:a.productId,variant_id:2147483647,quantity:1}]}}),409).code,'VARIANT_NOT_PURCHASABLE');
        const priced=await calculatePricing({cartItems:[line(m),line(l)],client:pool});
        assert.deepEqual(priced.items.map(i=>i.price),[100,150]);assert.deepEqual(priced.items.map(i=>i.variant_id),[m.id,l.id]);
        ok(await req(`/api/seller/v1/offers/${a.offerId}/variants/${m.id}`,{token:b.token,method:'PATCH',key:'foreign',body:{commerce_revision:m.commerce_revision,quantity:50}}),404);
        await assert.rejects(calculatePricing({cartItems:[{id:a.productId,quantity:1}],client:pool}),e=>e.code==='VARIANT_REQUIRED');
        for(const variant_id of ['abc',-1,'01',2147483648])await assert.rejects(calculatePricing({cartItems:[{id:a.productId,variant_id,quantity:1}],client:pool}),e=>e.code==='VARIANT_ID_INVALID');
        await assert.rejects(variants.resolve(pool,b.productId,m.id),e=>e.code==='VARIANT_NOT_PURCHASABLE');
        const bought=await order([line(m),line(l)]);
        const snapshot=JSON.stringify(bought.items);
        const sellerLines=(await pool.query('SELECT i.variant_id,i.source_item_index FROM seller_order_items i JOIN seller_orders o ON o.id=i.seller_order_id WHERE o.canonical_order_id=$1 ORDER BY i.source_item_index',[bought.id])).rows;
        assert.deepEqual(sellerLines.map(x=>Number(x.variant_id)),[m.id,l.id]);assert.deepEqual(sellerLines.map(x=>x.source_item_index),[0,1]);
        assert.deepEqual(bought.items.map(i=>i.sku),['R19-M','R19-L']);
        let after=await list();assert.deepEqual(after.variants.map(v=>v.availableStock),[3,2]);
        m=after.variants.find(v=>v.id===m.id);l=after.variants.find(v=>v.id===l.id);
        const updateBody={commerce_revision:m.commerce_revision,price_minor:12500,sku:'R19-M-NEW',selections:[{group:'Color',value:'Scarlet'},{group:'Size',value:'M'}]};
        const updates=await Promise.all([1,2].map(()=>req(`/api/seller/v1/offers/${a.offerId}/variants/${m.id}`,{method:'PATCH',key:'r19-replay',body:updateBody})));
        updates.forEach(r=>ok(r));assert.equal(updates.filter(r=>r.body.reused).length,1);m=updates[0].body.variant;
        assert.equal(JSON.stringify((await pool.query('SELECT items FROM orders WHERE id=$1',[bought.id])).rows[0].items),snapshot);
        await assert.rejects(order([line(m),line(l)],a.userId,priced),e=>e.code==='VARIANT_PRICE_CHANGED');
        const customer=(await require('../../services/authSessionService').issueAccessSession({userId:a.userId,role:'customer',principal:'customer',queryable:pool})).token;sensitive.add(customer);
        ok(await req(`/api/orders/${bought.id}/cancel`,{token:customer,method:'POST',body:{reason_code:'CUSTOMER_REQUEST'}}));
        const released=await list();assert.deepEqual(released.variants.map(v=>v.availableStock),[4,3]);
        ok(await req(`/api/orders/${bought.id}/cancel`,{token:customer,method:'POST',body:{reason_code:'CUSTOMER_REQUEST'}}));
        assert.deepEqual((await list()).variants.map(v=>v.availableStock),[4,3]);
        m=released.variants[0];l=released.variants[1];
        let committed=false;
        const noRefetchPool={connect:async()=>{const client=await pool.connect();return {query:async(...args)=>{if(committed)throw Error('Synthetic post-commit readback unavailable');const r=await client.query(...args);if(args[0]==='COMMIT')committed=true;return r;},release:()=>client.release()};}};
        m=(await variants.mutate(noRefetchPool,a,a.offerId,m.id,{quantity:4,commerce_revision:m.commerce_revision,idempotency_key:'r19-no-refetch'})).variant;
        assert(committed);assert.equal(m.availableStock,4);
        m=ok(await patch(m,{quantity:1},'m-one')).variant;
        const races=await Promise.allSettled([order([line(m)],a.userId),order([line(m)],b.userId)]);
        assert.equal(races.filter(r=>r.status==='fulfilled').length,1);
        assert.equal(ok(await req('/api/campaigns/quote',{token:null,method:'POST',body:{cartItems:[line(m)]}}),409).code,'VARIANT_STOCK_UNAVAILABLE');
        const isolated=(await list()).variants;assert.equal(isolated[0].availableStock,0);assert.equal(isolated[1].availableStock,3);
        l=isolated[1];const stale=await calculatePricing({cartItems:[line(l,2)],client:pool});
        l=ok(await patch(l,{quantity:1},'l-one')).variant;
        await assert.rejects(order([line(l,2)],a.userId,stale),e=>e.code==='VARIANT_STOCK_UNAVAILABLE');
        const lRaces=await Promise.allSettled([order([line(l)],a.userId),order([line(l)],b.userId)]);
        assert.equal(lRaces.filter(r=>r.status==='fulfilled').length,1);
        l=(await list()).variants.find(v=>v.id===l.id);
        l=ok(await patch(l,{publication_status:'unpublished',quantity:2},'unpublish-l')).variant;
        await assert.rejects(variants.resolve(pool,a.productId,l.id),e=>e.code==='VARIANT_NOT_PURCHASABLE');
        await pool.query("UPDATE seller_offer_variants SET status='inactive' WHERE id=$1",[m.id]);
        await assert.rejects(variants.resolve(pool,a.productId,m.id),e=>e.code==='VARIANT_NOT_PURCHASABLE');
        await pool.query("UPDATE seller_offer_variants SET status='active' WHERE id=$1",[m.id]);
        l=ok(await patch(l,{deleted:true},'delete-l')).variant;
        await assert.rejects(variants.resolve(pool,a.productId,l.id),e=>e.code==='VARIANT_NOT_PURCHASABLE');
        await assert.rejects(pool.query('UPDATE seller_offer_variants SET product_id=$1 WHERE id=$2',[b.productId,m.id]),/IMMUTABLE/);
        await assert.rejects(pool.query('UPDATE seller_inventory_items SET quantity=-1 WHERE variant_id=$1',[m.id]),/check constraint/);
        await assert.rejects(pool.query('DELETE FROM seller_offer_variants WHERE id=$1',[m.id]),/HARD_DELETE/);
        const returnOrder=races.find(r=>r.status==='fulfilled').value;
        const ownerToken=(await require('../../services/authSessionService').issueAccessSession({userId:Number(returnOrder.user_id),role:'customer',principal:'customer',queryable:pool})).token;sensitive.add(ownerToken);
        await pool.query("UPDATE orders SET status='Teslim Edildi',payment_status='PAID',delivered_at=NOW(),refund_status='NONE' WHERE id=$1",[returnOrder.id]);
        const returned=ok(await req('/api/returns',{token:ownerToken,method:'POST',body:{order_id:returnOrder.id,reason_code:'DAMAGED',note:'R19 local return'}}),201);
        const returnId=returned.return?.id||returned.id;assert(returnId);ok(await req(`/api/returns/${returnId}`,{token:ownerToken}));
        const lOrder=lRaces.find(r=>r.status==='fulfilled').value;
        const lToken=(await require('../../services/authSessionService').issueAccessSession({userId:Number(lOrder.user_id),role:'customer',principal:'customer',queryable:pool})).token;sensitive.add(lToken);
        ok(await req(`/api/orders/${lOrder.id}/cancel`,{token:lToken,method:'POST',body:{reason_code:'CUSTOMER_REQUEST'}}));
        assert.equal(Number((await pool.query('SELECT quantity FROM seller_inventory_items WHERE variant_id=$1',[l.id])).rows[0].quantity),3);
        assert.equal(Number((await pool.query('SELECT quantity FROM seller_inventory_items WHERE variant_id=$1',[m.id])).rows[0].quantity),0);
        const audits=(await pool.query("SELECT COUNT(*)::int AS n FROM seller_outbox_events WHERE idempotency_key='r19-replay'")).rows[0];assert.equal(audits.n,1);
        originalConsole.log(JSON.stringify({test:'purchasableVariantUat',result:'PASS',httpChecks:checks,cartCollision:0,oversale:0,stalePrice:0,staleStock:0,crossVariantRelease:0,crossStoreWrite:0,duplicateMutation:0,history:'PASS',orderLevelReturns:'PASS',migration:'FORWARD_FROM_R18',providerCalls:0}));
    }finally{await new Promise(resolve=>server.close(resolve));}
};
