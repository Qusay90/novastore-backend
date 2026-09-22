'use strict';

// Real PostgreSQL16, filesystem and raster storage. Renderer/QA/Legal authority
// providers below are explicit test doubles, NOT live readiness or browser proof.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Module,createRequire}=require('node:module');
const sharp=require('sharp');
const startDisposable=require('./helpers/themePlatformDisposableDb');
const {seedWave2}=require('./helpers/themePlatformWave2Fixtures');
const v=require('../services/themePlatformValidation');
const {createThemeAssetStorage}=require('../services/themePlatformAssetStorage');
const {createThemeArtifactStorage}=require('../services/themePlatformArtifactStorage');
const {createThemePublicationService}=require('../services/themePlatformPublicationService');
const {createThemeAssetLifecycleService}=require('../services/themePlatformAssetLifecycleService');
const {REQUIRED_COMMERCE,REQUIRED_LEGAL}=require('../services/themePlatformPublicationValidation');
// Each negative scenario gets a frozen registry clone through a private module
// dependency resolver. Never mutate the reviewed registry, require.cache or a
// running server's readiness to simulate a future PARTIAL/BLOCKED build.
const freezeDeep=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}return value;};
const loadIsolated=(relative,overrides)=>{
    const filename=require.resolve(relative),isolated=new Module(filename,module),nativeRequire=createRequire(filename);
    isolated.filename=filename;isolated.paths=Module._nodeModulePaths(path.dirname(filename));
    isolated.require=specifier=>Object.hasOwn(overrides,specifier)?overrides[specifier]:nativeRequire(specifier);
    isolated._compile(require('node:fs').readFileSync(filename,'utf8'),filename);return isolated.exports;
};
const registryFixture=status=>{
    const registry=structuredClone(require('../theme-platform/presentations.json'));
    for(const row of registry.inventory)if(row.themeId==='15-nova-classic'&&row.channel==='web'){
        row.status=status;if(status!=='READY'){row.runtimeReady=false;row.acceptance.customerRuntime='PENDING';}
    }
    const presentations=loadIsolated('../services/themePlatformPresentationService',{'../theme-platform/presentations.json':freezeDeep(registry)});
    const service=loadIsolated('../services/themePlatformPublicationService',{'./themePlatformPresentationService':presentations});
    return Object.freeze({presentations,create:service.createThemePublicationService});
};
const gates=[];let db,rootDir;
const gate=async(name,run)=>{try{await run();gates.push({name,status:'PASS'});db.originalConsole.log(`PASS ${name}`);}
    catch(error){gates.push({name,status:'FAIL'});throw new Error(`${name}: ${error.stack||error.message}`);}};
