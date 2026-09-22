'use strict';
// Real PostgreSQL, real raster storage and current principal/policy evaluation.
// Synthetic identities only; no renderer/readiness or provider substitutes.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const startDisposable=require('./helpers/themePlatformDisposableDb');
const {seedWave2}=require('./helpers/themePlatformWave2Fixtures');
const {createThemeAssetStorage}=require('../services/themePlatformAssetStorage');
const {createThemeAssetLifecycleService}=require('../services/themePlatformAssetLifecycleService');
const {createThemeExperienceService}=require('../services/themePlatformExperienceService');
const {createThemePlatformService}=require('../services/themePlatformService');
const gates=[];let db,rootDir;
const gate=async(name,run)=>{await run();gates.push({name,status:'PASS'});db.originalConsole.log(`PASS ${name}`);};
(async()=>{
 db=await startDisposable();const{pool}=db,fixture=await seedWave2(pool,db.sensitive);
 rootDir=await fs.mkdtemp(path.join(os.tmpdir(),'novastore-asset-lifecycle-db-'));
 const storage=createThemeAssetStorage({rootDir}),experience=createThemeExperienceService(pool,{storage}),platform=createThemePlatformService(pool),lifecycle=createThemeAssetLifecycleService({database:pool});
 const admin={kind:'admin',userId:fixture.admin.userId,sessionId:fixture.admin.sessionId};
 const seller=who=>({kind:'seller',userId:who.userId,sessionId:who.sessionId}),a=seller(fixture.a),b=seller(fixture.b);
 const makeService=async store=>(await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro') RETURNING *",[crypto.randomUUID(),store.org,store.id])).rows[0];
 const service=await makeService(fixture.storeA),serviceB=await makeService(fixture.storeB);
 const revision=async svc=>Number((await pool.query('SELECT policy_revision FROM seller_theme_services WHERE id=$1',[svc.id])).rows[0].policy_revision);
 const configure=async(svc,overrides={})=>experience.execute(admin,'configureExperience',{serviceId:svc.id},{expectedRevision:await revision(svc),profileCode:'PRO',overrides,reason:'Owned asset lifecycle regression'},{idempotencyKey:crypto.randomUUID()});
 const quota=async(svc,amount,effect='ALLOW')=>platform.execute(admin,'entitlement',{serviceId:svc.id,featureCode:'theme.asset_bytes'},
  {expectedRevision:await revision(svc),effect,quota:amount,startsAt:new Date(Date.now()-1000).toISOString(),expiresAt:null,reason:'Owned exact retained byte quota'}, {idempotencyKey:crypto.randomUUID()});
 await configure(service);await configure(serviceB);
 const bytes=await require('sharp')({create:{width:32,height:32,channels:4,background:'#fb923c'}}).png().toBuffer(),body={bytesBase64:bytes.toString('base64'),reason:'Owned real PNG'};
 const store=(actor=a,svc=service,key=crypto.randomUUID())=>experience.execute(actor,'storeAsset',{serviceId:svc.id},body,{idempotencyKey:key}).then(row=>row.result);
 const remove=(asset,actor=a)=>lifecycle.remove(actor,{assetId:asset.id,expectedRevision:Number(asset.revision),reason:'Owned lifecycle regression'});
 const row=asset=>pool.query('SELECT * FROM theme_assets WHERE id=$1',[asset.id]).then(result=>result.rows[0]);
 const usage=svc=>pool.query("SELECT count(*)::int n,COALESCE(sum(byte_size) FILTER(WHERE storage_backend='local-v1'),0)::int bytes FROM theme_assets WHERE service_id=$1",[svc.id]).then(result=>result.rows[0]);
 const files=async directory=>{const result=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const name=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await files(name));else result.push(name);}return result;};
 let asset,uploadKey=crypto.randomUUID();
 await gate('A01 current writable owner stores real normalized READY bytes',async()=>{asset=await store(a,service,uploadKey);assert.equal(asset.status,'READY');assert((await storage.readOwned({serviceId:service.id,storageKey:asset.storage_key,digest:asset.digest})).length>0);});
 await gate('A02 READ_ONLY asset capability denies tombstone without changing row',async()=>{await configure(service,{'theme.assets':{effect:'ALLOW',state:'READ_ONLY'}});const before=await row(asset);await assert.rejects(remove(asset),{code:'THEME_CAPABILITY_DENIED'});assert.deepEqual(await row(asset),before);});
 await gate('A03 explicit DENY and revoked billing both deny asset deletion',async()=>{
  await configure(service,{'theme.assets':{effect:'DENY'}});await assert.rejects(remove(asset),{code:'THEME_CAPABILITY_DENIED'});
  await configure(service);await quota(service,1000000,'DENY');await assert.rejects(remove(asset),e=>e.statusCode===403);await quota(service,1000000);
  assert.equal((await row(asset)).status,'READY');
 });
 await gate('A04 foreign owner and same-store viewer cannot delete',async()=>{await assert.rejects(remove(asset,b),e=>[403,404].includes(e.statusCode));await assert.rejects(remove(asset,seller(fixture.viewer)),{code:'THEME_PERMISSION_DENIED'});});
 await gate('A05 active reference remains protected even with writable capability',async()=>{
  await pool.query("INSERT INTO theme_store_profiles(organization_id,store_id,profile) VALUES($1,$2,$3)",[service.organization_id,service.store_id,{logoAssetId:asset.id}]);
  await assert.rejects(remove(asset),{code:'THEME_ASSET_REFERENCED'});assert.equal((await row(asset)).status,'READY');
  await pool.query('DELETE FROM theme_store_profiles WHERE organization_id=$1 AND store_id=$2',[service.organization_id,service.store_id]);
 });
 await gate('A06 writable unreferenced tombstone retains immutable bytes',async()=>{const removed=await remove(asset);assert.equal(removed.state,'TOMBSTONED');assert.equal(removed.bytesDeleted,false);assert.equal((await row(asset)).status,'REJECTED');assert.equal((await storage.readOwned({serviceId:service.id,storageKey:asset.storage_key,digest:asset.digest})).length,Number(asset.byte_size));});
 await gate('A07 revocation and READ_ONLY are checked before deletion replay',async()=>{
  for(const override of [{effect:'DENY'},{effect:'ALLOW',state:'READ_ONLY'}]){await configure(service,{'theme.assets':override});await assert.rejects(remove(asset),{code:'THEME_CAPABILITY_DENIED'});}
  await configure(service);assert.equal((await remove(asset)).reused,true);
 });
 await gate('A08 retained bytes consume quota and repeated uploads cannot evade it',async()=>{
  await quota(service,Number(asset.byte_size)*2-1);const before=await usage(service);
  for(let attempt=0;attempt<2;attempt++)await assert.rejects(store(),{code:'THEME_ASSET_QUOTA_EXCEEDED'});
  assert.deepEqual(await usage(service),before);assert.equal((await files(path.join(rootDir,'ready','owned',service.id))).length,1);
 });
 await gate('A09 original upload replay allocates no additional bytes and does not resurrect tombstone',async()=>{
  const before=await usage(service);assert.equal((await store(a,service,uploadKey)).id,asset.id);assert.deepEqual(await usage(service),before);assert.equal((await row(asset)).status,'REJECTED');
 });
 await gate('A10 legacy metadata registration cannot ignore retained local bytes',async()=>{
  await assert.rejects(platform.execute(a,'registerAsset',{serviceId:service.id},body,{idempotencyKey:crypto.randomUUID()}),{code:'THEME_ASSET_QUOTA_EXCEEDED'});
  assert.equal((await usage(service)).n,1);
 });
 await gate('A11 concurrent real uploads serialize quota at the service lock',async()=>{
  await quota(serviceB,Number(asset.byte_size));const results=await Promise.allSettled([store(b,serviceB),store(b,serviceB)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.find(result=>result.status==='rejected').reason.code,'THEME_ASSET_QUOTA_EXCEEDED');assert.equal((await usage(serviceB)).n,1);
 });
 db.originalConsole.log(JSON.stringify({result:'PASS',checks:gates.length,gates,postgresVersion:db.postgresVersion,migrations:db.migrations.length,testDoubles:[],productionWrites:0,browserAcceptance:false}));
})().catch(error=>{(db?.originalConsole||console).error(db?db.redact(error.stack||error.message):error.stack);process.exitCode=1;})
.finally(async()=>{if(db)await db.cleanup();if(rootDir){assert.equal(path.dirname(rootDir),path.resolve(os.tmpdir()));assert(path.basename(rootDir).startsWith('novastore-asset-lifecycle-db-'));await fs.rm(rootDir,{recursive:true,force:true});}});
