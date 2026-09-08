'use strict';
const crypto=require('node:crypto');
const {loadProduct}=require('./sellerCanonicalCommerceService');
const {writeAuditAndOutbox}=require('./sellerAuditOutboxService');
const {syncCategoryStatsForProducts}=require('./categoryStatsService');
const fail=(code,statusCode=409)=>{throw Object.assign(new Error(code),{code,statusCode});};
const id=(value)=>{if(!['number','string'].includes(typeof value)||!/^[1-9]\d{0,9}$/.test(String(value))||Number(value)>2147483647)fail('VARIANT_ID_INVALID',400);return Number(value);};
const int=(value,max=2147483647)=>{if(!Number.isSafeInteger(value)||value<0||value>max)fail('VARIANT_INPUT_INVALID',400);return value;};
const label=(value)=>{if(typeof value!=='string'||!value.trim()||value.length>96||/[\u0000-\u001f]/u.test(value))fail('VARIANT_INPUT_INVALID',400);return value.trim();};
const selections=(input)=>{
    if(!Array.isArray(input)||input.length<1||input.length>8)fail('VARIANT_SELECTIONS_INVALID',400);
    const rows=input.map(x=>({group:label(x?.group),value:label(x?.value)})).sort((a,b)=>a.group.localeCompare(b.group,'en'));
    if(new Set(rows.map(x=>x.group)).size!==rows.length)fail('VARIANT_SELECTIONS_INVALID',400);
    return rows;
};
const projection=(v)=>({id:Number(v.id),sku:v.seller_sku,selections:v.selections,price:Number(v.price_minor)/100,
    availableStock:Number(v.quantity),purchasable:v.public_eligible!==false&&v.publication_status==='published'&&v.status==='active'&&!v.deleted_at&&Number(v.quantity)>0,commerce_revision:Number(v.revision)});
const variantSql=`SELECT v.*, i.quantity, i.id AS inventory_id, p.store_id AS canonical_store_id, (o.status='active' AND o.archived_at IS NULL AND p.publication_status='active' AND p.is_customer_visible AND p.deleted_at IS NULL AND s.status='active' AND s.closed_at IS NULL AND org.status='active' AND org.closed_at IS NULL AND public_store.is_active AND public_store.deleted_at IS NULL) AS public_eligible
    FROM seller_offer_variants v JOIN seller_inventory_items i ON i.variant_id=v.id AND i.organization_id=v.organization_id AND i.store_id=v.store_id
    JOIN products p ON p.id=v.product_id JOIN seller_stores s ON s.id=v.store_id AND s.organization_id=v.organization_id AND s.legacy_store_id=p.store_id
    JOIN seller_offers o ON o.id=v.offer_id AND o.organization_id=v.organization_id AND o.store_id=v.store_id AND o.product_id=p.id
    JOIN stores public_store ON public_store.id=p.store_id JOIN seller_organizations org ON org.id=v.organization_id`;
const purchasablePredicate=`v.deleted_at IS NULL AND v.publication_status='published' AND v.status='active'
    AND p.variant_selection_required AND p.publication_status='active' AND p.is_customer_visible AND p.deleted_at IS NULL
    AND s.status='active' AND s.closed_at IS NULL AND o.status='active' AND o.archived_at IS NULL
    AND org.status='active' AND org.closed_at IS NULL AND public_store.is_active AND public_store.deleted_at IS NULL`;