(async()=>{
    db=await startDisposable();const {pool}=db;
    assert(db.migrations.includes('20260919_wave2_zpublication_lifecycle'),'Publication migration must be registered and applied normally.');
    rootDir=await fs.mkdtemp(path.join(os.tmpdir(),'novastore-publication-db-'));
    const assets=createThemeAssetStorage({rootDir:path.join(rootDir,'media')}),artifacts=createThemeArtifactStorage({rootDir:path.join(rootDir,'builds')});
    const fixture=await seedWave2(pool,db.sensitive);
    const principal={kind:'admin',userId:fixture.admin.userId,sessionId:fixture.admin.sessionId};
    const otherSeller={kind:'seller',userId:fixture.b.userId,sessionId:fixture.b.sessionId};
    let service=(await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro') RETURNING *",[crypto.randomUUID(),fixture.storeA.org,fixture.storeA.id])).rows[0];
    const nativePackage=JSON.parse(await fs.readFile(path.join(__dirname,'../theme-platform/packages/nova-classic-studio-web-v1_1.json'),'utf8'));
    const imported=(await require('../services/themePlatformExperienceService').createThemeExperienceService(pool,{storage:assets}).execute(principal,'importPackage',{},
        {package:nativePackage,reason:'Explicit disposable publication fixture'}, {idempotencyKey:crypto.randomUUID()})).result;
    const version=(await pool.query('SELECT * FROM theme_versions WHERE id=$1',[imported.id])).rows[0];
    let assignmentId,draftId,draftRevision=0;
    const makePublication=async({overrides={studio:{}},mode='SINGLE_STORE'}={})=>{
        const operationId=crypto.randomUUID(),id=crypto.randomUUID();
        draftRevision+=1;
        if(!assignmentId){
            assignmentId=crypto.randomUUID();draftId=crypto.randomUUID();
            await pool.query("INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel,commerce_mode) VALUES($1,$2,$3,$4,$5,'web',$6)",[assignmentId,service.id,service.organization_id,service.store_id,version.id,mode]);
            await pool.query('INSERT INTO theme_drafts(id,service_id,organization_id,store_id,assignment_id,overrides) VALUES($1,$2,$3,$4,$5,$6)',[draftId,service.id,service.organization_id,service.store_id,assignmentId,overrides]);
        } else await pool.query('UPDATE theme_drafts SET overrides=$2,revision=$3 WHERE id=$1',[draftId,overrides,draftRevision]);
        await pool.query('INSERT INTO theme_draft_revisions(id,service_id,organization_id,store_id,draft_id,revision,overrides,digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[crypto.randomUUID(),service.id,service.organization_id,service.store_id,draftId,draftRevision,overrides,v.digest(overrides)]);
        await pool.query(`INSERT INTO theme_operations(id,service_id,organization_id,store_id,scope_key,actor_id,type,status,idempotency_key,request_hash,correlation_id)
            VALUES($1,$2::uuid,$3,$4,$2::text,$5,'publication','REQUESTED',$6,$7,$8)`,[operationId,service.id,service.organization_id,service.store_id,`admin:${principal.userId}`,crypto.randomUUID(),'a'.repeat(64),crypto.randomUUID()]);
        const policyRevision=Number((await pool.query('SELECT policy_revision FROM seller_theme_services WHERE id=$1',[service.id])).rows[0].policy_revision);
        const artifact={themeVersionId:version.id,baseDigest:version.digest,draftRevision,policyRevision,channel:'web',document:v.artifact(version.document,overrides)};
        return (await pool.query(`INSERT INTO theme_publications(id,service_id,organization_id,store_id,draft_id,draft_revision,operation_id,artifact,digest,policy_revision)
            VALUES($1,$2,$3,$4,$5,$10,$6,$7,$8,$9) RETURNING *`,[id,service.id,service.organization_id,service.store_id,draftId,operationId,artifact,v.digest(artifact),policyRevision,draftRevision])).rows[0];
    };
    const sourceBytes=Buffer.from('<!doctype html><title>Explicit publication renderer test double</title>');
    const rendererBundle=async({presentation})=>({presentation,sourceDigest:'b'.repeat(64),entryPoint:'index.html',
        files:[{path:'index.html',bytes:sourceBytes,sha256:v.digest(sourceBytes),mimeType:'text/html'}],
        commerceCapabilities:Object.fromEntries(REQUIRED_COMMERCE.map(code=>[code,true]))});
    let legalRevision=1;
    const legalAuthority=async(_client,{service:s})=>({storeIdentity:{organizationId:Number(s.organization_id),storeId:Number(s.store_id),revision:legalRevision},
        legalReferences:REQUIRED_LEGAL.map(type=>({type,locale:'tr-TR',version:String(legalRevision),contentHash:'c'.repeat(64)}))});
    const responsiveAuthority=async({artifactDigest,sourceDigest})=>({status:'PASS',artifactDigest,sourceDigest,evidenceId:'EXPLICIT_TEST_DOUBLE_NOT_BROWSER',
        widths:[320,360,390,430,768,1024,1440],marketplaceUiAbsent:true,pages:{home:'PASS',category:'PASS',product:'PASS'}});
    const options={database:pool,artifactStorage:artifacts,assetStorage:assets,rendererBundle,legalAuthority,responsiveAuthority,assignmentAuthority:()=>({assignmentEligible:true})};
    const pipeline=createThemePublicationService(options),lifecycle=createThemeAssetLifecycleService({database:pool});
    const active=()=>pool.query('SELECT * FROM theme_active_artifacts WHERE service_id=$1',[service.id]).then(r=>r.rows[0]);
    let first,firstArtifact,second,secondArtifact;
    await gate('P01 real local candidate build records durable stages without ACTIVE',async()=>{
        first=await makePublication();firstArtifact=await pipeline.build(first.id);
        assert.equal(firstArtifact.active,false);assert.equal(firstArtifact.activationPending,true);assert.equal(await active(),undefined);
        assert.deepEqual((await pool.query('SELECT state FROM theme_publication_stage_events WHERE publication_id=$1 ORDER BY id',[first.id])).rows.map(r=>r.state),
            ['VALIDATING','READY','PUBLICATION_REQUESTED','BUILDING','DEPLOYING']);
        assert.equal((await pipeline.build(first.id)).reused,true);
        assert.equal((await artifacts.read(firstArtifact)).bytes.toString(),sourceBytes.toString());
    });
    const candidateScope=artifact=>({publicationId:artifact.publication_id,serviceId:service.id,organizationId:service.organization_id,
        storeId:service.store_id,assignmentId,channel:'web',artifactDigest:artifact.digest});
    const candidateRead=(instance,scope)=>require('../services/themePlatformService').transaction(pool,async client=>{
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return instance.readBuiltCandidateOn(client,scope);
    });
    await gate('P31 exact pre-publication candidate validates without QA or changing any state',async()=>{
        await assert.rejects(candidateRead(pipeline,candidateScope(firstArtifact)),e=>e.code==='THEME_CANDIDATE_ASSIGNMENT_REQUIRED');
        await pool.query("UPDATE theme_assignments SET status='ACCEPTED',accepted_at=clock_timestamp() WHERE id=$1",[assignmentId]);
        const before=(await pool.query('SELECT status,revision FROM theme_publications WHERE id=$1',[first.id])).rows[0];
        const preQa=createThemePublicationService({...options,responsiveAuthority:undefined,assignmentAuthority:undefined});
        const row=await candidateRead(preQa,candidateScope(firstArtifact));assert.equal(row.candidate,true);assert.equal(row.active,false);
        assert.equal(row.digest,firstArtifact.digest);assert.equal(row.acceptance,'CANDIDATE_RUNTIME_NOT_PUBLICATION');
        assert.equal(await active(),undefined);assert.equal((await pool.query('SELECT count(*)::int n FROM theme_publication_activations')).rows[0].n,0);
        assert.deepEqual((await pool.query('SELECT status,revision FROM theme_publications WHERE id=$1',[first.id])).rows[0],before);
    });
    await gate('P32 candidate rejects foreign unknown stale digest assignment channel and environment',async()=>{
        for(const patch of [{serviceId:crypto.randomUUID()},{publicationId:crypto.randomUUID()},{organizationId:fixture.storeB.org},
            {storeId:fixture.storeB.id},{artifactDigest:'0'.repeat(64)},{assignmentId:crypto.randomUUID()},{channel:'app'},{environment:'PRODUCTION'}]){
            await assert.rejects(candidateRead(pipeline,{...candidateScope(firstArtifact),...patch}),e=>[400,404,409].includes(e.statusCode));
        }
        assert.equal(await active(),undefined);
        legalRevision=2;try{await assert.rejects(candidateRead(pipeline,candidateScope(firstArtifact)),e=>e.code==='THEME_PUBLICATION_AUTHORITY_CHANGED');}finally{legalRevision=1;}
    });
    await gate('P02 stored artifact and stage evidence are DB immutable',async()=>{
        await assert.rejects(pool.query("UPDATE theme_publication_artifacts SET digest=$2 WHERE id=$1",[firstArtifact.id,'d'.repeat(64)]),e=>e.code==='55000');
        await assert.rejects(pool.query('DELETE FROM theme_publication_stage_events WHERE publication_id=$1',[first.id]),e=>e.code==='55000');
    });
    await gate('P03 isolated PARTIAL registry refuses activation while current reviewed registry is eligible',async()=>{
        const real=require('../services/themePlatformPresentationService').presentationReadiness(firstArtifact.validation.presentation,'web');
        assert.equal(real.status,'READY');assert.equal(real.assignmentEligible,true);
        const partial=registryFixture('PARTIAL');
        assert.equal(partial.presentations.presentationReadiness(firstArtifact.validation.presentation,'web').assignmentEligible,false);
        const strict=partial.create({...options,assignmentAuthority:undefined});
        await assert.rejects(strict.activate(principal,{publicationId:first.id,expectedGeneration:0}),e=>e.code==='THEME_PRESENTATION_NOT_READY');assert.equal(await active(),undefined);
    });
    await gate('P04 missing or mismatched artifact QA evidence cannot activate',async()=>{
        for(const responsive of [undefined,async()=>({status:'PASS',artifactDigest:'d'.repeat(64)})]) {
            const pipeline=createThemePublicationService({...options,responsiveAuthority:responsive});
            await assert.rejects(pipeline.activate(principal,{publicationId:first.id,expectedGeneration:0}),e=>e.code==='THEME_RESPONSIVE_EVIDENCE_REQUIRED');
        }assert.equal(await active(),undefined);
    });
    await gate('P05 explicit test authority enables one atomic LOCAL pointer only',async()=>{
        const current=await pipeline.activate(principal,{publicationId:first.id,expectedGeneration:0});assert.equal(Number(current.generation),1);assert.equal(current.environment,'LOCAL');
        assert.equal((await pipeline.activate(principal,{publicationId:first.id,expectedGeneration:1})).reused,true);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM theme_publication_activations')).rows[0].n,1);
    });
    await gate('P06 stale CAS leaves pointer and generation unchanged',async()=>{
        await assert.rejects(pipeline.activate(principal,{publicationId:first.id,expectedGeneration:0}),e=>e.code==='THEME_ACTIVE_POINTER_CONFLICT');assert.equal(Number((await active()).generation),1);
    });
    await gate('P07 two concurrent requests cannot both claim same pointer generation',async()=>{
        second=await makePublication();secondArtifact=await pipeline.build(second.id);const third=await makePublication();await pipeline.build(third.id);
        const results=await Promise.allSettled([pipeline.activate(principal,{publicationId:second.id,expectedGeneration:1}),pipeline.activate(principal,{publicationId:third.id,expectedGeneration:1})]);
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'THEME_ACTIVE_POINTER_CONFLICT');
        assert.equal(Number((await active()).generation),2);
    });
    await gate('P08 rollback restores previous verified artifact without commerce mutation',async()=>{
        const before=(await pool.query('SELECT (SELECT count(*) FROM orders)::int AS orders,(SELECT count(*) FROM payments)::int AS payments,(SELECT sum(stock) FROM products) AS stock')).rows[0];
        const restored=await pipeline.rollback(principal,{publicationId:first.id,expectedGeneration:2});assert.equal(restored.artifact_id,firstArtifact.id);assert.equal(Number(restored.generation),3);assert.equal(restored.commerceChanged,false);
        assert.deepEqual((await pool.query('SELECT (SELECT count(*) FROM orders)::int AS orders,(SELECT count(*) FROM payments)::int AS payments,(SELECT sum(stock) FROM products) AS stock')).rows[0],before);
    });
    await gate('P09 foreign Seller cannot activate or read tenant artifact',async()=>{
        await assert.rejects(pipeline.activate(otherSeller,{publicationId:first.id,expectedGeneration:3}),e=>[403,404].includes(e.statusCode));
        await assert.rejects(pipeline.readActive({serviceId:service.id,organizationId:fixture.storeB.org,storeId:fixture.storeB.id,channel:'web'}),e=>e.statusCode===404);
        await assert.rejects(pipeline.readActive({serviceId:service.id,organizationId:service.organization_id,storeId:service.store_id,channel:'web',environment:'PRODUCTION'}),e=>e.code==='THEME_PUBLICATION_ENVIRONMENT_UNSUPPORTED');
    });
    await gate('P10 changed legal authority blocks replay/read without moving pointer',async()=>{
        legalRevision=2;await assert.rejects(pipeline.activate(principal,{publicationId:first.id,expectedGeneration:3}),e=>e.code==='THEME_PUBLICATION_AUTHORITY_CHANGED');
        await assert.rejects(pipeline.readActive({serviceId:service.id,organizationId:service.organization_id,storeId:service.store_id,channel:'web'}),e=>e.code==='THEME_PUBLICATION_AUTHORITY_CHANGED');
        assert.equal(Number((await active()).generation),3);legalRevision=1;
    });
    await gate('P11 revoked publication permission blocks activation without unpublishing customer runtime',async()=>{
        await pool.query("INSERT INTO seller_feature_entitlements(service_id,organization_id,store_id,feature_code,effect,starts_at) VALUES($1,$2,$3,'theme.publish','DENY',NOW())",[service.id,service.organization_id,service.store_id]);
        await assert.rejects(pipeline.activate(principal,{publicationId:first.id,expectedGeneration:3}),e=>e.code==='THEME_FEATURE_DENIED');
        assert.equal((await pipeline.readActive({serviceId:service.id,organizationId:service.organization_id,storeId:service.store_id,channel:'web'})).artifact_id,firstArtifact.id);
        await pool.query("UPDATE seller_feature_entitlements SET effect='ALLOW' WHERE service_id=$1 AND feature_code='theme.publish'",[service.id]);
    });
    await gate('P12 incomplete legal/runtime authorities produce durable BLOCKED failure',async()=>{
        const incomplete=createThemePublicationService({...options,legalAuthority:async()=>({})}),pub=await makePublication();
        await assert.rejects(incomplete.build(pub.id),e=>e.code==='THEME_LEGAL_REQUIRED');
        assert.equal((await pool.query('SELECT status FROM theme_publications WHERE id=$1',[pub.id])).rows[0].status,'BLOCKED');
        const missing=createThemePublicationService({...options,rendererBundle:undefined}),other=await makePublication();
        await assert.rejects(missing.build(other.id),e=>e.code==='THEME_RENDERER_BUILD_AUTHORITY_REQUIRED');
    });
    await gate('P13 marketplace assignment cannot build single-store publication',async()=>{
        const before={service,assignmentId,draftId,draftRevision};
        try {
            service=(await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro') RETURNING *",[crypto.randomUUID(),fixture.storeB.org,fixture.storeB.id])).rows[0];
            assignmentId=null;draftId=null;draftRevision=0;
            const pub=await makePublication({mode:'MARKETPLACE'});await assert.rejects(pipeline.build(pub.id),e=>e.code==='THEME_PUBLICATION_SINGLE_STORE_REQUIRED');
        } finally {({service,assignmentId,draftId,draftRevision}=before);}
    });
    await gate('P14 stale worker lease cannot be claimed twice',async()=>{
        const pub=await makePublication();await pool.query("UPDATE theme_publications SET worker_token=$2,worker_expires_at=NOW()+INTERVAL '1 minute' WHERE id=$1",[pub.id,crypto.randomUUID()]);
        await assert.rejects(pipeline.build(pub.id),e=>e.code==='THEME_PUBLICATION_WORKER_BUSY');
    });
    const addAsset=async()=>{
        const id=crypto.randomUUID(),bytes=await sharp({create:{width:8,height:6,channels:4,background:'#f97316'}}).png().toBuffer();
        const handle=await assets.stageOwned({serviceId:service.id,assetId:id,bytes}),ready=await assets.promote(handle);
        const asset=(await pool.query(`INSERT INTO theme_assets(id,service_id,organization_id,store_id,detected_mime,byte_size,digest,storage_key,status,width,height,original_digest,storage_backend)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,'READY',$9,$10,$11,'local-v1') RETURNING *`,[id,service.id,service.organization_id,service.store_id,ready.detectedMime,ready.byteSize,ready.digest,ready.storageKey,ready.width,ready.height,ready.originalDigest])).rows[0];
        return asset;
    };
    await gate('P15 unreferenced asset tombstones durably while original bytes retained',async()=>{
        const asset=await addAsset(),deleted=await lifecycle.remove(principal,{assetId:asset.id,expectedRevision:1,reason:'Owned test remove'});
        assert.equal(deleted.bytesDeleted,false);assert.equal(deleted.state,'TOMBSTONED');assert.equal((await pool.query('SELECT status FROM theme_assets WHERE id=$1',[asset.id])).rows[0].status,'REJECTED');
        assert((await assets.readOwned({serviceId:service.id,storageKey:asset.storage_key,digest:asset.digest})).length>0);
        assert.equal((await lifecycle.remove(principal,{assetId:asset.id,expectedRevision:1,reason:'Replay'})).reused,true);
        assert.equal((await lifecycle.planPurge(principal,{serviceId:service.id})).bytesDeleted,0);
    });
    await gate('P16 current and historical references prevent asset deletion',async()=>{
        const asset=await addAsset();
        await pool.query('UPDATE theme_drafts SET overrides=$2 WHERE id=$1',[first.draft_id,{studio:{fixtureHistoricalAssetId:asset.id}}]);
        await assert.rejects(lifecycle.remove(principal,{assetId:asset.id,expectedRevision:1,reason:'Must retain'}),e=>e.code==='THEME_ASSET_REFERENCED');
        await pool.query('UPDATE theme_drafts SET overrides=$2 WHERE id=$1',[first.draft_id,{studio:{}}]);
        await pool.query('INSERT INTO theme_draft_revisions(id,service_id,organization_id,store_id,draft_id,revision,overrides,digest) VALUES($1,$2,$3,$4,$5,9999,$6,$7)',
            [crypto.randomUUID(),service.id,service.organization_id,service.store_id,first.draft_id,{studio:{fixtureHistoricalAssetId:asset.id}},'e'.repeat(64)]);
        await assert.rejects(lifecycle.remove(principal,{assetId:asset.id,expectedRevision:1,reason:'Must retain history'}),e=>e.code==='THEME_ASSET_REFERENCED');
        await assert.rejects(lifecycle.remove(otherSeller,{assetId:asset.id,expectedRevision:1,reason:'Foreign'}),e=>[403,404].includes(e.statusCode));
    });
    let actualLegalPublication,actualLegalArtifact,privacy;
    const contentService=require('../services/themePlatformStoreContentService').createStoreContentService(pool);
    const contentCommand=(action,body,documentId)=>contentService.execute(principal,action,{serviceId:service.id,...(documentId?{documentId}:{})},
        {...body,reason:'Synthetic test content; not legal advice or production text'}, {idempotencyKey:crypto.randomUUID()}).then(row=>row.result);
    await gate('P18 canonical CMS authority rejects missing then accepts approved effective versions',async()=>{
        const canonical=createThemePublicationService({...options,legalAuthority:undefined});
        const before=await makePublication();await assert.rejects(canonical.build(before.id),e=>e.code==='THEME_LEGAL_REQUIRED');
        await contentCommand('saveContact',{expectedRevision:0,profile:{displayName:'Disposable Test Store',legalBusinessName:'Synthetic Test Business',address:'Test fixture address',city:'Fixture City',country:'TR',email:'test@example.test'}});
        for(const type of REQUIRED_LEGAL) {
            const row=await contentCommand('createLegal',{locale:'tr-TR',type,content:`SYNTHETIC TEST ONLY: ${type}`});
            const approved=await contentCommand('approveLegal',{expectedRevision:1,effectiveAt:'2026-01-01T00:00:00Z',expiresAt:null},row.id);
            if(type==='privacy')privacy=approved;
        }
        actualLegalPublication=await makePublication();actualLegalArtifact=await canonical.build(actualLegalPublication.id);
        assert.equal(actualLegalArtifact.validation.legalReferences.length,9);
        assert(actualLegalArtifact.validation.legalReferences.every(ref=>ref.documentId&&ref.contentHash&&ref.approvedAt));
    });
    await gate('P19 store contact logo is retained and included as verified artifact bytes',async()=>{
        const logo=await addAsset();await contentCommand('saveContact',{expectedRevision:1,profile:{displayName:'Disposable Test Store',legalBusinessName:'Synthetic Test Business',address:'Test fixture address',city:'Fixture City',country:'TR',email:'test@example.test',logoAssetId:logo.id}});
        await assert.rejects(lifecycle.remove(principal,{assetId:logo.id,expectedRevision:1,reason:'Must retain public logo'}),e=>e.code==='THEME_ASSET_REFERENCED');
        const canonical=createThemePublicationService({...options,legalAuthority:undefined}),publication=await makePublication(),artifact=await canonical.build(publication.id);
        assert(artifact.validation.assets.some(asset=>asset.id===logo.id));assert(artifact.manifest.files.some(file=>file.path===`assets/owned/${logo.id}.png`));
        await gate('P33 candidate reader verifies canonical legal and exact live owned asset bytes',async()=>{
            assert.equal((await candidateRead(canonical,candidateScope(artifact))).digest,artifact.digest);
            const file=path.join(rootDir,'media',logo.storage_key),bytes=await fs.readFile(file);
            try{await fs.appendFile(file,'corrupt');await assert.rejects(candidateRead(canonical,candidateScope(artifact)),e=>e.code==='THEME_ASSET_INTEGRITY_FAILURE');}
            finally{await fs.writeFile(file,bytes);}
            await assert.rejects(candidateRead(canonical,candidateScope(actualLegalArtifact)),e=>e.code==='THEME_PUBLICATION_AUTHORITY_CHANGED');
        });
    });
    await gate('P20 canonical legal revoke blocks existing artifact activation',async()=>{
        await contentCommand('revokeLegal',{expectedRevision:Number(privacy.revision)},privacy.id);
        const canonical=createThemePublicationService({...options,legalAuthority:undefined});
        await assert.rejects(canonical.activate(principal,{publicationId:actualLegalPublication.id,expectedGeneration:3}),e=>e.code==='THEME_LEGAL_REQUIRED');
        assert.equal(Number((await active()).generation),3);
        await gate('P34 candidate reader refuses canonical revoked legal document',async()=>{
            await assert.rejects(candidateRead(canonical,candidateScope(actualLegalArtifact)),e=>e.code==='THEME_LEGAL_REQUIRED');
        });
    });
    await gate('P21 valid own Seller request authority cannot directly activate or rollback',async()=>{
        await pool.query("INSERT INTO theme_seller_roles(organization_id,membership_id,role,publish_allowed) VALUES($1,$2,'seller_admin',TRUE)",[fixture.a.store.org,fixture.a.membershipId]);
        const ownSeller={kind:'seller',userId:fixture.a.userId,sessionId:fixture.a.sessionId};
        await require('../services/themePlatformService').transaction(pool,client=>require('../services/themePlatformAuthService').authorize(client,ownSeller,'publication.request',service));
        await assert.rejects(pipeline.activate(ownSeller,{publicationId:first.id,expectedGeneration:3}),e=>e.code==='THEME_DIRECT_PUBLICATION_FORBIDDEN');
        await assert.rejects(pipeline.rollback(ownSeller,{publicationId:first.id,expectedGeneration:3}),e=>e.code==='THEME_DIRECT_PUBLICATION_FORBIDDEN');
        await assert.rejects(pipeline.activate({kind:'admin',userId:principal.userId,sessionId:2147483647},{publicationId:first.id,expectedGeneration:3}),e=>e.code==='THEME_AUTH_REQUIRED');
        assert.equal(Number((await active()).generation),3);
    });
    await gate('P22 operation ledger and audit reflect actual LOCAL activation only',async()=>{
        const operation=(await pool.query('SELECT status,result FROM theme_operations WHERE id=$1',[first.operation_id])).rows[0];
        assert.equal(operation.status,'COMPLETED');assert.equal(operation.result.state,'ACTIVE');assert.equal(operation.result.environment,'LOCAL');
        const audit=(await pool.query("SELECT action FROM theme_audit_events WHERE service_id=$1 AND action IN ('theme.local.activated','theme.local.rollback')",[service.id])).rows;
        assert.equal(audit.filter(row=>row.action==='theme.local.activated').length,2);assert.equal(audit.filter(row=>row.action==='theme.local.rollback').length,1);
    });
    await gate('P23 active artifact validates inside caller READ ONLY transaction without nested connection or locks',async()=>{
        const client=await pool.connect();
        const scope={serviceId:service.id,organizationId:service.organization_id,storeId:service.store_id,channel:'web'};
        const withoutPool=createThemePublicationService({...options,database:{connect(){throw new Error('Nested connection forbidden');}}});
        try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const row=await withoutPool.readActiveOn(client,scope);
            assert.equal(row.artifact_id,firstArtifact.id);assert.equal(Number(row.generation),3);
            const count=await client.query("SELECT count(*)::int AS n FROM pg_locks WHERE pid=pg_backend_pid() AND mode IN ('RowShareLock','RowExclusiveLock')");
            assert.equal(count.rows[0].n,0);
            await client.query('COMMIT');
        } finally {await client.query('ROLLBACK');client.release();}
        assert.equal((await pipeline.readActive(scope)).artifact_id,firstArtifact.id);
    });
    const publicScope={serviceId:service.id,organizationId:service.organization_id,storeId:service.store_id,channel:'web'};
    await gate('P24 real edit-grant revision leaves published A serving but blocks stale build and new activation',async()=>{
        const oldPublication=await makePublication(),oldPolicy=Number(oldPublication.policy_revision);
        const experience=require('../services/themePlatformExperienceService').createThemeExperienceService(pool,{storage:assets});
        const result=await experience.execute(principal,'configureExperience',{serviceId:service.id},
            {expectedRevision:oldPolicy,profileCode:'BASIC',overrides:{'theme.colors':{effect:'DENY'},'theme.save_draft':{effect:'DENY'}},reason:'Disposable edit-only grant revocation'},
            {idempotencyKey:crypto.randomUUID()});
        assert.equal(result.result.policyRevision,oldPolicy+1);
        const deployed=await pipeline.readActive(publicScope);
        assert.equal(deployed.artifact_id,firstArtifact.id);assert.equal(deployed.validation.policyRevision,oldPolicy);
        await assert.rejects(pipeline.activate(principal,{publicationId:first.id,expectedGeneration:3}),e=>e.code==='THEME_PUBLICATION_POLICY_STALE');
        await assert.rejects(pipeline.build(oldPublication.id),e=>e.code==='THEME_PUBLICATION_POLICY_STALE');
        const draft=(await pool.query('SELECT * FROM theme_drafts WHERE id=$1',[draftId])).rows[0];
        const ownSeller={kind:'seller',userId:fixture.a.userId,sessionId:fixture.a.sessionId};
        const editor=require('../services/themePlatformService').createThemePlatformService(pool);
        await assert.rejects(editor.execute(ownSeller,'saveDraft',{draftId},
            {expectedRevision:Number(draft.revision),policyRevision:oldPolicy+1,overrides:draft.overrides,reason:'Denied save must remain denied'},
            {idempotencyKey:crypto.randomUUID()}),e=>e.code==='THEME_CAPABILITY_DENIED');
        assert.equal((await pool.query('SELECT revision FROM theme_drafts WHERE id=$1',[draftId])).rows[0].revision,draft.revision);
    });
    const sourceB=Buffer.from('<!doctype html><title>Explicit newer renderer B test double</title>');
    let rendererBCalls=0,publicationB,artifactB;
    const pipelineB=createThemePublicationService({...options,rendererBundle:async({presentation})=>{
        rendererBCalls+=1;return {presentation,sourceDigest:'d'.repeat(64),entryPoint:'index.html',
            files:[{path:'index.html',bytes:sourceB,sha256:v.digest(sourceB),mimeType:'text/html'}],
            commerceCapabilities:Object.fromEntries(REQUIRED_COMMERCE.map(code=>[code,true]))};
    }});
    await gate('P25 current renderer B cannot alter serving A and new B activation still validates current bytes',async()=>{
        assert.equal((await pipelineB.readActive(publicScope)).artifact_id,firstArtifact.id);assert.equal(rendererBCalls,0);
        assert.equal((await artifacts.read(firstArtifact)).bytes.toString(),sourceBytes.toString());
        const currentA=await makePublication();await pipeline.build(currentA.id);
        await assert.rejects(pipelineB.activate(principal,{publicationId:currentA.id,expectedGeneration:3}),e=>e.code==='THEME_PUBLICATION_AUTHORITY_CHANGED');
        publicationB=await makePublication();artifactB=await pipelineB.build(publicationB.id);
        const activated=await pipelineB.activate(principal,{publicationId:publicationB.id,expectedGeneration:3});
        assert.equal(Number(activated.generation),4);assert.equal(activated.artifact_id,artifactB.id);
        assert.equal((await artifacts.read(artifactB)).bytes.toString(),sourceB.toString());
    });
    await gate('P26 rollback to verified previous A uses its immutable renderer despite B dist and changed edit policy',async()=>{
        const before=rendererBCalls;
        const restored=await pipelineB.rollback(principal,{publicationId:first.id,expectedGeneration:4});
        assert.equal(restored.artifact_id,firstArtifact.id);assert.equal(Number(restored.generation),5);
        assert.equal((await pipelineB.readActive(publicScope)).artifact_id,firstArtifact.id);assert.equal(rendererBCalls,before);
        const absent=createThemePublicationService({...options,rendererBundle:undefined});
        assert.equal((await absent.readActive(publicScope)).artifact_id,firstArtifact.id);
        assert.equal((await absent.rollback(principal,{publicationId:first.id,expectedGeneration:5})).reused,true);
        assert.equal((await artifacts.read(firstArtifact)).bytes.toString(),sourceBytes.toString());
        const next=await makePublication();await assert.rejects(absent.build(next.id),e=>e.code==='THEME_RENDERER_BUILD_AUTHORITY_REQUIRED');
    });
    await gate('P27 live editor feature denial preserves published bytes but prevents new builds and edits',async()=>{
        await pool.query("INSERT INTO seller_feature_entitlements(service_id,organization_id,store_id,feature_code,effect,starts_at) VALUES($1,$2,$3,'theme.editor','DENY',NOW())",[service.id,service.organization_id,service.store_id]);
        try {
            assert.equal((await pipelineB.readActive(publicScope)).artifact_id,firstArtifact.id);
            const next=await makePublication();await assert.rejects(pipelineB.build(next.id),e=>e.code==='THEME_FEATURE_DENIED');
            const editor=require('../services/themePlatformService').createThemePlatformService(pool);
            const draft=(await pool.query('SELECT * FROM theme_drafts WHERE id=$1',[draftId])).rows[0];
            await assert.rejects(editor.execute({kind:'seller',userId:fixture.a.userId,sessionId:fixture.a.sessionId},'saveDraft',{draftId},
                {expectedRevision:Number(draft.revision),policyRevision:2,overrides:draft.overrides,reason:'Editor entitlement is revoked'},
                {idempotencyKey:crypto.randomUUID()}),e=>e.code==='THEME_FEATURE_DENIED');
        } finally {await pool.query("UPDATE seller_feature_entitlements SET effect='ALLOW' WHERE service_id=$1 AND feature_code='theme.editor'",[service.id]);}
    });
    await gate('P28 live service store organization and assignment revocations still block serving and rollback',async()=>{
        for(const status of ['SUSPENDED','REVOKED']) {
            await pool.query('UPDATE seller_theme_services SET status=$2 WHERE id=$1',[service.id,status]);
            try {
                await assert.rejects(pipelineB.readActive(publicScope),e=>e.code==='THEME_SERVICE_INACTIVE');
                await assert.rejects(pipelineB.rollback(principal,{publicationId:publicationB.id,expectedGeneration:5}),e=>e.code==='THEME_SERVICE_INACTIVE');
            } finally {await pool.query("UPDATE seller_theme_services SET status='ACTIVE' WHERE id=$1",[service.id]);}
        }
        for(const [table,id] of [['seller_stores',service.store_id],['seller_organizations',service.organization_id]]) {
            await pool.query(`UPDATE ${table} SET closed_at=clock_timestamp() WHERE id=$1`,[id]);
            try {await assert.rejects(pipelineB.readActive(publicScope),e=>e.statusCode===404);}
            finally {await pool.query(`UPDATE ${table} SET closed_at=NULL WHERE id=$1`,[id]);}
        }
        // WITHDRAWN is terminal. Roll back the disposable test transaction rather
        // than attempting an unsupported restoration or disabling its trigger.
        const withdrawn=await pool.connect();
        try {
            await withdrawn.query('BEGIN');
            await withdrawn.query("UPDATE theme_assignments SET status='WITHDRAWN',withdrawn_at=clock_timestamp() WHERE id=$1",[assignmentId]);
            await assert.rejects(pipelineB.readActiveOn(withdrawn,publicScope),e=>e.code==='THEME_ASSIGNMENT_WITHDRAWN');
        } finally {await withdrawn.query('ROLLBACK');withdrawn.release();}
        assert.equal((await pipelineB.readActive(publicScope)).artifact_id,firstArtifact.id);assert.equal(Number((await active()).generation),5);
    });
    await gate('P29 serving and rollback retain exact registry and artifact QA revocation checks',async()=>{
        const blocked=registryFixture('BLOCKED').create({...options,rendererBundle:undefined});
        await assert.rejects(blocked.readActive(publicScope),e=>e.code==='THEME_PRESENTATION_REVOKED');
        await assert.rejects(blocked.rollback(principal,{publicationId:publicationB.id,expectedGeneration:5}),e=>e.code==='THEME_PRESENTATION_REVOKED');
        const qaRevoked=createThemePublicationService({...options,rendererBundle:undefined,responsiveAuthority:async()=>({status:'REVOKED'})});
        for(const [instance,code] of [[qaRevoked,'THEME_RESPONSIVE_EVIDENCE_REQUIRED']]) {
            await assert.rejects(instance.readActive(publicScope),e=>e.code===code);
            await assert.rejects(instance.rollback(principal,{publicationId:publicationB.id,expectedGeneration:5}),e=>e.code===code);
        }
        assert.equal((await pipelineB.readActive(publicScope)).artifact_id,firstArtifact.id);assert.equal(Number((await active()).generation),5);
    });
    await gate('P30 contact and legal version changes still require republish after edit policy changes',async()=>{
        legalRevision=2;
        try {
            await assert.rejects(pipelineB.readActive(publicScope),e=>e.code==='THEME_PUBLICATION_AUTHORITY_CHANGED');
            await assert.rejects(pipelineB.rollback(principal,{publicationId:publicationB.id,expectedGeneration:5}),e=>e.code==='THEME_PUBLICATION_AUTHORITY_CHANGED');
        } finally {legalRevision=1;}
        assert.equal((await pipelineB.readActive(publicScope)).artifact_id,firstArtifact.id);
    });
    await gate('P35 isolated future PARTIAL registry preserves sealed acceptance but denies new activation',async()=>{
        const partial=registryFixture('PARTIAL');
        assert.equal(partial.presentations.presentationReadiness(firstArtifact.validation.presentation,'web').assignmentEligible,false);
        const strict=partial.create({...options,assignmentAuthority:undefined});
        assert.equal((await strict.readActive(publicScope)).artifact_id,firstArtifact.id);
        const candidate=await makePublication(),artifact=await strict.build(candidate.id);
        await assert.rejects(strict.activate(principal,{publicationId:candidate.id,expectedGeneration:5}),e=>e.code==='THEME_PRESENTATION_NOT_READY');
        const activation=(await pool.query("SELECT evidence FROM theme_publication_activations WHERE artifact_id=$1 AND operation='ACTIVATE'",[firstArtifact.id])).rows[0];
        assert.equal(activation.evidence.compatibility.assignmentEligible,true);
        assert.equal(activation.evidence.compatibility.identity.artifactDigest,firstArtifact.digest);
        const client=await pool.connect();
        try{
            await client.query('BEGIN');await client.query('UPDATE theme_active_artifacts SET previous_artifact_id=artifact_id,artifact_id=$2,generation=generation+1 WHERE service_id=$1',[service.id,artifact.id]);
            await assert.rejects(strict.readActiveOn(client,publicScope),e=>e.code==='THEME_VERIFIED_ACTIVATION_REQUIRED');
        }finally{await client.query('ROLLBACK');client.release();}
        assert.equal((await strict.rollback(principal,{publicationId:publicationB.id,expectedGeneration:5})).artifact_id,artifactB.id);
        assert.equal((await strict.rollback(principal,{publicationId:first.id,expectedGeneration:6})).artifact_id,firstArtifact.id);
        assert.equal((await strict.readActive(publicScope)).artifact_id,firstArtifact.id);
    });
    await gate('P17 corrupted deployed bytes cannot be activated or served',async()=>{
        await fs.appendFile(path.join(rootDir,'builds',firstArtifact.storage_key,'index.html'),'corrupted');
        await assert.rejects(pipeline.activate(principal,{publicationId:first.id,expectedGeneration:Number((await active()).generation)}),e=>e.code==='THEME_ARTIFACT_INTEGRITY_FAILURE');
        await assert.rejects(pipeline.readActive({serviceId:service.id,organizationId:service.organization_id,storeId:service.store_id,channel:'web'}),e=>e.code==='THEME_ARTIFACT_INTEGRITY_FAILURE');
    });
    db.originalConsole.log(JSON.stringify({result:'PASS',checks:gates.length,gates,postgresVersion:db.postgresVersion,migrations:db.migrations.length,
        testDoubles:['renderer bundle','legal authority','assignment compatibility','responsive evidence','frozen isolated PARTIAL/BLOCKED registry clones; no global/cache/file override'],
        realAssertions:['DB transactions','CAS concurrency','immutable records','raster bytes','artifact filesystem','live admin/seller authorization'],
        browserAcceptance:false,productionWrites:0}));
})().catch(error=>{(db?.originalConsole||console).error(db?db.redact(error.stack||error.message):error.stack);process.exitCode=1;})
.finally(async()=>{
    if(db)await db.cleanup();
    if(rootDir){assert.equal(path.dirname(rootDir),path.resolve(os.tmpdir()));assert(path.basename(rootDir).startsWith('novastore-publication-db-'));await fs.rm(rootDir,{recursive:true,force:true});}
});
