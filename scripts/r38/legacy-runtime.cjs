'use strict';
// Disposable PostgreSQL only. No URL or external database argument is accepted.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {Client}=require('pg');
const net=require('node:net');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const root=path.resolve(__dirname,'../..');
assert.equal(path.basename(root),'pc1-r38-paytr-legacy-schema-review-rc');
const output=path.join(root,'artifacts/r38-r1');fs.mkdirSync(output,{recursive:true});
const fixture=path.join(root,'tests/fixtures/r38');
const reference=JSON.parse(fs.readFileSync(path.join(fixture,'legacy-schema.json'),'utf8'));
const keys=['tables','columns','constraints','indexes','sequences','views','functions','triggers','types','policies'];
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const fingerprint=inventory=>crypto.createHash('sha256').update(JSON.stringify(stable(Object.fromEntries(keys.map(key=>[key,inventory[key]]))))).digest('hex');
assert.equal(fingerprint(reference.inventory),reference.expectedFingerprint);
const catalogSql=fs.readFileSync(path.join(fixture,'catalog.sql'),'utf8');
const snapshot=async client=>(await client.query(catalogSql)).rows[0].inventory;
const docker=(args,env=process.env)=>{
 const result=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,env,timeout:60000});
 if(result.status!==0)throw Error('Disposable Docker operation failed: '+result.stderr);
 return result.stdout.trim();
};
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const safeSystemEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(?:PATH|PATHEXT|SystemRoot|SystemDrive|WINDIR|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|COMSPEC|ProgramFiles|ProgramFiles\(x86\)|ProgramData)$/i.test(key)));
const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
const rowCounts=async client=>{
 const counts={};
 for(const table of reference.inventory.tables)counts[table.name]=Number((await client.query(`SELECT count(*) AS count FROM ${quote(table.name)}`)).rows[0].count);
 return counts;
};
async function seed(client) {
 const file=path.join(output,'live-public-inventory.json');
 assert(fs.existsSync(file),'Run public inventory before local browser rehearsal');
 const live=JSON.parse(fs.readFileSync(file,'utf8'));
 const categories=live.responses.find(entry=>entry.route==='/api/public/categories').value;
 const navigation=live.responses.find(entry=>entry.route==='/api/public/navigation/main').value;
 assert.equal(navigation.code,'main');
 assert.deepEqual(navigation.items,[],'Reproduce the attested empty legacy menu; do not invent entries');
 async function insert(table,values) {
  const allowed=new Set(reference.inventory.columns.filter(column=>column.table_name===table).map(column=>column.name));
  const entries=Object.entries(values).filter(([key,value])=>allowed.has(key)&&value!==undefined);
  await client.query(`INSERT INTO ${quote(table)} (${entries.map(([key])=>quote(key)).join(',')}) VALUES (${entries.map((_,index)=>'$'+(index+1)).join(',')})`,entries.map(([,value])=>value));
 }
 await insert('stores',{id:1,name:'NovaStore',slug:'novastore',is_active:true});
 await insert('menus',{id:1,code:navigation.code,name:navigation.name,is_active:true});
 async function visit(items,parentId=null) {for(const category of items){
  await insert('categories',{...category,parent_id:parentId,is_active:true,is_customer_visible:true,deleted_at:null});
  // Public category visibility is backed by these attested counters, not only flags.
  await insert('category_stats',{...category,category_id:category.id});
  await visit(category.children||[],category.id);
 }}
 await visit(categories);
 const ids=new Set();const gather=items=>items.forEach(item=>{ids.add(Number(item.id));gather(item.children||[]);});gather(categories);
 for(const {value:product} of live.details) {
  const values={...product,store_id:product.store_id?1:null};delete values.id;
  // Only public product fields are copied into this disposable schema.
  await insert('products',{id:product.id,name:product.name,description:product.description,price:product.price,old_price:product.old_price,stock:product.stock,image_url:product.image_url,category:product.category,categories:product.categories,publication_status:'active',is_customer_visible:true,store_id:values.store_id,brand:product.brand,product_type:product.product_type});
  for(const media of product.media||[]) await insert('product_media',{product_id:product.id,media_url:media.media_url,is_main:media.is_main,sort_order:media.sort_order});
  for(const id of product.categoryIds||[]) if(ids.has(Number(id)))await insert('product_categories',{product_id:product.id,category_id:id,is_primary:Number(id)===Number(product.primaryCategoryId)});
 }
 const password=crypto.randomBytes(18).toString('hex');
 await insert('users',{id:900001,email:'r38-local-user@example.invalid',password:await bcrypt.hash(password,10),full_name:'Yerel doğrulama kullanıcısı',name:'Yerel doğrulama kullanıcısı',role:'customer'});
 await insert('users',{id:900002,email:'r38-local-other@example.invalid',password:await bcrypt.hash(crypto.randomBytes(18).toString('hex'),10),role:'customer'});
 await insert('users',{id:900003,email:'r38-local-admin@example.invalid',password:await bcrypt.hash(crypto.randomBytes(18).toString('hex'),10),role:'admin'});
 return {password,userId:900001,productIds:live.details.map(entry=>entry.value.id)};
}
async function main() {
 const suffix=crypto.randomBytes(8).toString('hex');
 const container='novastore-r38-legacy-'+suffix;
 const database='novastore_r38_legacy_'+suffix+'_test';
 const password=crypto.randomBytes(32).toString('hex');
 let created=false,client,server;
 try {
  docker(['run','--pull','never','--rm','--name',container,'-d','-p','127.0.0.1::5432','-e','POSTGRES_DB','-e','POSTGRES_USER','-e','POSTGRES_PASSWORD','postgres:17'],{...safeSystemEnv(),POSTGRES_DB:database,POSTGRES_USER:'r38_test',POSTGRES_PASSWORD:password});created=true;
  const dbPort=Number(/^127\.0\.0\.1:(\d+)$/.exec(docker(['port',container,'5432/tcp']))?.[1]);assert(dbPort);
  const config={host:'127.0.0.1',port:dbPort,database,user:'r38_test',password,ssl:false,connectionTimeoutMillis:1000};
  for(let attempt=0;attempt<60;attempt++){client=new Client(config);try{await client.connect();break;}catch(error){await client.end().catch(()=>{});if(attempt===59)throw error;await new Promise(resolve=>setTimeout(resolve,200));}}
  assert.equal((await client.query('SELECT current_database() name')).rows[0].name,database);
  await client.query(fs.readFileSync(path.join(fixture,'legacy-schema.sql'),'utf8'));
  const pre=fingerprint(await snapshot(client));assert.equal(pre,reference.expectedFingerprint,'Exact R36 clone fingerprint');
  const seeded=await seed(client);
  const beforeCounts=await rowCounts(client);
  // New application connections have a database-enforced read-only default.
  await client.query("ALTER ROLE r38_test SET default_transaction_read_only = on");
  const port=await freePort();const origin='http://127.0.0.1:'+port;
  const env={...safeSystemEnv(),NODE_ENV:'test',PORT:String(port),NOVASTORE_SAFE_LOCAL_BACKEND:'true',NOVASTORE_ALLOW_REMOTE_DB:'false',NOVASTORE_ALLOW_SCHEMA_INIT:'false',SKIP_SCHEMA_INIT:'true',NOVASTORE_PUBLIC_REVIEW_RELEASE:'true',DATABASE_URL:`postgresql://r38_test:${password}@127.0.0.1:${dbPort}/${database}`,DB_SSL:'false',JWT_SECRET:crypto.randomBytes(48).toString('hex'),ALLOWED_ORIGINS:origin};
  const log=fs.openSync(path.join(output,'legacy-server.log'),'w');
  server=spawn(process.execPath,['--require','./scripts/r38/request-audit.cjs','server.js'],{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});
  let ready=false;for(let attempt=0;attempt<100;attempt++){if(server.exitCode!==null)throw Error('Legacy server exited; inspect local log');try{const response=await fetch(origin+'/api/products');if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,150));}assert(ready,'Legacy server boot');
  const evidence={origin,container,initialFingerprint:pre,boot:'PASS',requests:[],paymentCount:0,productionWrites:0};
  const request=async (route,options={})=>{const response=await fetch(origin+route,options);const text=await response.text();evidence.requests.push({route,method:options.method||'GET',status:response.status});return {response,text};};
  const {listLegalDocuments}=require('../../services/publicReviewLegalService');
  const capability=JSON.parse((await request('/api/payments/capability')).text);
  assert.equal(capability.realPaymentReady,false);assert.equal(capability.provider,null);
  const loginPage=await request('/login.html');assert.equal(loginPage.response.status,200);
  assert(loginPage.text.includes('Yeni üyelik yayına hazırlık süresince kapalıdır.'));
  assert(!loginPage.text.includes('id="register-form"'));
  for(const route of ['/','/api/products','/api/products/'+seeded.productIds[0],'/api/public/categories?format=tree','/api/public/navigation/main','/api/public/collections','/api/business-identity','/api/public/legal','/checkout.html','/iletisim',...listLegalDocuments().map(doc=>doc.path)]) {
   const {response,text}=await request(route);assert.equal(response.status,200,route);assert(!/relation .* does not exist|42P01|stack trace/i.test(text),route);assert.equal(response.headers.get('x-robots-tag'),'noindex, follow');
  }
  for(const route of ['/api/payments/initialize','/api/users/register','/api/orders','/api/assistant/chat','/api/analytics/page-enter']) {
   const {response}=await request(route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,503,route);
  }
  const login=await request('/api/users/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'r38-local-user@example.invalid',password:seeded.password})});
  assert.equal(login.response.status,200,'Existing account login');const token=JSON.parse(login.text).token;assert(token);
  for(const route of ['/api/users/me','/api/orders/user/'+seeded.userId])assert.equal((await request(route,{headers:{Authorization:'Bearer '+token}})).response.status,200,route);
  const ownHeaders={headers:{Authorization:'Bearer '+token}};
  for(const route of ['/api/questions/user','/api/reviews/user/'+seeded.userId,'/api/addresses','/api/shared-state/cart']) {
   assert.equal((await request(route,ownHeaders)).response.status,200,route);
   assert.equal((await request(route)).response.status,401,'Unauthenticated '+route);
  }
  for(const route of ['/api/reviews/user/900002','/api/orders/user/900002']) assert.equal((await request(route,ownHeaders)).response.status,403,'Cross-customer '+route);
  assert.equal((await request('/api/questions/user?user_id=900002',ownHeaders)).response.status,200,'Question owner comes from JWT, not query');
  const emptyMenu=JSON.parse((await request('/api/public/navigation/main')).text);assert.deepEqual(emptyMenu.items,[]);
  const publicCategories=JSON.parse((await request('/api/public/categories?format=tree')).text);
  assert.equal(publicCategories.length,4,'Disposable fixture reproduces all four attested public roots');
  for(const category of publicCategories)for(const route of ['/api/public/categories/'+category.slug,'/api/public/categories/'+category.slug+'/filters'])assert.equal((await request(route)).response.status,200,route);
  assert.equal((await request('/api/admin/session')).response.status,401,'Admin stays protected');
  assert.equal((await request('/api/admin/session',ownHeaders)).response.status,403,'Customer is not admin');
  const adminToken=jwt.sign({id:900003,role:'admin'},env.JWT_SECRET,{expiresIn:'10m'});
  assert.equal((await request('/api/admin/session',{headers:{Authorization:'Bearer '+adminToken}})).response.status,200,'Current admin');
  assert.equal((await request('/api/admin/collections',{headers:{Authorization:'Bearer '+adminToken}})).response.status,200,'Existing catalog read');
  assert.equal(fingerprint(await snapshot(client)),pre,'No schema mutation');
  const afterCounts=await rowCounts(client);
  assert.deepEqual(afterCounts,beforeCounts,'All legacy table row counts remain unchanged');
  assert.equal(afterCounts.orders,0);assert.equal(afterCounts.users,3);
  const counts={orders:afterCounts.orders,users:afterCounts.users,paymentTables:Object.fromEntries(Object.entries(afterCounts).filter(([name])=>/payment/.test(name)))};
  evidence.counts=counts;evidence.allTableRowCountsUnchanged=true;evidence.finalFingerprint=pre;evidence.status='PASS';
  fs.writeFileSync(path.join(output,'legacy-runtime.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',origin,container,fingerprint:pre,httpChecks:evidence.requests.length,counts}));
  if(process.argv.includes('--serve')) {
   fs.writeFileSync(path.join(output,'browser-network.jsonl'),'');
   console.log('READY_FOR_BROWSER');await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);const timer=setInterval(()=>{if(fs.existsSync(path.join(output,'stop-local-runtime'))) {clearInterval(timer);resolve();}},500);});
   assert.deepEqual(await rowCounts(client),beforeCounts,'Browser journey made no database writes');
   assert.equal(fingerprint(await snapshot(client)),pre,'Browser journey changed no schema');
   evidence.browserJourneyDatabaseUnchanged=true;
   fs.writeFileSync(path.join(output,'legacy-runtime.json'),JSON.stringify(evidence,null,2)+'\n');
  }
 } finally {
  if(server&&!server.killed){server.kill();await new Promise(resolve=>server.once('exit',resolve));}
  if(client)await client.end().catch(()=>{});
  if(created){assert(/^novastore-r38-legacy-[0-9a-f]{16}$/.test(container));docker(['rm','-f',container]);}
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
