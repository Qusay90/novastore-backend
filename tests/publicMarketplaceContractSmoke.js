'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
Object.assign(process.env, {
    NODE_ENV:'test', NOVASTORE_SAFE_LOCAL_BACKEND:'true', NOVASTORE_ALLOW_REMOTE_DB:'false',
    DATABASE_URL:`postgresql://unit:${crypto.randomBytes(24).toString('hex')}@127.0.0.1:1/novastore_r27_unit_test`,
    DB_SSL:'false', SUPABASE_USE_POOLER:'false', SKIP_SCHEMA_INIT:'true', NOVASTORE_ALLOW_SCHEMA_INIT:'false'
});
const { parsePage, decodeCursor, pageRows, PublicReadError } = require('../services/publicReadPaginationService');
const { listPublicProducts, validateMarketplaceQuery } = require('../services/publicMarketplaceReadService');

(async () => {
    assert.equal(parsePage({}).limit,20);
    assert.equal(parsePage({limit:'100'}).limit,100);
    for(const limit of ['0','-1','NaN','Infinity','1.1','1e2','101','100000000','',' 2','02',[],{},null,0,true,['1','2']]) {
        assert.throws(()=>parsePage({limit}),PublicReadError);
    }
    for(const cursor of ['',[],{},null,'!','x'.repeat(1025)]) assert.throws(()=>parsePage({cursor}),PublicReadError);
    for(const query of [{q:[]},{q:'a'.repeat(121)},{categoryId:'wat'},{categoryId:['1','2']},
        {attributes:'{}',attributeFilters:'{}'},{categoryId:'1',category_id:'2'},{page:'1'},{offset:'1'},
        {attributes:JSON.stringify(Object.fromEntries(Array.from({length:21},(_,i)=>['filter'+i,'a'])))}]) {
        assert.throws(()=>validateMarketplaceQuery(query),PublicReadError);
    }
    const scope=['questions',1];
    const page=pageRows([{id:9,page_rank:0,page_micros:'1789732800123456'},{id:8}],1,scope);
    assert.equal(page.nextCursor!==null,true);
    assert.equal(decodeCursor(page.nextCursor,scope).micros,'1789732800123456');
    assert.throws(()=>decodeCursor(page.nextCursor,['questions',2]),PublicReadError);
    for(const change of [{id:0},{id:2147483648},{id:'9'},{micros:'Infinity'},{micros:'253402300800000000'},{rank:9},{v:2}]) {
        const edited=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(page.nextCursor,'base64url')),...change})).toString('base64url');
        assert.throws(()=>decodeCursor(edited,scope),PublicReadError);
    }
    const sql=[];
    let released=false;
    const queryable={ async query(text,params) {
        sql.push({text,params});
        if(/FROM products p\s+JOIN/u.test(text)) return {rows:[{
            id:1,name:'<b>text</b>',description:'<script>data</script>',price:'12.00',old_price:null,stock:1,
            category:'Category',categories:['Category'],variant_selection_required:true,public_store_slug:'safe-store',public_store_name:'Store',
            page_rank:0,page_micros:'1789732800123456',average_rating:'4.5',review_count:2,
            seller_id:9,store_id:10,organization_id:11,moderation_note:'PRIVATE',cost:3,token:'PRIVATE',future_private_field:'PRIVATE'
        }]};
        return {rows:[]};
    }, release(){released=true;} };
    const injection="%_' OR 1=1 --";
    const result=await listPublicProducts({async connect(){return queryable;}},{q:injection,pagination:'cursor'});
    assert.equal(released,true);
    assert.deepEqual(result.items[0].store,{slug:'safe-store',name:'Store'});
    assert.equal(result.items[0].variant_selection_required,true);
    assert.equal(result.items[0].name,'<b>text</b>');
    assert.equal(result.items[0].description,'<script>data</script>');
    for(const name of ['seller_id','store_id','organization_id','moderation_note','cost','token','future_private_field','page_rank','page_micros']) {
        assert.equal(Object.hasOwn(result.items[0],name),false,name);
    }
    const productSql=sql.find(({text})=>/FROM products p\s+JOIN/u.test(text));
    assert.equal(productSql.text.includes(injection),false);
    assert.equal(productSql.params.includes("%!%!_' OR 1=1 --%"),true);
    assert.equal(productSql.params.at(-1),21);
    assert.equal(sql[0].text,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    assert.equal(sql.at(-1).text,'COMMIT');
    console.log('publicMarketplaceContractSmoke PASS: bounds, microsecond cursors, scope, safe projection, parameterized search');
})().catch((error)=>{console.error(error);process.exitCode=1;});
