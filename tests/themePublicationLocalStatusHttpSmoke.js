'use strict';

// Actual HTTP router, signed Admin/Seller sessions and disposable PostgreSQL.
// Historical publication/artifact rows are deliberate fixtures; this suite does
// not claim renderer QA, READY eligibility, filesystem builds or activation UAT.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express');
const startDisposable=require('./helpers/themePlatformDisposableDb');
const {seedWave2}=require('./helpers/themePlatformWave2Fixtures');
const v=require('../services/themePlatformValidation');
const gates=[];let db,server,cleanup;
const gate=async(name,run)=>{try{await run();gates.push({name,status:'PASS'});db.originalConsole.log(`PASS ${name}`);}
    catch(error){gates.push({name,status:'FAIL'});throw new Error(`${name}: ${error.stack||error.message}`);}};
(async()=>{
    db=await startDisposable();const {pool}=db,fixture=await seedWave2(pool,db.sensitive);
    const theme=crypto.randomUUID(),version=crypto.randomUUID();
    const document={schemaVersion:1,tokens:{accent:'#ee7700',background:'#ffffff',text:'#172a3a',fontFamily:'system',radius:12},components:[],assetIds:[]};
    await pool.query("INSERT INTO themes(id,slug,name) VALUES($1,'local-status-fixture','Status fixture')",[theme]);
    await pool.query("INSERT INTO theme_versions(id,theme_id,version,status,document,digest) VALUES($1,$2,'1.0.0','PUBLISHED',$3,$4)",[version,theme,document,v.digest(document)]);
    const seeded=async store=>{
        const service=crypto.randomUUID(),assignment=crypto.randomUUID(),draft=crypto.randomUUID(),publication=crypto.randomUUID(),operation=crypto.randomUUID();
        const scope=[service,store.org,store.id],overrides={tokens:{},components:[],assetIds:[]};
        await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro')",scope);
        await pool.query("INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel) VALUES($1,$2,$3,$4,$5,'web')",[assignment,...scope,version]);
        await pool.query('INSERT INTO theme_drafts(id,service_id,organization_id,store_id,assignment_id,overrides) VALUES($1,$2,$3,$4,$5,$6)',[draft,...scope,assignment,overrides]);
        await pool.query('INSERT INTO theme_draft_revisions(id,service_id,organization_id,store_id,draft_id,revision,overrides,digest) VALUES($1,$2,$3,$4,$5,1,$6,$7)',[crypto.randomUUID(),...scope,draft,overrides,v.digest(overrides)]);
        await pool.query("INSERT INTO theme_operations(id,service_id,organization_id,store_id,scope_key,actor_id,type,status,idempotency_key,request_hash,correlation_id) VALUES($1,$2,$3,$4,$5,$6,'publication','REQUESTED',$7,$8,$9)",[operation,...scope,service,`admin:${fixture.admin.userId}`,crypto.randomUUID(),'a'.repeat(64),crypto.randomUUID()]);
        await pool.query('INSERT INTO theme_publications(id,service_id,organization_id,store_id,draft_id,draft_revision,operation_id,artifact,digest,policy_revision) VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,1)',[publication,...scope,draft,operation,{internalCanary:'PRIVATE_PUBLICATION_DOCUMENT'},v.digest({publication})]);
        return {service,publication,scope};
    };
    const a=await seeded(fixture.storeA),b=await seeded(fixture.storeB);
    const auth=require('../middlewares/sellerAuthMiddleware').createSellerAuthMiddleware({verifyAccessToken:fixture.tokenService.verify});
    const tenant=require('../middlewares/sellerTenantContext').createSellerTenantContextMiddleware();
    const {createAdminThemeRouter,createSellerThemeRouter}=require('../routes/themePlatformRoutes');
    const app=express();app.use(express.json());app.locals.sellerDatabase=pool;
    app.use('/api/admin/theme-platform',createAdminThemeRouter({database:pool,enabled:true}));
    app.use('/api/seller/v1/theme-platform',createSellerThemeRouter({database:pool,enabled:true,auth,tenant}));
    app.use((_req,res)=>res.status(404).json({code:'NOT_FOUND'}));
    server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
    const request=async({actor=fixture.a,kind='seller/v1',id=a.publication,suffix='',method='GET',body}={})=>{
        const r=await fetch(`http://127.0.0.1:${server.address().port}/api/${kind}/theme-platform/publications/${id}/local-status${suffix}`,{
            method,headers:{...(actor?{authorization:`Bearer ${actor.token}`}:{ }),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
        return {status:r.status,body:await r.json(),headers:r.headers};
    };
    const ok=(response,status=200)=>{assert.equal(response.status,status,`${response.status} ${response.body.code||response.body.error}`);return response.body;};
    const keys=(row,expected)=>assert.deepEqual(Object.keys(row).sort(),expected.sort());
    await gate('L01 actual middleware rejects anonymous and wrong audience',async()=>{
        ok(await request({actor:null}),401);ok(await request({actor:null,kind:'admin'}),401);
        ok(await request({actor:fixture.a,kind:'admin'}),401);ok(await request({actor:fixture.admin}),401);
    });
    await gate('L02 own Seller and authorized Admin read pending status without artifact storage',async()=>{
        const own=ok(await request()),admin=ok(await request({actor:fixture.admin,kind:'admin'}));assert.deepEqual(own,admin);
        assert.deepEqual(own,{publicationId:a.publication,status:'PUBLICATION_REQUESTED',environment:'LOCAL',artifact:null,pointer:null,stages:[]});
        assert.match((await request()).headers.get('cache-control'),/no-store/);
    });
    await gate('L03 foreign store and unknown publication are indistinguishable denied resources',async()=>{
        const foreign=await request({actor:fixture.b}),unknown=await request({id:crypto.randomUUID()});
        ok(foreign,404);ok(unknown,404);assert.deepEqual(foreign.body,unknown.body);
        assert.equal(ok(await request({actor:fixture.b,id:b.publication})).publicationId,b.publication);
    });
    await gate('L04 real roles deny support and unbound Admin while permitting read-only Seller',async()=>{
        ok(await request({actor:fixture.support,kind:'admin'}),403);ok(await request({actor:fixture.unbound,kind:'admin'}),403);
        assert.equal(ok(await request({actor:fixture.viewer})).publicationId,a.publication);
    });
    const artifact=crypto.randomUUID(),digest=v.digest({artifact}),sourceDigest='b'.repeat(64);
    await pool.query("INSERT INTO theme_publication_artifacts(id,service_id,organization_id,store_id,publication_id,channel,digest,source_digest,storage_key,manifest,validation) VALUES($1,$2,$3,$4,$5,'web',$6,$7,$8,$9,$10)",
        [artifact,...a.scope,a.publication,digest,sourceDigest,`artifacts/${digest}`,{internalCanary:'PRIVATE_MANIFEST',absolutePath:'C:/private/artifacts'},{internalCanary:'PRIVATE_VALIDATION',credential:'NOT_A_REAL_SECRET'}]);
    await pool.query("INSERT INTO theme_publication_stage_events(publication_id,state,reason,evidence) VALUES($1,'DEPLOYING','FIXTURE_LOCAL_COPY',$2)",[a.publication,{internalCanary:'PRIVATE_STAGE_EVIDENCE',workerToken:'PRIVATE_WORKER'}]);
    await pool.query("INSERT INTO theme_active_artifacts(service_id,organization_id,store_id,channel,artifact_id,generation) VALUES($1,$2,$3,'web',$4,1)",[...a.scope,artifact]);
    await gate('L05 response allowlists omit documents, storage, validation, stage evidence and internal identity',async()=>{
        const result=ok(await request());keys(result,['publicationId','status','environment','artifact','pointer','stages']);
        keys(result.artifact,['id','channel','digest','source_digest','created_at']);assert.equal(result.artifact.id,artifact);
        keys(result.pointer,['artifact_id','previous_artifact_id','generation','updated_at']);assert.equal(result.pointer.artifact_id,artifact);assert.equal(Number(result.pointer.generation),1);
        keys(result.stages[0],['id','state','reason','created_at']);assert.equal(result.stages[0].reason,'FIXTURE_LOCAL_COPY');
        const raw=JSON.stringify(result);assert(!/PRIVATE_|NOT_A_REAL_SECRET|storage_key|manifest|validation|worker|organization_id|store_id|C:\//.test(raw));
        assert.equal(ok(await request({actor:fixture.b,id:b.publication})).pointer,null);
    });
    await gate('L06 query authority injection and unsupported verbs fail closed',async()=>{
        for(const suffix of [`?serviceId=${b.service}`,'?environment=PRODUCTION','?role=super_admin'])ok(await request({suffix}),400);
        ok(await request({id:'not-a-uuid'}),400);ok(await request({method:'POST',body:{}}),404);
    });
    await gate('L07 read status cannot build or activate and leaves durable rows unchanged',async()=>{
        const counts=async()=>(await pool.query('SELECT (SELECT count(*) FROM theme_publication_stage_events)::int AS stages,(SELECT count(*) FROM theme_publication_artifacts)::int AS artifacts,(SELECT count(*) FROM theme_active_artifacts)::int AS pointers,(SELECT count(*) FROM theme_publication_activations)::int AS activations')).rows[0];
        const before=await counts();for(let i=0;i<3;i++)ok(await request());assert.deepEqual(await counts(),before);
        assert.equal((await pool.query('SELECT status FROM theme_publications WHERE id=$1',[a.publication])).rows[0].status,'PUBLICATION_REQUESTED');
    });
    await gate('L08 suspended service denies status even to Admin without exposing rows',async()=>{
        await pool.query("UPDATE seller_theme_services SET status='SUSPENDED' WHERE id=$1",[a.service]);
        ok(await request(),403);ok(await request({actor:fixture.admin,kind:'admin'}),403);
        ok(await request({actor:fixture.b,id:b.publication}));await pool.query("UPDATE seller_theme_services SET status='ACTIVE' WHERE id=$1",[a.service]);
    });
    await gate('L09 revoked store scope is rechecked on the next signed request',async()=>{
        await pool.query('UPDATE seller_membership_store_scopes SET revoked_at=clock_timestamp() WHERE membership_id=$1',[fixture.a.membershipId]);
        ok(await request(),404);ok(await request({actor:fixture.viewer}));
    });
    await gate('L10 revoked Admin session denies subsequent reads',async()=>{
        await pool.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[fixture.admin.sessionId]);
        ok(await request({actor:fixture.admin,kind:'admin'}),401);
    });
})().catch(error=>{(db?.originalConsole.error||console.error)(db?db.redact(error.stack):error.message);process.exitCode=1;})
 .finally(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)cleanup=await db.cleanup();
    console.log(JSON.stringify({suite:'themePublicationLocalStatusHttpSmoke',result:process.exitCode?'FAIL':'PASS',pass:gates.filter(x=>x.status==='PASS').length,fail:gates.filter(x=>x.status==='FAIL').length,skip:10-gates.length,gates,cleanup,
        scope:'real HTTP/session middleware and PostgreSQL; explicit historical rows, no renderer/QA authority doubles, no publication activation proof'}));});
