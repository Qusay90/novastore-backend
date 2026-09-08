'use strict';
const assert = require('node:assert/strict');
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id:dbPath, filename:dbPath, loaded:true, exports:{query:async()=>{throw Error('Unexpected database access in contract test');}} };
const {normalizeCartItems}=require('../services/pricingService');
const seller=require('../services/sellerOfferInventoryService');
const context={organizationId:1,userId:1,membershipId:1,storeIds:[1]};
(async()=>{
    assert.deepEqual(normalizeCartItems([{id:1,quantity:1,price:1,stock:999,store_id:99},{id:1,quantity:2}]).map(({id,quantity})=>({id,quantity})),[{id:1,quantity:3}]);
    for(const field of ['offer_id','offerId','options','selectedOptions']) {
        assert.throws(()=>normalizeCartItems([{id:1,quantity:1,[field]:'foreign'}]),e=>e.code==='PURCHASABLE_VARIANT_UNSUPPORTED');
    }
    assert.deepEqual(normalizeCartItems([{product_id:1,variant_id:2,quantity:1},{product_id:1,variant_id:3,quantity:1},{product_id:1,variant_id:2,quantity:2}]).map(({id,variant_id,quantity})=>({id,variant_id,quantity})),[{id:1,variant_id:2,quantity:3},{id:1,variant_id:3,quantity:1}]);
    for(const variant_id of [null,0,-1,'01','1.1',{},[],[1],true,2147483648]) assert.throws(()=>normalizeCartItems([{id:1,variant_id,quantity:1}]),e=>e.code==='VARIANT_ID_INVALID');
    await assert.rejects(seller.updateOffer({},context,1,{price_minor:100,revision:1,idempotency_key:'p'}),e=>e.code==='COMMERCE_PRECONDITION_REQUIRED');
    await assert.rejects(seller.adjustInventory({},context,{items:[{inventory_item_id:1,delta:1,reason_code:'count',revision:1}],idempotency_key:'s'}),e=>e.code==='COMMERCE_PRECONDITION_REQUIRED');
    await assert.rejects(seller.createOffer({},context,{product_id:1,seller_sku:'SKU',price_minor:100,currency:'USD',initial_quantity:1,commerce_revision:1,idempotency_key:'c'}),e=>e.code==='UNSUPPORTED_COMMERCE_CURRENCY');
    await assert.rejects(seller.updateOffer({},context,1,{price_minor:100,revision:1,commerce_revision:1,idempotency_key:'p',store_id:2}),e=>e.code==='VALIDATION_FAILED');
    console.log('canonicalCommerceContractSmoke PASS simple compatibility, variant fail-closed, canonical revision required, currency, owner selector');
})().catch(e=>{console.error(e);process.exitCode=1;});
