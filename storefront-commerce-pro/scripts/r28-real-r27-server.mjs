import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import net from "node:net";
import { seedR25Database } from "./r28-real-r27-fixtures.mjs";

const ui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.resolve(ui, "../../android-customer-theme-20260722/pc1-r27-public-marketplace-read-contracts");
const requireBackend = createRequire(path.join(backend,"package.json"));
const artifact = path.join(ui,"../artifacts/r28-verification");
fs.mkdirSync(artifact,{recursive:true});
const expected = ["b654dada7a67ce8904eed9ccd1ff037e5f16e5ed","348747a9d140b112dcbc85db3a103967a29d9292"];
const cmd = (name,args,env=process.env,cwd=ui) => {
  const r=spawnSync(name,args,{encoding:"utf8",windowsHide:true,timeout:60000,env,cwd});
  assert.equal(r.status,0, name+" failed"); return r.stdout.trim();
};
const dockerContext=cmd("docker",["context","show"]);
const dockerEndpoint=cmd("docker",["context","inspect",dockerContext,"--format","{{(index .Endpoints \"docker\").Host}}"]);
assert(/^(npipe|unix):\/\//.test(dockerEndpoint),"Only a local Docker daemon may own this disposable fixture");
const docker=(args,env=process.env)=>{
 const localEnv={...env};for(const key of ["DOCKER_HOST","DOCKER_CONTEXT","DOCKER_TLS_VERIFY","DOCKER_CERT_PATH"])delete localEnv[key];
 return cmd("docker",["--context",dockerContext,...args],localEnv);
};
const attest=()=>{assert.equal(cmd("git",["rev-parse","HEAD"],process.env,backend),expected[0]);assert.equal(cmd("git",["rev-parse","HEAD^{tree}"],process.env,backend),expected[1]);assert.equal(cmd("git",["status","--porcelain"],process.env,backend),"");};
attest();
assert(process.argv.includes("--execute-disposable-db"));
const run=crypto.randomBytes(8).toString("hex"), container="novastore-r28-r27-"+run, database="novastore_r28_"+run+"_test";
const password=crypto.randomBytes(32).toString("base64url"), secret=crypto.randomBytes(48).toString("base64url");
let pool, server, created=false, closing=false, outbound=0;
const logs=[], requests=[];
const say=console.log.bind(console);
for(const key of ["log","warn","error","info","debug"]) console[key]=(...args)=>logs.push(args.map(String).join(" "));
const oldConnect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
  let a=args; if(Array.isArray(a[0])) a=a[0];
  const opts=a[0];const host=typeof opts==="object"?(opts.host||opts.hostname||"localhost"):typeof a[1]==="string"?a[1]:"localhost";
  if(!["127.0.0.1","localhost","::1"].includes(host)){outbound++;throw new Error("Nonloopback transport blocked");}
  return oldConnect.apply(this,args);
};
const oldFetch=global.fetch;
global.fetch=(target,options)=>{if(!["127.0.0.1","localhost"].includes(new URL(target).hostname)){outbound++;throw new Error("Nonloopback fetch blocked");}return oldFetch(target,{...options,redirect:"error"});};
async function finish(error) {
 if(closing)return;closing=true;
 try{
   if(server)await new Promise(resolve=>server.close(resolve));
   if(pool)await pool.end();
   if(created){assert(/^novastore-r28-r27-[a-f0-9]{16}$/.test(container));docker(["rm","-f",container]);}
   attest();
   fs.writeFileSync(path.join(artifact,"real-r27-server-result.json"),JSON.stringify({result:error?"FAIL":"PASS",error:error?String(error.message).replaceAll(password,"[REDACTED]").replaceAll(secret,"[REDACTED]"):null,backend:{head:expected[0],tree:expected[1],unchanged:true},ownedContainerRemoved:true,productionWrites:0,providerCalls:0,outbound,requests},null,2));
 }catch(e){say("Cleanup failed: "+e.message);process.exitCode=1;}
 if(error){say("R28 server failed: "+String(error.message).replaceAll(password,"[REDACTED]").replaceAll(secret,"[REDACTED]"));process.exitCode=1;}else say("R28 R27 server cleanly closed");
}
async function main(){
 docker(["run","--pull","never","--rm","--name",container,"-d","-p","127.0.0.1::5432","-e","POSTGRES_DB","-e","POSTGRES_USER","-e","POSTGRES_PASSWORD","postgres:16-bookworm"],{...process.env,POSTGRES_DB:database,POSTGRES_USER:"r28_test",POSTGRES_PASSWORD:password});created=true;
 const port=/^127\.0\.0\.1:(\d+)$/.exec(docker(["port",container,"5432/tcp"]))?.[1];assert(port);
 const url="postgresql://r28_test:"+password+"@127.0.0.1:"+port+"/"+database;
 for(const key of Object.keys(process.env))if(/^(DATABASE_URL|DB_|PAYTR_|IYZICO_|STRIPE_|SUPABASE_|AWS_|AZURE_|GOOGLE_|CLOUDINARY_|FIREBASE_|REDIS_|OPENAI_|ANTHROPIC_|RESEND_|SMTP_|MAIL_|SENTRY_|RENDER_|STOCKY_)/.test(key))delete process.env[key];
 Object.assign(process.env,{NODE_ENV:"test",NOVASTORE_DEPLOY_ENV:"local",NOVASTORE_SAFE_LOCAL_BACKEND:"true",NOVASTORE_ALLOW_REMOTE_DB:"false",SKIP_SCHEMA_INIT:"true",NOVASTORE_ALLOW_SCHEMA_INIT:"false",DATABASE_URL:url,DB_HOST:"127.0.0.1",DB_PORT:port,DB_NAME:database,DB_USER:"r28_test",DB_PASSWORD:password,DB_SSL:"false",SUPABASE_USE_POOLER:"false",SUPABASE_POOLER_HOST:"",SUPABASE_REGION:"",SUPABASE_PROJECT_REF:"",JWT_SECRET:secret,NOVASTORE_NOTIFICATION_WORKER_ENABLED:"false",NOVASTORE_REQUEST_LOGGING_ENABLED:"false",PAYTR_LIVE_REQUESTS_ALLOWED:"false"});
 // Synthetic local legal identity permits only the real read-only checkout preview.
 Object.assign(process.env,{BUSINESS_LEGAL_COMPANY_NAME:"NovaStore Local Integration Test",BUSINESS_TRADE_NAME:"NovaStore R28 Test",BUSINESS_TAX_VKN:"1234567890",BUSINESS_TAX_OFFICE:"Yerel Test",BUSINESS_MERSIS_NUMBER:"1234567890123456",BUSINESS_REGISTERED_ADDRESS:"Yalnız yerel test adresi, İstanbul",BUSINESS_KEP_ADDRESS:"r28@example.test",BUSINESS_PHONE:"+905550000025",BUSINESS_EMAIL:"r28@example.test",CUSTOMER_PUBLIC_DOMAIN:"https://novastore.example",NOVASTORE_LEGAL_PRE_INFORMATION_APPROVED:"true",NOVASTORE_LEGAL_PRE_INFORMATION_VERSION:"r28-local-v1",NOVASTORE_LEGAL_PRE_INFORMATION_TEXT:"Yalnız yerel R28 ön bilgilendirme fixture metni.",NOVASTORE_LEGAL_DISTANCE_SALE_APPROVED:"true",NOVASTORE_LEGAL_DISTANCE_SALE_VERSION:"r28-local-v1",NOVASTORE_LEGAL_DISTANCE_SALE_TEXT:"Yalnız yerel R28 mesafeli satış fixture metni.",FREE_SHIPPING_THRESHOLD:"1",DEFAULT_SHIPPING_FEE:"49.90"});
 requireBackend("dotenv").config=()=>({parsed:{}});
 const {Client}=requireBackend("pg");
 for(let n=0;n<80;n++){const c=new Client({connectionString:url,ssl:false});try{await c.connect();assert.equal((await c.query("SELECT current_database() name")).rows[0].name,database);await c.end();break;}catch(e){await c.end().catch(()=>{});if(n===79)throw e;await new Promise(r=>setTimeout(r,150));}}
 const get=p=>requireBackend(path.join(backend,p));
 const {LOCAL_TEST_CAPABILITY}=get("scripts/staging-migrations/guard.js");
 const registry=get("scripts/staging-migrations/registry.js").loadRegistry();
 const env={NODE_ENV:"test",NOVASTORE_DEPLOY_ENV:"staging",NOVASTORE_STAGING_MIGRATIONS_ENABLED:"true",NOVASTORE_ALLOW_REMOTE_DB:"true",NOVASTORE_EXPECTED_DATABASE_HOST:"127.0.0.1",NOVASTORE_EXPECTED_DATABASE_NAME:database,[LOCAL_TEST_CAPABILITY]:"true",DATABASE_URL:url};
 const apply=get("scripts/staging-migrations/runner.js").runApply;
 assert.deepEqual((await apply({env,registry,output:()=>{}})).applied,registry.map(r=>r.id));
 assert.deepEqual((await apply({env,registry,output:()=>{}})).applied,[]);
 const mainModule=requireBackend.resolve(path.join(backend,"server.js"));requireBackend.cache[mainModule]={id:mainModule,filename:mainModule,loaded:true,exports:{io:null}};
 pool=get("config/db.js");
 const ids=await seedR25Database({pool,requireR21:requireBackend,r21Root:backend,customerPassword:"R28LocalOnly!2026"});
 await pool.query("INSERT INTO seller_store_profiles(organization_id,store_id) SELECT organization_id,id FROM seller_stores ON CONFLICT DO NOTHING");
 const stores=(await pool.query("SELECT id,slug FROM stores WHERE slug=ANY($1::text[])",[["r25-canonical-store","r25-foreign-store"]])).rows;
 const a=stores.find(r=>r.slug==="r25-canonical-store").id,b=stores.find(r=>r.slug==="r25-foreign-store").id;
 const root=(await pool.query("INSERT INTO categories(name,slug,path,hide_when_empty) VALUES('R28 Teknoloji','r28-teknoloji','r28-teknoloji',FALSE) RETURNING id")).rows[0].id;
 const child=(await pool.query("INSERT INTO categories(name,slug,path,parent_id,hide_when_empty) VALUES('R28 Alt Kategori','r28-alt','r28-teknoloji/r28-alt',$1,FALSE) RETURNING id",[root])).rows[0].id;
 const nested=(await pool.query("INSERT INTO categories(name,slug,path,parent_id,hide_when_empty) VALUES('R28 İç Kategori','r28-ic','r28-teknoloji/r28-alt/r28-ic',$1,FALSE) RETURNING id",[child])).rows[0].id;
 const other=(await pool.query("INSERT INTO categories(name,slug,path,hide_when_empty) VALUES('R28 Diğer','r28-diger','r28-diger',FALSE) RETURNING id")).rows[0].id;
 const rows=(await pool.query(`INSERT INTO products(name,description,price,stock,store_id,publication_status,is_customer_visible,variant_selection_required,created_at,image_url)
 SELECT 'R28 Ortak Ürün '||LPAD(n::text,3,'0'),'<img src=x onerror=globalThis.__r28Injected=true> açıklama',100+n,7,
 CASE WHEN n%2=0 THEN $1::BIGINT ELSE $2::BIGINT END,'active',TRUE,FALSE,TIMESTAMP '2026-09-18 10:00:00'+n*INTERVAL '1 second','/uploads/local-products/r28.png'
 FROM generate_series(1,105) n RETURNING id,name,store_id`,[a,b])).rows;
 for(let i=0;i<rows.length;i++) await pool.query("INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,TRUE)",[rows[i].id,i%3===0?other:i%2===0?nested:child]);
 const product=rows.at(-1).id;
 const users=(await pool.query(`INSERT INTO users(full_name,email,password,phone) SELECT 'Özel Müşteri '||n,'r28-private-'||n||'@example.test','unused','05555555555' FROM generate_series(1,29) n RETURNING id`)).rows;
 await pool.query(`INSERT INTO product_questions(product_id,user_id,question,answer,answered_by,created_at,answered_at)
 SELECT $1,$2,'Soru <img src=x onerror=globalThis.__r28Injected=true> '||n,'Yanıt <script>DATA</script> '||n,$2,
 TIMESTAMP '2026-09-18 10:00:00'+n*INTERVAL '1 second',TIMESTAMP '2026-09-18 11:00:00'+n*INTERVAL '1 second' FROM generate_series(1,27) n`,[product,users[0].id]);
 await pool.query("INSERT INTO product_questions(product_id,user_id,question) VALUES($1,$2,'R28 PRIVATE UNANSWERED')",[product,ids.customerId]);
 for(let i=0;i<29;i++) await pool.query("INSERT INTO reviews(product_id,user_id,rating,comment,status) VALUES($1,$2,$3,$4,$5)",[product,users[i].id,i<9?1:5,i<27?"Yorum <b>DATA</b> "+i:"R28 PRIVATE REVIEW",i<27?"PUBLISHED":i===27?"PENDING":"HIDDEN"]);
 await pool.query("INSERT INTO review_media(review_id,media_url,media_type,sort_order) SELECT id,'/uploads/local-products/r28.png','image',0 FROM reviews WHERE product_id=$1 AND status='PUBLISHED' ORDER BY id DESC LIMIT 1",[product]);
 const attr=(await pool.query("INSERT INTO attribute_definitions(code,name,type,is_filterable) VALUES('r28_color','Renk','text',TRUE) RETURNING id")).rows[0].id;
 for(const cat of [child,nested,other]){
  const template=(await pool.query("INSERT INTO attribute_templates(name,category_id) VALUES('R28 Filter',$1) RETURNING id",[cat])).rows[0].id;
  await pool.query("INSERT INTO template_attributes(template_id,attribute_id,is_filterable) VALUES($1,$2,TRUE)",[template,attr]);
 }
 await pool.query("INSERT INTO product_attribute_values(product_id,attribute_id,text_value) SELECT id,$1,CASE WHEN id%2=0 THEN 'Mavi' ELSE 'Kırmızı' END FROM products WHERE id=ANY($2::INTEGER[])",[attr,rows.map(r=>r.id)]);
 await get("services/categoryStatsService.js").recalculateAllCategoryStats(pool);
 const express=requireBackend("express"),app=express();app.use(express.json({limit:"128kb"}));
 app.use((req,res,next)=>{requests.push({method:req.method,path:req.path,query:req.query});next();});
 const fixture={...ids,expectedAttributes:undefined,marketplaceIds:rows.map(r=>Number(r.id)),reputationProductId:Number(product),storeA:"r25-canonical-store",storeB:"r25-foreign-store",rootCategory:Number(root),childCategory:Number(child),nestedCategory:Number(nested),otherCategory:Number(other)};
 app.get("/__r28/fixture",(_req,res)=>res.json(fixture));
 app.get("/__r28/requests",(_req,res)=>res.json(requests));
 app.post("/__r28/rename-category",async(_req,res)=>{await pool.query("UPDATE categories SET name='R28 Alt Güncellendi' WHERE id=$1",[child]);res.json({ok:true});});
 app.post("/__r28/store-b-operational",async(req,res)=>{
   if(typeof req.body?.open!=="boolean")return res.status(400).json({code:"FIXTURE_INPUT_INVALID"});
   await pool.query("UPDATE seller_stores SET status=CASE WHEN $1 THEN 'active' ELSE 'closed' END,closed_at=CASE WHEN $1 THEN NULL ELSE NOW() END WHERE legacy_store_id=$2",[req.body.open,b]);res.json({ok:true});
 });
 app.post("/__r28/shutdown",(_req,res)=>{res.json({ok:true});setTimeout(()=>void finish(),25);});
 app.use("/api/payments",(req,res,next)=>{
   if((req.method==="GET"&&req.path==="/capability")||(req.method==="POST"&&req.path==="/agreements/preview"))return next();
   return res.status(403).json({code:"R28_PROVIDER_OPERATIONS_FORBIDDEN"});
 },get("routes/paymentRoutes.js"));
 for(const [mount,file] of [["shared-state","sharedStateRoutes"],["public/navigation","publicNavigationRoutes"],["public/collections","publicCollectionRoutes"],["public/legal","publicLegalRoutes"],["products","productRoutes"],["public/categories","publicCategoryRoutes"],["public/stores","publicStoreRoutes"],["questions","questionRoutes"],["reviews","reviewRoutes"],["users","userRoutes"],["addresses","addressRoutes"],["favorites","favoriteRoutes"],["store-follows","storeFollowRoutes"],["orders","orderRoutes"],["returns","returnRoutes"],["notifications","notificationRoutes"],["campaigns","campaignRoutes"]])app.use("/api/"+mount,get("routes/"+file+".js"));
 app.use("/api",get("routes/runtimeMetaRoutes.js"));
 app.get("/api/assistant/capability",(_req,res)=>res.json({available:false,reason:"provider_not_configured",modes:[]}));
 app.get("/uploads/local-products/r28.png",(_req,res)=>res.sendFile(path.join(ui,"src/assets/optimized/phone-iphone.webp")));
 app.get("/r25-product.svg",(_req,res)=>res.sendFile(path.join(ui,"src/assets/optimized/phone-iphone.webp")));
 app.get("/",(_req,res)=>res.sendFile(path.join(ui,"../frontend/commerce-pro/index.html")));
 app.use(express.static(path.join(ui,"../frontend")));
 app.use((req,res)=>res.status(404).json({code:"R28_TEST_ROUTE_NOT_FOUND"}));
 server=await new Promise((resolve,reject)=>{const s=app.listen(5088,"127.0.0.1",()=>resolve(s));s.on("error",reject);});
 fs.writeFileSync(path.join(artifact,"real-r27-ready.json"),JSON.stringify({backend:{head:expected[0],tree:expected[1]},fixture},null,2));
 say("READY real immutable R27 + disposable PostgreSQL at 127.0.0.1:5088");
}
process.on("SIGINT",()=>void finish());process.on("SIGTERM",()=>void finish());
main().catch(e=>void finish(e));
