'use strict';
const commerce=require('./themePlatformCommerceService');
const cart=require('./variantCartV2Service');
const {buildPublicProductSqlPredicate}=require('../constants/productVisibility');
const fail=(code='RESOURCE_NOT_FOUND',statusCode=404)=>{throw Object.assign(new Error(code),{code,statusCode});};
const id=value=>{if(!/^[1-9]\d{0,9}$/u.test(String(value))||Number(value)>2147483647)fail('INVALID_REFERENCE',400);return Number(value);};
const only=(body,keys)=>{if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!keys.includes(key)))fail('INVALID_REQUEST',400);};

function createThemeStorefrontCustomerService({database,runtimeAuthority}={}) {
    const resolve=async(client,request)=>{
        const scope=await commerce.resolvePublic(client,request);
        // This callback is configured by the server publication service. Neither
        // a query parameter, package field nor the client can enable commerce.
        const authority=typeof runtimeAuthority==='function'?await runtimeAuthority(client,scope):null;
        if(authority?.enabled!==true||authority.contractVersion!==2||Number(authority.storeId)!==Number(scope.legacy_store_id))fail('THEME_CUSTOMER_RUNTIME_NOT_ACTIVE',503);
        return scope;
    };
    const transaction=async(request,action)=>{
        const client=await database.connect();
        try{await client.query('BEGIN');const scope=await resolve(client,request);const result=await action(client,scope);await client.query('COMMIT');return result;}
        catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    };
    const product=async(client,scope,productId)=>{
        const row=(await client.query(`SELECT p.* FROM products p WHERE p.id=$1 AND p.store_id=$2 AND ${buildPublicProductSqlPredicate('p')} FOR SHARE`,[id(productId),scope.legacy_store_id])).rows[0];
        if(!row)fail();return row;
    };
    const order=async(client,scope,userId,orderId)=>{
        const row=(await client.query('SELECT id,user_id,items,status,payment_status,total_amount,created_at,payment_ref FROM orders WHERE id=$1 AND user_id=$2',[id(orderId),id(userId)])).rows[0];
        if(!row)fail();const items=typeof row.items==='string'?JSON.parse(row.items):row.items;
        if(!Array.isArray(items)||!items.length||items.some(item=>Number(item.store_id)!==Number(scope.legacy_store_id)))fail();
        // Return a finite customer DTO, never provider, seller or internal columns.
        return{id:Number(row.id),items,status:row.status,payment_status:row.payment_status,total_amount:Number(row.total_amount),created_at:row.created_at,payment_ref:row.payment_ref};
    };
    return Object.freeze({
        resolve,transaction,
        assertProduct:(req,productId)=>transaction(req,(client,scope)=>product(client,scope,productId)),
        assertOrder:(req,orderId)=>transaction(req,(client,scope)=>order(client,scope,req.user.id,orderId)),
        assertPayment: req=>transaction(req,async(client,scope)=>{
            only(req.query,['paymentRef','orderId']);
            if(typeof req.query.paymentRef!=='string'||!/^[A-Za-z0-9._:-]{1,120}$/u.test(req.query.paymentRef))fail('INVALID_REQUEST',400);
            const rows=(await client.query('SELECT id FROM orders WHERE user_id=$1 AND payment_ref=$2',[id(req.user.id),req.query.paymentRef])).rows;
            if(rows.length!==1||(req.query.orderId&&id(req.query.orderId)!==Number(rows[0].id)))fail();
            return order(client,scope,req.user.id,rows[0].id);
        }),
        assertCheckout:req=>transaction(req,async(client,scope)=>{
            only(req.body,['addressId','cartItems','couponCode']);
            if(!Array.isArray(req.body.cartItems)||!req.body.cartItems.length||req.body.cartItems.length>50)fail('INVALID_REQUEST',400);
            for(const item of req.body.cartItems){
                only(item,['id','product_id','quantity','variant_id']);
                if(item.id!==undefined&&item.product_id!==undefined&&id(item.id)!==id(item.product_id))fail('INVALID_REQUEST',400);
                await product(client,scope,item.product_id??item.id);
            }
        }),
        cart:(req,key,method)=>{
            only(req.body||{},['expectedRevision','payload','resolveLegacyProductIds','orderId']);
            return cart.execute({database,userId:req.user.id,key,method,headers:req.headers,body:req.body||{},
                storeScopeResolver:async client=>({storeId:(await resolve(client,req)).legacy_store_id})});
        },
        favorites:(req,method='GET')=>transaction(req,async(client,scope)=>{
            const userId=id(req.user.id);
            if(method!=='GET'){
                only(req.body||{},[]);const row=await product(client,scope,req.params.productId);
                if(method==='POST')await client.query('INSERT INTO favorites(user_id,product_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,row.id]);
                else await client.query('DELETE FROM favorites WHERE user_id=$1 AND product_id=$2',[userId,row.id]);
                return{productId:Number(row.id),favorited:method==='POST'};
            }
            const rows=(await client.query(`SELECT f.product_id,f.created_at,p.name,p.price,p.old_price,p.image_url,p.stock FROM favorites f JOIN products p ON p.id=f.product_id
                WHERE f.user_id=$1 AND p.store_id=$2 AND ${buildPublicProductSqlPredicate('p')} ORDER BY f.created_at DESC,f.product_id DESC`,[userId,scope.legacy_store_id])).rows;
            return{productIds:rows.map(row=>Number(row.product_id)),favorites:rows.map(row=>({productId:Number(row.product_id),createdAt:row.created_at,
                product:{id:Number(row.product_id),name:row.name,price:Number(row.price),oldPrice:row.old_price,imageUrl:row.image_url,stock:row.stock}}))};
        }),
        orders:req=>transaction(req,async(client,scope)=>{
            const rows=(await client.query('SELECT id,items FROM orders WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[id(req.user.id)])).rows;
            const result=[];
            for(const row of rows){const items=typeof row.items==='string'?JSON.parse(row.items):row.items;
                if(Array.isArray(items)&&items.length&&items.every(item=>Number(item.store_id)===Number(scope.legacy_store_id)))result.push(await order(client,scope,req.user.id,row.id));}
            return result;
        })
    });
}
module.exports={createThemeStorefrontCustomerService};
