'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express'),fs=require('node:fs/promises'),path=require('node:path');
let db,server,cleanup;const gates=[];
const gate=async(name,run)=>{try{await run();gates.push({name,status:'PASS'});}catch(error){gates.push({name,status:'FAIL'});throw error;}};
(async()=>{
    db=await require('./helpers/themePlatformDisposableDb')();
    const seed=await require('./helpers/themePlatformWave2Fixtures').seedWave2(db.pool,db.sensitive);
    const content=require('../services/themePlatformStoreContentService');
    const {createAdminThemeRouter}=require('../routes/themePlatformRoutes');
    const app=express();app.use(express.json({limit:'1mb'}));
    app.use('/api/admin/theme-platform',createAdminThemeRouter({database:db.pool,enabled:true}));
    server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
    const request=async(route,body,{method=body?'POST':'GET',token=seed.admin.token,key=crypto.randomUUID()}={})=>{
        const response=await fetch(`http://127.0.0.1:${server.address().port}/api/admin/theme-platform${route}`,{
            method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{})});
        return{status:response.status,body:await response.json()};
    };
    const ok=(value)=>{assert.equal(value.status,200,JSON.stringify(value.body));return value.body;};
    const reason='Disposable store content acceptance only';
    const services={};
    for(const [label,store]of Object.entries({A:seed.storeA,B:seed.storeB}))services[label]=ok(await request('/services',{
        storeId:store.id,plan:'pro',status:'ACTIVE',startsAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',reason})).result;
    const base=`/services/${services.A.id}`;
    const profile={displayName:'Local Test Shop',legalBusinessName:'TEST BUSINESS ONLY',email:'test@example.test',
        address:'TEST ADDRESS',city:'TEST CITY',country:'TR',socialLinks:{instagram:'https://example.test/test'}};
    const read=()=>content.readPublicStoreContent(db.pool,services.A);
    let first,second;
    await gate('L01 private contact uses explicit scoped public fields and idempotent CAS',async()=>{
        const key=crypto.randomUUID();const body={expectedRevision:0,profile,reason};
        const saved=ok(await request(base+'/contact',body,{method:'PUT',key}));
        assert.equal(saved.result.revision,1);
        assert.deepEqual(ok(await request(base+'/contact',body,{method:'PUT',key})),saved);
        assert.equal((await request(base+'/contact',body,{method:'PUT'})).status,409);
        assert.equal((await request(base+'/contact',{...body,profile:{...profile,privateBillingAddress:'forbidden'}},{method:'PUT'})).status,400);
        assert.equal((await read()).storeIdentity.displayName,profile.displayName);
        assert.equal((await content.readPublicStoreContent(db.pool,services.B)).storeIdentity.displayName,null);
    });
    await gate('L02 support, catalog admin and unbound admin cannot mutate contact',async()=>{
        for(const actor of [seed.support,seed.themeAdmin,seed.unbound]){
            const response=await request(base+'/contact',{expectedRevision:1,profile,reason},{method:'PUT',token:actor.token});
            assert.equal(response.status,403);
        }
    });
    const create=async(type,extra={})=>ok(await request(base+'/legal-documents',{locale:'tr-TR',type,content:`TEST FIXTURE ONLY — ${type} ${crypto.randomUUID()}`,reason,...extra})).result;
    const approve=async(document,extra={})=>ok(await request(`${base}/legal-documents/${document.id}/approve`,{
        expectedRevision:document.revision,effectiveAt:'2026-01-01T00:00:00Z',expiresAt:null,reason,...extra})).result;
    await gate('L03 legal draft is not public and missing legal requirements block publication',async()=>{
        first=await create('privacy');assert.equal((await read()).documents.length,0);
        await assert.rejects(content.publicationLegalAuthority(db.pool,{service:services.A}),error=>error.code==='THEME_LEGAL_REQUIRED');
        assert.equal((await request(`${base}/legal-documents`,{locale:'tr-TR',type:'privacy',content:'x',reason,approved:true})).status,400);
    });
    await gate('L04 approval exposes exact version and immutable content hash',async()=>{
        first=await approve(first);
        const current=(await read()).documents[0];assert.equal(current.documentId,first.id);
        assert.equal(current.contentHash,crypto.createHash('sha256').update(first.content).digest('hex'));
        await assert.rejects(db.pool.query('UPDATE theme_store_legal_documents SET content=$2 WHERE id=$1',[first.id,'modified']),/IMMUTABLE/);
        await assert.rejects(db.pool.query('DELETE FROM theme_store_legal_documents WHERE id=$1',[first.id]),/HISTORY_REQUIRED/);
        const foreign=await request(`/services/${services.B.id}/legal-documents/${first.id}/revoke`,{expectedRevision:first.revision,reason});
        assert.equal(foreign.status,404);
    });
    await gate('L05 future policy does not replace currently effective policy',async()=>{
        second=await create('privacy');second=await approve(second,{effectiveAt:'2098-01-01T00:00:00Z'});
        assert.equal((await read()).documents[0].documentId,first.id);
        assert.equal((await request(`${base}/legal-documents/${second.id}/approve`,{expectedRevision:second.revision,effectiveAt:'2026-01-01T00:00:00Z',expiresAt:null,reason})).status,409);
    });
    await gate('L06 revoking effective replacement cannot resurrect older approved content',async()=>{
        const third=await approve(await create('privacy'));
        assert.equal((await read()).documents[0].documentId,third.id);
        ok(await request(`${base}/legal-documents/${third.id}/revoke`,{expectedRevision:third.revision,reason}));
        assert.equal((await read()).documents.length,0);
    });
    await gate('L07 expired replacement cannot resurrect older approved content',async()=>{
        await approve(await create('privacy'),{effectiveAt:'2020-01-01T00:00:00Z',expiresAt:'2021-01-01T00:00:00Z'});
        assert.equal((await read()).documents.length,0);
    });
    await gate('L08 explicit nine policy versions and public profile satisfy technical publication completeness',async()=>{
        for(const type of content.TYPES)await approve(await create(type));
        const authority=await content.publicationLegalAuthority(db.pool,{service:services.A});
        assert.equal(authority.legalReferences.length,9);assert.equal(authority.storeIdentity.revision,1);
        assert(authority.legalReferences.every(row=>row.contentHash.length===64));
        assert(!JSON.stringify(authority).includes('password'));
        await assert.rejects(content.publicationLegalAuthority(db.pool,{service:services.B}),error=>error.code==='THEME_LEGAL_REQUIRED');
    });
    await gate('L09 concurrent legal creates serialize monotonic immutable versions',async()=>{
        const rows=await Promise.all([create('terms'),create('terms')]);
        assert.equal(new Set(rows.map(row=>row.version)).size,2);
        assert.deepEqual(rows.map(row=>row.version).sort(),[2,3]);
    });
    await gate('L10 mutation has durable operation audit and outbox but no commerce mutations',async()=>{
        const rows=(await db.pool.query("SELECT action FROM theme_audit_events WHERE action LIKE 'theme.store.%'")).rows;assert(rows.length>=25);
        assert.equal((await db.pool.query('SELECT COUNT(*)::int n FROM orders')).rows[0].n,0);
        assert.equal((await request(base+'/store-content?storeId='+seed.storeB.id)).status,400);
        assert.equal(ok(await request(base+'/store-content')).public.documents.length,9);
    });
})().catch(error=>{(db?.originalConsole.error||console.error)(db?db.redact(error.stack||error.message):error.message);process.exitCode=1;})
 .finally(async()=>{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(db)try{cleanup=await db.cleanup();}catch(error){console.error(error.message);process.exitCode=1;}
    const result={suite:'themeStoreContentPostgresSmoke',status:process.exitCode?'FAIL':'PASS',pass:gates.filter(x=>x.status==='PASS').length,fail:gates.filter(x=>x.status==='FAIL').length,skip:0,gates,cleanup,
        legalText:'Explicit disposable TEST FIXTURE text only; no legal sufficiency or production content claim'};
    const index=process.argv.indexOf('--evidence-dir');if(index>=0){const dir=path.resolve(process.argv[index+1]);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'store-content-results.json'),JSON.stringify(result,null,2)+'\n');}
    console.log(JSON.stringify(result));
 });
