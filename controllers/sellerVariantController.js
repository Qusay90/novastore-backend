'use strict';
const variants=require('../services/purchasableVariantService');
const {loadProduct}=require('../services/sellerCanonicalCommerceService');
const {safeError}=require('./sellerBusinessController');
const respond=fn=>async(req,res)=>{try{return res.status(200).json(await fn(req));}catch(e){return safeError(res,e);}};
module.exports={
    create:respond(req=>variants.mutate(req.app.locals.sellerDatabase,req.sellerContext,req.params.offerId,null,{...req.body,idempotency_key:req.headers['idempotency-key']})),
    update:respond(req=>variants.mutate(req.app.locals.sellerDatabase,req.sellerContext,req.params.offerId,req.params.variantId,{...req.body,idempotency_key:req.headers['idempotency-key']})),
    list:respond(async req=>{
        const db=req.app.locals.sellerDatabase,c=req.sellerContext;
        const o=(await db.query('SELECT * FROM seller_offers WHERE id=$1 AND organization_id=$2 AND store_id=ANY($3::bigint[])',[variants.id(req.params.offerId),c.organizationId,c.storeIds])).rows[0];
        if(!o)throw Object.assign(new Error('RESOURCE_NOT_FOUND'),{code:'RESOURCE_NOT_FOUND',statusCode:404});
        const p=await loadProduct(db,c,o.product_id,Number(o.store_id));
        const rows=(await db.query(`SELECT v.*,i.quantity FROM seller_offer_variants v JOIN seller_inventory_items i ON i.variant_id=v.id AND i.organization_id=v.organization_id AND i.store_id=v.store_id
            WHERE v.offer_id=$1 AND v.product_id=$2 AND v.deleted_at IS NULL ORDER BY v.id`,[o.id,p.id])).rows;
        return {product_id:Number(p.id),variant_selection_required:p.variant_selection_required,commerce_revision:Number(p.revision),variants:rows.map(v=>({...variants.projection(v),publication_status:v.publication_status}))};
    }),
};
