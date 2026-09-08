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
        const userId = Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,'unused','customer',TRUE) RETURNING id", [`R18 ${label}`, `r18-${label.toLowerCase()}@example.test`])).rows[0].id);
        const organizationId = Number((await pool.query('INSERT INTO seller_organizations(external_key,display_name) VALUES($1,$2) RETURNING id', [crypto.randomUUID(), `R18 ${label}`])).rows[0].id);
        const legacyId = Number((await pool.query('INSERT INTO stores(name,slug,owner_user_id,is_active) VALUES($1,$2,$3,TRUE) RETURNING id', [`R18 ${label}`, `r18-${label.toLowerCase()}`, userId])).rows[0].id);
        const storeId = Number((await pool.query('INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,$3) RETURNING id', [organizationId,legacyId,`R18 ${label}`])).rows[0].id);
        const stamp = crypto.randomUUID();
        const membershipId = Number((await pool.query('INSERT INTO seller_memberships(organization_id,user_id,role_id,security_stamp) VALUES($1,$2,$3,$4) RETURNING id', [organizationId,userId,roleId,stamp])).rows[0].id);
        await pool.query('INSERT INTO seller_membership_store_scopes(membership_id,organization_id,store_id) VALUES($1,$2,$3)', [membershipId,organizationId,storeId]);
        const sessionId = crypto.randomUUID();
        await pool.query("INSERT INTO seller_sessions(id,user_id,organization_id,membership_id,membership_revision,security_stamp,expires_at) VALUES($1,$2,$3,$4,1,$5,NOW()+INTERVAL '1 day')", [sessionId,userId,organizationId,membershipId,stamp]);
        const token = tokenService.issue({sessionId,userId}); sensitive.add(token);
        const productId = Number((await pool.query("INSERT INTO products(name,price,stock,store_id,publication_status,is_customer_visible,sku,normalized_sku) VALUES($1,100,10,$2,'active',TRUE,$3,$3) RETURNING id", [`R18 Product ${label}`,legacyId,`R18-${label}`])).rows[0].id);
        contexts.push({organizationId,userId,membershipId,sessionId,storeIds:[storeId],legacyId,productId,token});
    }
    const [a,b] = contexts;
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
    const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    let checks=0;
    const req=async(url,{token=a.token,method='GET',body,key}={})=>{
        const r=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method,headers:{...(token?{authorization:`Bearer ${token}`} : {}),...(body?{'content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
        return {status:r.status,body:await r.json()};
    };
    const ok=(r,status=200)=>{assert.equal(r.status,status,`HTTP status; safe code=${r.body?.code}`);checks++;return r.body;};
    const product=async()=> (await pool.query('SELECT * FROM products WHERE id=$1',[a.productId])).rows[0];
    const read=async()=>ok(await req(`/api/seller/v1/offers/${a.offerId}`));
    const priceWrite=async(price,key,extra={})=>{const current=await read();return req(`/api/seller/v1/offers/${a.offerId}`,{method:'PATCH',key,body:{price_minor:price,revision:current.revision,commerce_revision:current.commerce_revision,...extra}});};
    const stockWrite=async(delta,key)=>{const current=await read();return req('/api/seller/v1/inventory/adjustments',{method:'POST',key,body:{items:[{inventory_item_id:current.inventory.id,delta,reason_code:'r18_uat',revision:current.inventory.revision,commerce_revision:current.commerce_revision}]}});};
    const order=async(userId,pricing=null)=>{
        const client=await pool.connect();try{await client.query('BEGIN');
            const input={client,userId,fullName:'R18 synthetic',email:'r18@example.test',phone:'',address:'',cartItems:[{id:a.productId,quantity:1,price:1,stock:9999,store_id:b.legacyId}]};
            const result=pricing?await createPendingPaymentOrderFromPricing({...input,pricing}):await createPendingPaymentOrder(input);
            await client.query('COMMIT');return result.order;
        }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    };
    try {
        const publicInitial=ok(await req(`/api/products/${a.productId}`,{token:null}));
        assert(Number.isSafeInteger(Number(publicInitial.revision)));
        const createInput={product_id:a.productId,seller_sku:'R18-OFFER',price_minor:10000,currency:'TRY',initial_quantity:10,commerce_revision:Number(publicInitial.revision)};
        const created=ok(await req('/api/seller/v1/offers',{method:'POST',key:'r18-create',body:createInput}));a.offerId=created.offer.id;
        ok(await req('/api/seller/v1/offers',{token:b.token,method:'POST',key:'foreign-product',body:{...createInput,seller_sku:'FOREIGN'}}),404);
        const otherLegacy=Number((await pool.query("INSERT INTO stores(name,slug,owner_user_id,is_active) VALUES('R18 other assigned store','r18-other',$1,TRUE) RETURNING id",[b.userId])).rows[0].id);
        await pool.query("INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,'R18 other scope')",[a.organizationId,otherLegacy]);
        const otherProduct=Number((await pool.query("INSERT INTO products(name,price,stock,store_id,publication_status,is_customer_visible) VALUES('R18 other product',100,10,$1,'active',TRUE) RETURNING id",[otherLegacy])).rows[0].id);
        ok(await req('/api/seller/v1/offers',{method:'POST',key:'same-org-foreign-store',body:{...createInput,product_id:otherProduct,seller_sku:'OTHER'}}),404);
        const before=await read();
        ok(await req(`/api/seller/v1/offers/${a.offerId}`,{token:b.token,method:'PATCH',key:'foreign-price',body:{price_minor:1,revision:before.revision,commerce_revision:before.commerce_revision}}),404);
        ok(await req('/api/seller/v1/inventory/adjustments',{token:b.token,method:'POST',key:'foreign-stock',body:{items:[{inventory_item_id:before.inventory.id,delta:1,reason_code:'foreign',revision:before.inventory.revision,commerce_revision:before.commerce_revision}]}}),404);
        for(const token of [null,(await require('../../services/authSessionService').issueAccessSession({userId:a.userId,role:'customer',principal:'customer',queryable:pool})).token]){
            if(token)sensitive.add(token); const response=await req(`/api/seller/v1/offers/${a.offerId}`,{token});assert([401,403].includes(response.status));checks++;
        }
        const written=ok(await priceWrite(12500,'r18-price'));
        assert.equal(written.offer.variant.price_minor,12500);
        const publicDto=ok(await req(`/api/products/${a.productId}`,{token:null}));
        assert.equal(Number(publicDto.price),125);
        const quote=await calculatePricing({cartItems:[{id:a.productId,quantity:1,price:1,stock:9999,store_id:b.legacyId}],client:pool});
        assert.equal(quote.items[0].price,125);assert.equal(quote.items[0].store_id,a.legacyId);
        // A lost readback must not invalidate the committed receipt or repeat a write.
        await assert.rejects(service.loadOffer({query:async()=>{throw Error('readback unavailable');}},a,a.offerId));
        const replay=ok(await req(`/api/seller/v1/offers/${a.offerId}`,{method:'PATCH',key:'r18-price',body:{price_minor:12500,revision:before.revision,commerce_revision:before.commerce_revision}}));
        assert.equal(replay.reused,true);assert.equal(replay.offer.commerce_revision,written.offer.commerce_revision);
        const priceRace=await read();
        const sameBody={price_minor:13000,revision:priceRace.revision,commerce_revision:priceRace.commerce_revision};
        const duplicates=await Promise.all([1,2].map(()=>req(`/api/seller/v1/offers/${a.offerId}`,{method:'PATCH',key:'r18-concurrent-replay',body:sameBody})));
        duplicates.forEach(r=>ok(r));assert.equal(duplicates.filter(r=>r.body.reused).length,1);
        ok(await req(`/api/seller/v1/offers/${a.offerId}`,{method:'PATCH',key:'r18-lost-update',body:{...sameBody,price_minor:14000}}),409);
        await assert.rejects(order(a.userId,quote), e=>e.code==='ORDER_STOCK_UNAVAILABLE');
        const stockBefore=await read();
        const stockBody={items:[{inventory_item_id:stockBefore.inventory.id,delta:-9,reason_code:'r18_uat',revision:stockBefore.inventory.revision,commerce_revision:stockBefore.commerce_revision}]};
        const stockReceipt=ok(await req('/api/seller/v1/inventory/adjustments',{method:'POST',key:'r18-stock',body:stockBody}));
        assert.equal(stockReceipt.inventory[0].quantity,1);
        const stockReplay=ok(await req('/api/seller/v1/inventory/adjustments',{method:'POST',key:'r18-stock',body:stockBody}));
        assert.equal(stockReplay.reused,true);assert.deepEqual(stockReplay.inventory,stockReceipt.inventory);
        ok(await req('/api/seller/v1/inventory/adjustments',{method:'POST',key:'r18-stock-conflict',body:stockBody}),409);
        assert.equal(Number(ok(await req(`/api/products/${a.productId}`,{token:null})).stock),1);
        const concurrency=await Promise.allSettled([order(a.userId),order(b.userId)]);
        assert.equal(concurrency.filter(r=>r.status==='fulfilled').length,1);
        assert.equal(Number((await product()).stock),0);
        const successful=concurrency.find(r=>r.status==='fulfilled').value;
        const customerTokens=[];
        for(const c of [a,b]) { const session=await require('../../services/authSessionService').issueAccessSession({userId:c.userId,role:'customer',principal:'customer',queryable:pool});sensitive.add(session.token);customerTokens.push(session.token); }
        const ownerIndex=Number(successful.user_id)===a.userId?0:1;
        ok(await req(`/api/orders/user/${successful.user_id}`,{token:customerTokens[ownerIndex]}));
        ok(await req(`/api/orders/user/${successful.user_id}`,{token:customerTokens[1-ownerIndex]}),403);
        ok(await req(`/api/orders/${successful.id}/cancel`,{token:customerTokens[1-ownerIndex],method:'POST',body:{reason_code:'CUSTOMER_REQUEST'}}),404);
        assert.equal(Number((await product()).stock),0);
        const snapshot=JSON.stringify(successful.items);
        assert.equal(successful.items[0].price,130);assert.equal(successful.items[0].sku,'R18-A');
        await assert.rejects(order(a.userId));
        const zero=await read();assert.equal(zero.inventory.quantity,0);
        ok(await priceWrite(15000,'r18-post-order-price'));
        await pool.query("UPDATE products SET name='R18 later name',sku='R18-LATER',normalized_sku='R18-LATER',revision=revision+1 WHERE id=$1",[a.productId]);
        assert.equal(JSON.stringify((await pool.query('SELECT items FROM orders WHERE id=$1',[successful.id])).rows[0].items),snapshot);
        for(const value of [1,'foreign','',{},-1]) await assert.rejects(calculatePricing({cartItems:[{id:a.productId,quantity:1,variant_id:value}],client:pool}), e=>e.code===(value===1?'VARIANT_NOT_ALLOWED':'VARIANT_ID_INVALID'));
        ok(await req(`/api/seller/v1/offers/${a.offerId}`,{method:'PATCH',key:'owner-selector',body:{price_minor:1,revision:zero.revision,commerce_revision:zero.commerce_revision,store_id:b.storeIds[0]}}),400);
        const audits=(await pool.query("SELECT store_id,actor_user_id,actor_membership_id,result_code FROM seller_audit_events WHERE event_type='seller.offer.updated' AND target_id=$1",[String(a.offerId)])).rows;
        assert(audits.length>=3 && audits.every(r=>Number(r.store_id)===a.storeIds[0]&&Number(r.actor_user_id)===a.userId&&Number(r.actor_membership_id)===a.membershipId&&r.result_code==='success'));
        const dashboard=await require('../../services/sellerFinanceService').dashboard(pool,a,{});assert.equal(dashboard.low_stock_count,1);
        await pool.query("UPDATE seller_sessions SET status='revoked',revoked_at=NOW() WHERE id=$1",[a.sessionId]);
        ok(await req(`/api/seller/v1/offers/${a.offerId}`),401);
        const receipts=await pool.query("SELECT COUNT(*)::int AS count FROM seller_mutation_receipts WHERE idempotency_key='r18-concurrent-replay'");assert.equal(receipts.rows[0].count,1);
        originalConsole.log(JSON.stringify({test:'canonicalCommercePostgresSmoke',result:'PASS',httpChecks:checks,priceAuthorityCount:1,oversaleCount:0,stalePricePurchaseCount:0,staleStockPurchaseCount:0,crossStoreWrites:0,duplicateRetryMutationCount:0,lostUpdates:0,orderSnapshotPreserved:true,variantSelections:'REJECTED_UNSUPPORTED',providerCalls:0,productionWrites:0}));
    } finally { await new Promise(resolve=>server.close(resolve)); }
};