const publicVariants=async(db,productId)=>(await db.query(`${variantSql} WHERE v.product_id=$1 AND ${purchasablePredicate} ORDER BY v.id`,[productId])).rows.map(projection);
const resolve=async(db,productId,variantId)=>{
    const rows=(await db.query(`${variantSql} WHERE v.product_id=$1 AND v.id=$2 AND ${purchasablePredicate}`,[id(productId),id(variantId)])).rows;
    if(rows.length!==1)fail('VARIANT_NOT_PURCHASABLE');return rows[0];
};
// Product values are display aggregates only in variant mode. They are never
// decremented as a second inventory bucket.
const aggregate=async(db,productId)=>{
    await db.query(`UPDATE products p SET stock=COALESCE(a.quantity,0),price=COALESCE(a.price,p.price),revision=p.revision+1,updated_at=NOW()
        FROM (SELECT SUM(i.quantity)::integer AS quantity, MIN(v.price_minor)/100.0 AS price FROM seller_offer_variants v
        JOIN seller_inventory_items i ON i.variant_id=v.id AND i.organization_id=v.organization_id AND i.store_id=v.store_id
        JOIN seller_offers o ON o.id=v.offer_id AND o.status='active' AND o.archived_at IS NULL
        WHERE v.product_id=$1 AND v.publication_status='published' AND v.status='active' AND v.deleted_at IS NULL) a
        WHERE p.id=$1 AND p.variant_selection_required`,[productId]);
    await syncCategoryStatsForProducts(db,[productId]);
};
const stock=async(db,item,direction)=>{
    // Shared lock order for write/reserve/release is product, then variant/inventory.
    await db.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[item.id]);
    if(direction<0){
        const v=await resolve(db,item.id,item.variant_id);
        if(Number(v.price_minor)!==Math.round(Number(item.price)*100))fail('VARIANT_PRICE_CHANGED');
        await db.query('SELECT id FROM seller_offer_variants WHERE id=$1 FOR UPDATE',[item.variant_id]);
        const changed=await db.query(`UPDATE seller_inventory_items SET quantity=quantity-$1,revision=revision+1,updated_at=NOW()
          WHERE variant_id=$2 AND organization_id=$3 AND store_id=$4 AND quantity >= $1 RETURNING id`,[item.quantity,item.variant_id,v.organization_id,v.store_id]);
        if(changed.rows.length!==1)fail('VARIANT_STOCK_UNAVAILABLE');
    }else{
        const changed=await db.query(`UPDATE seller_inventory_items i SET quantity=i.quantity+$1,revision=i.revision+1,updated_at=NOW()
          FROM seller_offer_variants v WHERE v.id=$2 AND v.product_id=$3 AND i.variant_id=v.id
          AND i.organization_id=v.organization_id AND i.store_id=v.store_id RETURNING i.id`,[item.quantity,id(item.variant_id),item.id]);
        if(changed.rows.length!==1)fail('VARIANT_RELEASE_IDENTITY_INVALID');
    }
    await db.query('UPDATE seller_offer_variants SET revision=revision+1,updated_at=NOW() WHERE id=$1',[item.variant_id]);
    await aggregate(db,item.id);
};
const mutate=async(database,context,offerId,variantId,input)=>{
    const allowed=variantId?['sku','selections','price_minor','quantity','publication_status','deleted','commerce_revision','idempotency_key']:['sku','selections','price_minor','quantity','commerce_revision','idempotency_key'];
    if(!input||Object.keys(input).some(k=>!allowed.includes(k)))fail('VARIANT_INPUT_INVALID',400);
    const expected=id(input.commerce_revision), key=label(input.idempotency_key);
    const data={};
    if(!variantId||Object.hasOwn(input,'sku'))data.sku=label(input.sku);
    if(!variantId||Object.hasOwn(input,'selections'))data.selections=selections(input.selections);
    if(!variantId||Object.hasOwn(input,'price_minor'))data.price_minor=int(input.price_minor,9999999999);
    if(!variantId||Object.hasOwn(input,'quantity'))data.quantity=int(input.quantity);
    if(Object.hasOwn(input,'publication_status')){if(!['draft','published','unpublished'].includes(input.publication_status))fail('VARIANT_INPUT_INVALID',400);data.publication_status=input.publication_status;}
    if(Object.hasOwn(input,'deleted')){if(input.deleted!==true)fail('VARIANT_INPUT_INVALID',400);data.deleted=true;}
    if(!Object.keys(data).length)fail('VARIANT_INPUT_INVALID',400);
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify({offerId:id(offerId),variantId:variantId?id(variantId):null,expected,data})).digest('hex');
    const client=await database.connect();
    try{
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`seller-commerce:${context.organizationId}:${key}`]);
        const offer=(await client.query('SELECT * FROM seller_offers WHERE id=$1 AND organization_id=$2 AND store_id=ANY($3::bigint[])',[id(offerId),context.organizationId,context.storeIds])).rows[0];
        if(!offer)fail('RESOURCE_NOT_FOUND',404);
        const product=await loadProduct(client,context,offer.product_id,Number(offer.store_id),true);
        const receipt=(await client.query('SELECT * FROM seller_mutation_receipts WHERE organization_id=$1 AND idempotency_key=$2',[context.organizationId,key])).rows[0];
        if(receipt){if(receipt.request_fingerprint!==fingerprint)fail('IDEMPOTENCY_KEY_REUSED');await client.query('COMMIT');return {reused:true,variant:receipt.response_redacted};}
        let v;
        if(!variantId){
            if(Number(product.revision)!==expected)fail('COMMERCE_REVISION_CONFLICT');
            if(!product.variant_selection_required){
                const history=await client.query('SELECT id FROM orders WHERE items @> $1::jsonb LIMIT 1',[JSON.stringify([{id:Number(product.id)}])]);
                if(history.rows.length)fail('SIMPLE_ORDER_HISTORY_PREVENTS_VARIANT_CONVERSION');
                await client.query('UPDATE products SET variant_selection_required=TRUE WHERE id=$1',[product.id]);
            }
            v=(await client.query(`INSERT INTO seller_offer_variants(organization_id,store_id,offer_id,product_id,seller_sku,price_minor,currency,selections)
                VALUES($1,$2,$3,$4,$5,$6,'TRY',$7::jsonb) RETURNING *`,[context.organizationId,offer.store_id,offer.id,product.id,data.sku,data.price_minor,JSON.stringify(data.selections)])).rows[0];
            await client.query('INSERT INTO seller_inventory_items(organization_id,store_id,variant_id,quantity) VALUES($1,$2,$3,$4)',[context.organizationId,offer.store_id,v.id,data.quantity]);
        }else{
            v=(await client.query('SELECT * FROM seller_offer_variants WHERE id=$1 AND offer_id=$2 AND product_id=$3 AND deleted_at IS NULL FOR UPDATE',[id(variantId),offer.id,product.id])).rows[0];
            if(!v)fail('RESOURCE_NOT_FOUND',404);if(Number(v.revision)!==expected)fail('COMMERCE_REVISION_CONFLICT');
            await client.query(`UPDATE seller_offer_variants SET seller_sku=COALESCE($1,seller_sku),selections=COALESCE($2::jsonb,selections),price_minor=COALESCE($3,price_minor),
                publication_status=COALESCE($4,publication_status),deleted_at=CASE WHEN $5 THEN NOW() ELSE deleted_at END,revision=revision+1,updated_at=NOW() WHERE id=$6`,
                [data.sku??null,data.selections?JSON.stringify(data.selections):null,data.price_minor??null,data.publication_status??null,data.deleted===true,v.id]);
            if(data.quantity!==undefined)await client.query('UPDATE seller_inventory_items SET quantity=$1,revision=revision+1,updated_at=NOW() WHERE variant_id=$2',[data.quantity,v.id]);
        }
        await aggregate(client,product.id);
        const row=(await client.query(`${variantSql} WHERE v.id=$1`,[v.id])).rows[0];
        const response={...projection(row),product_id:Number(product.id),publication_status:row.publication_status,deleted:!!row.deleted_at,product_commerce_revision:Number((await client.query('SELECT revision FROM products WHERE id=$1',[product.id])).rows[0].revision)};
        await client.query('INSERT INTO seller_mutation_receipts(organization_id,idempotency_key,request_fingerprint,aggregate_type,aggregate_id,response_redacted) VALUES($1,$2,$3,\'purchasable_variant\',$4,$5::jsonb)',[context.organizationId,key,fingerprint,String(v.id),JSON.stringify(response)]);
        await writeAuditAndOutbox(client,{organizationId:context.organizationId,audit:{storeId:Number(offer.store_id),actorUserId:context.userId,actorMembershipId:context.membershipId,sessionId:context.sessionId,eventType:'seller.variant.updated',targetType:'purchasable_variant',targetId:String(v.id),resultCode:'success',metadata:{action:variantId?'update':'create'}},outbox:{storeId:Number(offer.store_id),aggregateType:'purchasable_variant',aggregateId:String(v.id),eventType:'seller.variant.updated',aggregateRevision:response.commerce_revision,idempotencyKey:key,payload:{action:variantId?'update':'create'}}});
        await client.query('COMMIT');return {reused:false,variant:response};
    }catch(error){await client.query('ROLLBACK').catch(()=>{});if(error.code==='23505')fail('VARIANT_UNIQUE_CONFLICT');throw error;}finally{client.release();}
};
const ownedVariants=async(db,offerId,productId)=>(await db.query(`${variantSql} WHERE v.offer_id=$1 AND v.product_id=$2 AND v.deleted_at IS NULL ORDER BY v.id`,[offerId,productId])).rows;
module.exports={id,ownedVariants,publicVariants,resolve,stock,aggregate,mutate,projection};
