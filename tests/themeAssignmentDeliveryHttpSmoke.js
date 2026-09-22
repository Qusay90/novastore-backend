'use strict';

// Real HTTP/session middleware, importer and PostgreSQL. No registry mutation,
// assignment-authority injection or manufactured READY evidence is allowed.
// The genuine READY positive remains explicitly pending until owner acceptance;
// the still-unaccepted Classic app channel supplies an independent negative.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const startDisposable=require('./helpers/themePlatformDisposableDb'),{seedWave2}=require('./helpers/themePlatformWave2Fixtures');
const gates=[];let db,server,storageRoot,cleanup,ready=false;
const gate=async(name,run)=>{try{await run();gates.push({name,status:'PASS'});db.originalConsole.log(`PASS ${name}`);}
    catch(error){gates.push({name,status:'FAIL'});throw new Error(`${name}: ${error.stack||error.message}`);}};
(async()=>{
    db=await startDisposable();const {pool}=db,fixture=await seedWave2(pool,db.sensitive),uuid=()=>crypto.randomUUID();
    storageRoot=await fs.mkdtemp(path.join(os.tmpdir(),'novastore-assignment-delivery-'));
    const packageValue=JSON.parse(await fs.readFile(path.join(__dirname,'../theme-platform/packages/nova-classic-studio-web-v1_1.json'),'utf8'));
    const imported=(await require('../services/themePlatformExperienceService').createThemeExperienceService(pool,{storageRoot})
        .execute({kind:'admin',userId:fixture.admin.userId,sessionId:fixture.admin.sessionId},'importPackage',{},
            {package:packageValue,reason:'Real imported package for assignment delivery contract'}, {idempotencyKey:uuid()})).result;
    const presentation=require('../services/themePlatformPresentationService');
    ready=presentation.presentationReadiness(await presentation.loadPresentation(pool,imported.id,'web'),'web').assignmentEligible;
    const service=uuid();await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro')",[service,fixture.storeA.org,fixture.storeA.id]);
    const historicalService=uuid();await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro')",[historicalService,fixture.storeB.org,fixture.storeB.id]);
    const historical=uuid();await pool.query("INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel,commerce_mode) VALUES($1,$2,$3,$4,$5,'web','MARKETPLACE')",[historical,historicalService,fixture.storeB.org,fixture.storeB.id,imported.id]);
    const historicalBefore=(await pool.query('SELECT row_to_json(a) AS value FROM theme_assignments a WHERE id=$1',[historical])).rows[0].value;
    const auth=require('../middlewares/sellerAuthMiddleware').createSellerAuthMiddleware({verifyAccessToken:fixture.tokenService.verify}),tenant=require('../middlewares/sellerTenantContext').createSellerTenantContextMiddleware();
    const routes=require('../routes/themePlatformRoutes'),app=express();app.use(express.json());app.locals.sellerDatabase=pool;
    app.use('/api/admin/theme-platform',routes.createAdminThemeRouter({database:pool,enabled:true,storageRoot}));
    app.use('/api/seller/v1/theme-platform',routes.createSellerThemeRouter({database:pool,enabled:true,auth,tenant,storageRoot}));
    app.use((_req,res)=>res.status(404).json({code:'NOT_FOUND'}));
    server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
    const request=async(relative,body,{actor=fixture.admin,key=uuid(),kind='admin'}={})=>{
        const r=await fetch(`http://127.0.0.1:${server.address().port}/api/${kind}/theme-platform${relative}`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':key,...(actor?{authorization:`Bearer ${actor.token}`}:{})},body:JSON.stringify(body)});
        return {status:r.status,body:await r.json()};
    };
    const ok=(r,status=200,code)=>{assert.equal(r.status,status,`${r.status} ${r.body.code||r.body.error}`);if(code)assert.equal(r.body.code,code);return r.body;};
    const assignBody={themeVersionId:imported.id,channel:'web',reason:'Admin single-store assignment'};
    const assign=(body=assignBody,options)=>request(`/services/${service}/assignments`,body,options);
    const retry=(id,body={expectedRevision:1,reason:'Canonical connection now available'},options)=>request(`/assignments/${id}/delivery-retry`,body,options);
    await gate('D01 explicit non-single-store modes and extra authority fields are rejected',async()=>{
        for(const commerceMode of ['MARKETPLACE','UNKNOWN',null,1])ok(await assign({...assignBody,commerceMode}),400);
        ok(await assign({...assignBody,connectionId:uuid()}),400);
        ok(await retry(historical,{expectedRevision:1,reason:'No browser connection',connectionId:uuid()}),400);
    });
    await gate('D02 anonymous and unauthorized actors cannot assign or request delivery',async()=>{
        ok(await assign(assignBody,{actor:null}),401);ok(await retry(historical,undefined,{actor:null}),401);
        ok(await retry(historical,undefined,{actor:fixture.support}),403);
        ok(await retry(historical,undefined,{actor:fixture.a,kind:'seller/v1'}),404);
    });
    await gate('D03 historical marketplace assignment is neither migrated nor delivered',async()=>{
        ok(await retry(historical),409,'THEME_ASSIGNMENT_MODE_UNSUPPORTED');
        assert.deepEqual((await pool.query('SELECT row_to_json(a) AS value FROM theme_assignments a WHERE id=$1',[historical])).rows[0].value,historicalBefore);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM theme_stocky_deliveries WHERE assignment_id=$1',[historical])).rows[0].n,0);
    });
    await gate('D04 unknown assignments are inaccessible and suspended service blocks retry',async()=>{
        ok(await retry(uuid()),404);await pool.query("UPDATE seller_theme_services SET status='SUSPENDED' WHERE id=$1",[historicalService]);
        ok(await retry(historical),403,'THEME_SERVICE_INACTIVE');await pool.query("UPDATE seller_theme_services SET status='ACTIVE' WHERE id=$1",[historicalService]);
    });
    await gate('D05 actual PARTIAL Classic app package fails closed without assignment or delivery',async()=>{
        const appRecord=require('../theme-platform/presentations.json').inventory.find(item=>item.themeId==='15-nova-classic'&&item.channel==='app');
        assert(appRecord,'Known source family and app channel must exist');assert.equal(appRecord.status,'PARTIAL');
        assert.equal(appRecord.assignmentEligible,false);assert.equal(appRecord.runtimeReady,false);
        const appPackage=JSON.parse(await fs.readFile(path.join(__dirname,'../theme-platform/packages/nova-classic-canonical.json'),'utf8'));
        assert.equal(appPackage.theme.slug,'nova-classic-canonical');assert(appPackage.supportedChannels.includes('app'));
        const appImport=(await require('../services/themePlatformExperienceService').createThemeExperienceService(pool,{storageRoot})
            .execute({kind:'admin',userId:fixture.admin.userId,sessionId:fixture.admin.sessionId},'importPackage',{},
                {package:appPackage,reason:'Existing unconnected Classic app package, no renderer substitution'},{idempotencyKey:uuid()})).result;
        const appPresentation=await presentation.loadPresentation(pool,appImport.id,'app');
        assert.equal(appPresentation,null,'Original legacy app has no reviewed renderer; never borrow web identity');
        assert.equal(presentation.presentationReadiness(appPresentation,'app').assignmentEligible,false);
        const before=(await pool.query('SELECT count(*)::int AS n FROM theme_assignments')).rows[0].n;
        for(const extra of [{},{commerceMode:'SINGLE_STORE'}])ok(await assign({...assignBody,themeVersionId:appImport.id,channel:'app',...extra}),409,'THEME_PRESENTATION_NOT_READY');
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM theme_assignments')).rows[0].n,before);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM theme_stocky_deliveries')).rows[0].n,0);
    });
    if(!ready){
        gates.push({name:'D06 genuinely READY assignment and durable delivery retry',status:'SKIP',reason:'Actual Classic registry acceptance is not READY; never mutate or fake it'});
    }else{
        await gate('D06 genuinely READY assignment and durable delivery retry',async()=>{
            const assigned=ok(await assign()).result;assert.equal(assigned.assignment.commerce_mode,'SINGLE_STORE');assert.equal(assigned.delivery.state,'PREPARED');assert.equal(assigned.delivery.deliveryVerified,false);
            const id=assigned.assignment.id,revision=Number(assigned.assignment.revision),body={expectedRevision:revision,reason:'Canonical connector installed after preparation'};
            ok(await retry(id,body),409,'THEME_STOCKY_CONNECTION_REQUIRED');
            const connection=uuid();await pool.query("INSERT INTO stocky_connector_connections(id,organization_id,store_id,remote_store_id,endpoint_origin,key_id,secret_ref) VALUES($1,$2,$3,'assignment-fixture-remote','http://127.0.0.1:64999','fixture','owned-fixture-secret')",[connection,fixture.storeA.org,fixture.storeA.id]);
            ok(await retry(id,{...body,expectedRevision:revision+1}),409,'THEME_REVISION_CONFLICT');
            const key=uuid(),simultaneous=await Promise.all([retry(id,body,{key}),retry(id,body,{key})]);
            const first=ok(simultaneous[0]);assert.equal(first.result.delivery.state,'DELIVERY_PENDING');
            assert.equal(ok(simultaneous[1]).result.delivery.eventId,first.result.delivery.eventId);
            const replay=ok(await retry(id,body,{key}));assert.equal(replay.result.delivery.eventId,first.result.delivery.eventId);
            ok(await retry(id,body),409,'THEME_DELIVERY_ALREADY_QUEUED');
            const rows=(await pool.query('SELECT d.connection_id,o.payload,o.operation_id FROM theme_stocky_deliveries d JOIN theme_outbox o ON o.id=d.outbox_id WHERE d.assignment_id=$1',[id])).rows;
            assert.equal(rows.length,1);assert.equal(rows[0].connection_id,connection);assert.equal(rows[0].payload.store_id,'assignment-fixture-remote');assert.equal(rows[0].payload.assignment_id,id);
            assert.equal((await pool.query("SELECT count(*)::int AS n FROM theme_audit_events WHERE action='theme.assignment.delivery.retried' AND target_id=$1",[id])).rows[0].n,1);
            // Use the supported withdrawal before another assignment in this
            // channel. Never remove or modify the separate historical fixture.
            ok(await request(`/assignments/${id}/withdraw`,{expectedRevision:revision,reason:'Completed first assignment delivery case'}));
            const direct=ok(await assign({...assignBody,commerceMode:'SINGLE_STORE'})).result;assert.equal(direct.assignment.commerce_mode,'SINGLE_STORE');assert.equal(direct.delivery.state,'DELIVERY_PENDING');
            assert.deepEqual((await pool.query('SELECT row_to_json(a) AS value FROM theme_assignments a WHERE id=$1',[historical])).rows[0].value,historicalBefore);
        });
    }
})().catch(error=>{(db?.originalConsole.error||console.error)(db?db.redact(error.stack):error.message);process.exitCode=1;})
 .finally(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)cleanup=await db.cleanup();if(storageRoot){
        assert.equal(path.dirname(path.resolve(storageRoot)),path.resolve(os.tmpdir()));assert(path.basename(storageRoot).startsWith('novastore-assignment-delivery-'));
        assert.equal(await fs.realpath(storageRoot),path.resolve(storageRoot));await fs.rm(storageRoot,{recursive:true,force:true});}
    console.log(JSON.stringify({suite:'themeAssignmentDeliveryHttpSmoke',result:process.exitCode?'FAIL':ready?'PASS':'PENDING_REAL_READY_POSITIVE',readyAuthority:ready,pass:gates.filter(x=>x.status==='PASS').length,fail:gates.filter(x=>x.status==='FAIL').length,skip:gates.filter(x=>x.status==='SKIP').length,gates,cleanup,
        scope:'actual HTTP, signed session, importer and PostgreSQL; no fake READY, no delivery network or Stocky receipt claim'}));});
