'use strict';

// Runs the actual project server against ONE newly-owned local PostgreSQL DB.
// This is browser acceptance data, not delivery, a tenant migration or a live site.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {once}=require('node:events');
const startDisposable=require('../tests/helpers/themePlatformDisposableDb');
let db,assetRoot,runtime,stopping,stopTimer;
async function stopAcceptance(){
    if(stopping)return stopping;
    stopping=(async()=>{
        clearInterval(stopTimer);
        if(runtime){
            // Match normal server shutdown before ending its owned pool. The
            // revocation singleton holds a checked-out LISTEN client until stop.
            require('../services/stockyOrderDeliveryWorkerService').stopStockyOrderDeliveryWorker();
            require('../services/notificationWorkerService').stopNotificationWorker();
            await require('../services/socketRevocationService').socketRevocationService.stop();
        }
        if(runtime?.io)await new Promise(resolve=>{
            // Socket.IO can leave its close callback waiting on browser upgrade
            // sockets even after the owned HTTP listener has stopped accepting.
            const timer=setTimeout(resolve,5000);
            runtime.io.disconnectSockets(true);
            runtime.io.close(()=>{clearTimeout(timer);resolve();});
            // The disposable browser may keep a document request/socket open.
            // Close only this listener's connections so teardown cannot hang.
            runtime.io.httpServer.closeAllConnections?.();
        });
        if(db){const result=await db.cleanup();db.originalConsole.log(JSON.stringify(result));}
    })();
    return stopping;
}
async function main(){
    const acceptancePort=process.env.NOVASTORE_THEME_ACCEPTANCE_PORT||'0';
    if(!/^(0|[1-9][0-9]{0,4})$/u.test(acceptancePort)||Number(acceptancePort)>65535)throw Error('Invalid loopback acceptance port');
    db=await startDisposable();
    const {pool,sensitive}=db;
    const fixtures=await require('../tests/helpers/themePlatformWave2Fixtures').seedWave2(pool,sensitive);
    assetRoot=await fs.mkdtemp(path.join(os.tmpdir(),'novastore-theme-wave2-acceptance-'));
    const foundation=require('../services/themePlatformService').createThemePlatformService(pool);
    const experience=require('../services/themePlatformExperienceService').createThemeExperienceService(pool,{storageRoot:assetRoot});
    const principal={kind:'admin',userId:fixtures.admin.userId,sessionId:Number(fixtures.admin.sessionId||fixtures.admin.session?.id)};
    // The fixture helper returns the real issued session. Resolve its persisted
    // numeric identity by the known actor when the issuer DTO uses another name.
    if(!Number.isSafeInteger(principal.sessionId)) principal.sessionId=Number((await pool.query('SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL ORDER BY id DESC LIMIT 1',[principal.userId])).rows[0].id);
    const meta=()=>({idempotencyKey:crypto.randomUUID()});
    const reason='Owned local Wave 2 browser acceptance fixture';
    // Real local catalog rows reference local product media through the normal
    // canonical URL contract; the theme renderer never fills missing data.
    const fixtureImages=new Map();
    const mediaRoot=path.resolve(__dirname,'../frontend/uploads/local-products');
    const workspace=path.resolve(__dirname,'..');
    if(!mediaRoot.startsWith(workspace+path.sep))throw Error('Fixture media escaped owned workspace');
    await fs.mkdir(mediaRoot,{recursive:true});
    for(const [name,source] of [
        ['Ahşap sandalye','theme-library/assets/classic/hero-chair-front.png'],
        ['Masa lambası','media/sectors/workspace/masa-lambasi.png'],
        ['Seramik vazo','media/sectors/gallery/seramik-vazo.png']
    ]){
        const file=`wave2-qa-${crypto.randomUUID()}.png`;
        await fs.copyFile(path.join(workspace,'studio-core/workshop-public',source),path.join(mediaRoot,file),require('node:fs').constants.COPYFILE_EXCL);
        fixtureImages.set(name,`/uploads/local-products/${file}`);
    }
    const services=[];
    for(const store of [fixtures.storeA,fixtures.storeB]){
        const service=(await foundation.execute(principal,'createService',{}, {storeId:store.id,plan:'pro',status:'ACTIVE',startsAt:'2026-01-01T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z',reason},meta())).result;
        services.push(service);
        await pool.query('INSERT INTO seller_store_profiles(organization_id,store_id,description,shipping_policy,return_policy) VALUES($1,$2,$3,$4,$5)',[store.org,store.id,'Yerel kabul için ayrılmış mağaza.','Kargo bilgisi mağaza tarafından sağlanır.','İade koşulları mağaza sözleşmesine bağlıdır.']);
        const category=(await pool.query('INSERT INTO categories(name,slug,path) VALUES($1,$2::text,$2::text) RETURNING id',[`Yaşam alanı ${store.id}`,`wave2-living-${store.id}`])).rows[0].id;
        for(const [name,price,stock] of [['Ahşap sandalye',2890,12],['Masa lambası',1490,8],['Seramik vazo',690,20]]){
            const product=(await pool.query("INSERT INTO products(name,description,price,old_price,stock,store_id,image_url,publication_status,is_customer_visible) VALUES($1,$2,$3,$4,$5,$6,$7,'active',TRUE) RETURNING id",[`${name} ${store.id}`,'Gerçek yerel katalog kaydı; ödeme veya stok rezervasyonu yapılmaz.',price,price+200,stock,store.legacyId,fixtureImages.get(name)])).rows[0].id;
            await pool.query('INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,TRUE)',[product,category]);
            await pool.query("INSERT INTO reviews(product_id,user_id,rating,comment,status) VALUES($1,$2,5,'Yerel kabul kaydı: ürün açıklaması ve teslimat bilgisi açık.','PUBLISHED')",[product,fixtures.a.userId]);
            await pool.query("INSERT INTO product_questions(product_id,user_id,question,answer,answered_at) VALUES($1,$2,'Montaj bilgisi ürünle birlikte geliyor mu?','Evet, bu yerel kabul kaydında kurulum bilgisi ürünle sunulur.',NOW())",[product,fixtures.a.userId]);
            if(name==='Ahşap sandalye'){
                await pool.query('UPDATE products SET variant_selection_required=TRUE WHERE id=$1',[product]);
                const offer=(await pool.query("INSERT INTO seller_offers(organization_id,store_id,product_id,status) VALUES($1,$2,$3,'active') RETURNING id",[store.org,store.id,product])).rows[0].id;
                for(const [color,amount] of [['Doğal',289000],['Ceviz',319000]]){
                    const variant=(await pool.query("INSERT INTO seller_offer_variants(organization_id,store_id,offer_id,product_id,seller_sku,price_minor,currency,selections,publication_status) VALUES($1,$2,$3,$4,$5,$6,'TRY',$7,'published') RETURNING id",[store.org,store.id,offer,product,`wave2-${store.id}-${color}`,amount,JSON.stringify([{group:'Ahşap rengi',value:color}])])).rows[0].id;
                    await pool.query('INSERT INTO seller_inventory_items(organization_id,store_id,variant_id,quantity) VALUES($1,$2,$3,6)',[store.org,store.id,variant]);
                }
            }
        }
    }
    const versions=[];
    for(const name of ['nova-classic-studio-web-v1_1','nova-pocket-studio-app']){
        const content=JSON.parse(await fs.readFile(path.join(__dirname,'../theme-platform/packages',`${name}.json`),'utf8'));
        versions.push((await experience.execute(principal,'importPackage',{}, {package:content,reason},meta())).result);
    }
    Object.assign(process.env,{PORT:acceptancePort,NOVASTORE_BIND_HOST:'127.0.0.1',NOVASTORE_THEME_PLATFORM_ENABLED:'true',NOVASTORE_THEME_ASSET_ROOT:assetRoot,
        NOVASTORE_THEME_PLATFORM_TRUSTED_HOSTS:'127.0.0.1,localhost,[::1]',SELLER_API_V1_ENABLED:'true',SELLER_API_V1_LOCAL_ONLY:'true',SELLER_API_V1_ACTIVATION_MODE:'local',
        SELLER_PASSWORD_RECOVERY_SECRET:crypto.randomBytes(48).toString('hex'),SELLER_APPLICATION_AUTH_SECRET:crypto.randomBytes(48).toString('hex'),
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_ENABLED:'false',NOVASTORE_LOCAL_PREVIEW:'false'});
    sensitive.add(process.env.SELLER_PASSWORD_RECOVERY_SECRET);sensitive.add(process.env.SELLER_APPLICATION_AUTH_SECRET);
    delete require.cache[require.resolve('../server')];
    const priorSignals=new Map(['SIGINT','SIGTERM'].map(signal=>[signal,new Set(process.listeners(signal))]));
    runtime=require('../server');
    // The fixture owns this process and its one pool. Coordinate cleanup here
    // instead of racing the normal server signal handler's pool.end().
    for(const [signal,prior] of priorSignals)for(const listener of process.listeners(signal))if(!prior.has(listener))process.removeListener(signal,listener);
    let timer;
    try{await Promise.race([once(runtime.io.httpServer,'listening'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Project server did not listen within 30 seconds')),30000);})]);}
    finally{clearTimeout(timer);}
    const url=`http://127.0.0.1:${runtime.io.httpServer.address().port}`;
    const evidenceDir=path.join(__dirname,'../artifacts/theme-wave2');await fs.mkdir(evidenceDir,{recursive:true});
    const stopFile=path.join(evidenceDir,`stop-${crypto.randomUUID()}.signal`);
    const metadata={url,adminUrl:`${url}/admin-login.html`,sellerUrl:`${url}/seller-theme/`,adminEmail:fixtures.admin.email,sellerEmail:fixtures.a.email,
        serviceIds:services.map(row=>row.id),versionIds:versions.map(row=>row.id),database:process.env.DB_NAME,assetRoot,stopFile,production:false};
    await fs.writeFile(path.join(evidenceDir,'local-acceptance.json'),JSON.stringify(metadata,null,2));
    // Windows terminal cancellation can bypass Node's signal handlers. The
    // exact per-run sentinel lets the owner request verified graceful cleanup.
    stopTimer=setInterval(async()=>{try{await fs.access(stopFile);}catch{return;}try{await stopAcceptance();process.exit(0);}catch(error){db.originalConsole.error(db.redact(error.message));process.exit(1);}},1000);
    db.originalConsole.log(JSON.stringify(metadata));
}
main().catch(async error=>{if(db)db.originalConsole.error(db.redact(error.stack||error.message));else console.error(error.message);await stopAcceptance();process.exitCode=1;});
// Stop from the owning terminal. No other running server or container is touched.
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{try{await stopAcceptance();process.exit(0);}catch(error){console.error(error.message);process.exit(1);}});
