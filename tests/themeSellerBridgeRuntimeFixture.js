'use strict';
// Local full-source bridge fixture. Creates ONLY a new owned PostgreSQL database.
// Stocky identities come from the separately provisioned R22 normal-login fixture.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const express=require('express'),startDisposable=require('./helpers/themePlatformDisposableDb');
const out=process.argv[2],dirs=process.argv.slice(3).filter(value=>value!=='--execute-disposable-db');
assert(path.isAbsolute(out)&&dirs.length>=1&&dirs.length<=2);
assert(!fs.existsSync(path.join(out,'stop-runtime')),'Use a fresh owned runtime output directory');
const callbackPorts=process.env.THEME_BRIDGE_CALLBACK_PORTS?.split(',').map(Number);
if(callbackPorts)assert(callbackPorts.length===dirs.length&&callbackPorts.every(port=>Number.isInteger(port)&&port>1024&&port<65536));
const states=dirs.map(dir=>{
    const full=path.resolve(dir);assert.equal(path.dirname(full),path.resolve(os.tmpdir()));assert(path.basename(full).startsWith('novastore-r22-s09-'));
    const state=JSON.parse(fs.readFileSync(path.join(full,'state.json'),'utf8'));
    assert.equal(state.purpose,'r22-authenticated-tenant-sales-acceptance');assert(/^[a-f0-9]{16}$/.test(state.token));
    assert.equal(state.central_database,`stocky_r22_test_${state.token}`);assert(state.port>1024&&state.port<65536);
    assert.equal(state.tenants[0].tenant_host,'127.0.0.1');return state;
});
let db,server; const events=[];
const nativeFixture=process.env.THEME_BRIDGE_NATIVE_FIXTURE==='1';
let storageRoot,nativeImported;
(async()=>{
    db=await startDisposable();const pool=db.pool;
    if(nativeFixture)storageRoot=fs.mkdtempSync(path.join(os.tmpdir(),'novastore-theme-bridge-assets-'));
    const contexts=[],secretsByRef={};
    for(const [index,state] of states.entries()) {
        const source=state.tenants[0],label=index===0?'A':'B';
        for(const value of [state.appKey,state.database_password,source.secret,source.operator_password])db.sensitive.add(value);
        const userId=Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,'unused','customer',TRUE) RETURNING id",[`Bridge ${label}`,`bridge-${label.toLowerCase()}@example.test`])).rows[0].id);
        const approver=Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,'unused','admin',TRUE) RETURNING id",[`Approver ${label}`,`approver-${label.toLowerCase()}@example.test`])).rows[0].id);
        if(nativeFixture&&!nativeImported){
            await pool.query("INSERT INTO theme_admin_roles(user_id,role) VALUES($1,'super_admin')",[approver]);
            const session=await require('../services/authSessionService').issueAccessSession({queryable:pool,userId:approver,role:'admin',principal:'admin'});
            db.sensitive.add(session.token);
            const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'../theme-platform/packages/nova-classic-studio-web-v1_1.json'),'utf8'));
            nativeImported=(await require('../services/themePlatformExperienceService').createThemeExperienceService(pool,{storageRoot})
                .execute({kind:'admin',userId:approver,sessionId:session.sessionId},'importPackage',{},
                    {package:pkg,reason:'Owned historical preview fixture using authoritative native package importer'},
                    {idempotencyKey:crypto.randomUUID()})).result;
        }
        const org=Number((await pool.query('INSERT INTO seller_organizations(external_key,display_name) VALUES($1,$2) RETURNING id',[crypto.randomUUID(),`Bridge organization ${label}`])).rows[0].id);
        const legacy=Number((await pool.query('INSERT INTO stores(name,slug) VALUES($1,$2) RETURNING id',[`Bridge store ${label}`,`bridge-runtime-${label.toLowerCase()}`])).rows[0].id);
        const store=Number((await pool.query('INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,$3) RETURNING id',[org,legacy,`Bridge store ${label}`])).rows[0].id);
        const role=Number((await pool.query("SELECT id FROM seller_roles WHERE code='owner' AND organization_id IS NULL")).rows[0].id);
        const stamp=crypto.randomUUID(),member=Number((await pool.query('INSERT INTO seller_memberships(organization_id,user_id,role_id,security_stamp) VALUES($1,$2,$3,$4) RETURNING id',[org,userId,role,stamp])).rows[0].id);
        await pool.query('INSERT INTO seller_membership_store_scopes(membership_id,organization_id,store_id) VALUES($1,$2,$3)',[member,org,store]);
        const secretRef=`bridge-fixture-${label}`;secretsByRef[secretRef]=source.secret;
        await pool.query(`INSERT INTO stocky_connector_connections(id,organization_id,store_id,remote_store_id,endpoint_origin,key_id,secret_ref)
            VALUES($1,$2,$3,$4,$5,$6,$7)`,[source.connection_key,org,store,source.remote_store_id,`http://127.0.0.1:${callbackPorts?.[index]||state.port}`,source.key_id,secretRef]);
        await pool.query(`INSERT INTO theme_seller_bridge_mappings(id,connection_id,tenant_id,stocky_user_id,organization_id,store_id,membership_id,user_id,approved_by_user_id,approval_reason)
            VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,'Closure authorized existing fixture human, no inference')`,[crypto.randomUUID(),source.connection_key,source.tenant_id,org,store,member,userId,approver]);
        const theme=crypto.randomUUID(),version=nativeImported?.id||crypto.randomUUID(),service=crypto.randomUUID(),assignment=crypto.randomUUID(),draft=crypto.randomUUID();
        const document={schemaVersion:1,tokens:{accent:'#ee7700',background:'#ffffff',text:'#172a3a',fontFamily:'system',radius:12},
            components:[{id:'hero-main',type:'hero',props:{title:`Nova Store ${label}`,subtitle:'Gerçek oturum kabul testi',target:'/shop'}}],assetIds:[]};
        if(!nativeFixture){
            await pool.query('INSERT INTO themes(id,slug,name) VALUES($1,$2,$3)',[theme,`bridge-fixture-${label.toLowerCase()}`,`Nova Store ${label}`]);
            await pool.query("INSERT INTO theme_versions(id,theme_id,version,status,document,digest) VALUES($1,$2,'1.0.0','PUBLISHED',$3,$4)",[version,theme,document,crypto.createHash('sha256').update(JSON.stringify(document)).digest('hex')]);
        }
        await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro')",[service,org,store]);
        // This explicitly models an existing historical assignment for editor
        // compatibility. It is NOT a READY/new assignment or publication bypass.
        await pool.query("INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel,commerce_mode,status,accepted_at) VALUES($1,$2,$3,$4,$5,'web',$6,'ACCEPTED',clock_timestamp())",[assignment,service,org,store,version,nativeFixture?'SINGLE_STORE':'MARKETPLACE']);
        const overrides=nativeFixture?{studio:{}}:{tokens:{},components:[],assetIds:[]};
        await pool.query('INSERT INTO theme_drafts(id,service_id,organization_id,store_id,assignment_id,overrides) VALUES($1,$2,$3,$4,$5,$6)',[draft,service,org,store,assignment,overrides]);
        await pool.query('INSERT INTO theme_draft_revisions(id,service_id,organization_id,store_id,draft_id,revision,overrides,digest) VALUES($1,$2,$3,$4,$5,1,$6,$7)',[crypto.randomUUID(),service,org,store,draft,overrides,require('../services/themePlatformValidation').digest(overrides)]);
        let supportThreadId;
        if(nativeFixture){
            const customerId=Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,'unused','customer',TRUE) RETURNING id",[`Support customer ${label}`,`support-customer-${label.toLowerCase()}@example.test`])).rows[0].id);
            supportThreadId=crypto.randomUUID();const requestId=crypto.randomUUID(),subject=`${label} mağazası ürün sorusu`,body=`${label} mağazasındaki ürün için teslimat bilgisini öğrenebilir miyim?`;
            await pool.query(`INSERT INTO theme_store_support_threads(id,service_id,organization_id,store_id,customer_id,recipient,policy_revision,subject,client_request_id,request_hash)
                VALUES($1,$2,$3,$4,$5,'SELLER',0,$6,$7,$8)`,[supportThreadId,service,org,store,customerId,subject,requestId,require('../services/themePlatformValidation').digest({subject,body})]);
            await pool.query(`INSERT INTO theme_store_support_messages(thread_id,service_id,organization_id,store_id,sender_kind,sender_user_id,body,client_message_id,request_hash)
                VALUES($1,$2,$3,$4,'CUSTOMER',$5,$6,$7,$8)`,[supportThreadId,service,org,store,customerId,body,requestId,require('../services/themePlatformValidation').digest({body})]);
        }
        contexts.push({label,userId,organizationId:org,storeId:store,membershipId:member,assignmentId:assignment,draftId:draft,serviceId:service,
            loginUrl:`http://127.0.0.1:${state.port}/login`,testUrl:`http://127.0.0.1:${state.port}/__theme_bridge_acceptance.html`,
            operatorEmail:source.operator_email,operatorPassword:source.operator_password,supportThreadId});
    }
    const runtime={enabled:true,localOnly:true,secretsByRef};
    const app=express();app.use(express.json({limit:'7mb',verify:(req,_res,bytes)=>{req.themeBridgeBodyBytes=bytes.length;}}));
    app.use('/api/theme-seller-bridge',(req,res,next)=>{
        const assertion=req.body?.assertion;
        res.on('finish',()=>events.push({time:new Date().toISOString(),status:res.statusCode,action:req.body?.request?.path||null,
            mappedContext:states.findIndex(s=>s.tenants[0].connection_key===assertion?.connectionId),noBrowserBearer:!req.get('Authorization')}));next();
    });
    app.use('/api/theme-seller-bridge',require('../routes/themeSellerBridgeRoutes').createThemeSellerBridgeRouter({database:pool,enabled:true,runtime,storageRoot}));
    server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    const port=server.address().port;
    fs.mkdirSync(out,{recursive:true});
    const ownedDatabase=process.env.DB_NAME,ownedPostgresContainer=ownedDatabase.replace(/^novastore_theme_wave1_([a-f0-9]{16})_test$/,'novastore-theme-wave1-$1');
    assert(/^novastore-theme-wave1-[a-f0-9]{16}$/.test(ownedPostgresContainer));
    fs.writeFileSync(path.join(out,'runtime-private.json'),JSON.stringify({port,contexts,states:dirs,storageRoot,ownedDatabase,ownedPostgresContainer},null,2),{mode:0o600});
    const report=()=>{
        const content=JSON.stringify({source:'real PC1 Theme router/services and PostgreSQL; real signed Stocky introspection, no auth mock',port,
            loginUrls:contexts.map(c=>c.loginUrl),migrationCount:db.migrations.length,presentationClaim:nativeFixture?'HISTORICAL_NATIVE_PREVIEW_ONLY':'TYPED_V1_AUTH_ONLY',
            nativePackage:nativeImported?{id:nativeImported.id,digest:nativeImported.package_digest}:null,events},null,2);
        for(const secret of db.sensitive)assert(!content.includes(secret));fs.writeFileSync(path.join(out,'runtime-evidence.json'),content);
    };
    let closing=false;
    const close=async()=>{if(closing)return;closing=true;report();await new Promise(resolve=>server.close(resolve));const cleanup=await db.cleanup();fs.writeFileSync(path.join(out,'cleanup.json'),JSON.stringify(cleanup,null,2));process.exit(0);};
    setInterval(()=>{if(closing)return;report();if(fs.existsSync(path.join(out,'stop-runtime')))void close();},3000).unref();
    process.once('SIGINT',close);process.once('SIGTERM',close);
    db.originalConsole.log(JSON.stringify({result:'READY',port,loginUrls:contexts.map(c=>c.loginUrl),privateFile:path.join(out,'runtime-private.json')}));
})().catch(async error=>{(db?.originalConsole.error||console.error)(db?db.redact(error.stack):error.message);if(db)await db.cleanup();process.exitCode=1;});
