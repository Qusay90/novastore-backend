'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');assert.equal(path.basename(root),'pc1-r38-paytr-legacy-schema-review-rc');
const out=path.join(root,'artifacts/r38-r1');const read=file=>fs.readFileSync(path.join(root,file));const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
const files=[...new Set((git('diff','--name-only','HEAD','-z')+git('ls-files','--others','--exclude-standard','-z')).split('\0').filter(Boolean))].sort();
const artifact=read('frontend/public-review/index.html');const html=artifact.toString('utf8');
assert.deepEqual(artifact,read('artifacts/r38-r1/final-build-1/index.html'));assert.deepEqual(artifact,read('artifacts/r38-r1/final-build-2/index.html'));
const modules=JSON.parse(read('artifacts/r38-r1/bundle-modules.json')).filter(m=>m.renderedLength>0&&!m.id.includes('node_modules')&&!m.id.includes('\0')&&/\.(?:js|jsx|json)$/.test(m.id));
const sourcePaths=[...new Set([...modules.map(m=>m.id),'routes/publicReviewRoutes.js','routes/publicReviewWebRoutes.js','config/publicReviewConfig.js','config/paytrReviewLegalContent.js','services/publicReviewLegalService.js','frontend/public-review-login.html','frontend/public-review-login.js'])];
const productionText=sourcePaths.map(p=>read(p).toString('utf8')).join('\n');
const originPatterns={localhost:/\b(?:localhost|127\.0\.0\.1)\b/i,deneme:/deneme\.novastore\.tr/i,fixture:/createCanonicalFixtureRuntime|main-integrated-fixture|fixture-integrated/i,devServer:/@vite\/client|sourceMappingURL/i,absoluteDisk:/[A-Z]:[\\/](?:Users|work|source)[\\/]/};
const hygiene=Object.fromEntries(Object.entries(originPatterns).map(([key,pattern])=>[key,{source:pattern.test(productionText)?1:0,artifact:pattern.test(html)?1:0}]));
for(const [name,result] of Object.entries(hygiene))assert.equal(result.source+result.artifact,0,'Origin hygiene '+name);
assert(!html.includes('novastore-stage.com'));
const css=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');
const urls=[...css.matchAll(/url\(\s*([^)]+)\)/g)].map(m=>m[1].replace(/^['"]|['"]$/g,''));
assert(urls.length>0,'Embedded CSS assets found');assert(urls.every(url=>url.startsWith('data:')),'All CSS assets embedded');
const secretRules={privateKey:/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,serviceAccount:/["']type["']\s*:\s*["']service_account["']/,githubToken:/\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}\b/,awsKey:/\bAKIA[0-9A-Z]{16}\b/,databaseCredential:/postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@(?!127\.0\.0\.1|localhost)[A-Za-z0-9.-]+/};
const findings=[];const inventory=[];
for(const file of files){if(!fs.existsSync(path.join(root,file)))continue;const bytes=read(file);inventory.push({path:file,bytes:bytes.length,sha256:sha(bytes)});if(!/\.(?:js|jsx|mjs|cjs|json|html|css|md|sql|txt)$/.test(file))continue;const text=bytes.toString('utf8');for(const [kind,rule] of Object.entries(secretRules))if(rule.test(text))findings.push({path:file,kind});}
// Scan exact production bytes independently of text-file classification.
for(const [kind,rule] of Object.entries(secretRules))if(rule.test(html))findings.push({path:'artifact',kind});
assert.deepEqual(findings,[],'Potential secret locations only; never print values');
const qa=JSON.parse(read('artifacts/r38-r1/browser-qa-final.json'));const finalQa=[...new Map(qa.filter(r=>r.id.startsWith('final-')).map(r=>[r.id,r])).values()];
for(const width of [360,390,768,1024,1280,1440])assert(finalQa.filter(r=>r.viewport.width===width).length>=21,'Six-width coverage');
for(const r of finalQa){assert.equal(r.overflow,0);assert.equal(r.brokenImages.length,0);assert.equal(r.overflowElements.length,0);assert.equal(r.cardFields,0);for(const phone of r.contactPhones)assert.deepEqual(phone,{href:'tel:+905551772430',text:'0555 177 24 30'});}
const axe=JSON.parse(read('artifacts/r38-r1/axe-final-summary.json'));assert.equal(axe.length,31);assert(axe.every(r=>r.done&&r.violations.length===0));
const network=read('artifacts/r38-r1/browser-network.jsonl').toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
assert(network.length>0);assert(network.every(r=>['GET','HEAD'].includes(r.method)),'Review browser uses no write request');
const badNetwork=network.filter(r=>r.status>=400);assert.deepEqual(badNetwork,[],'Review browser asset/API responses');
const catalog=JSON.parse(read('artifacts/r38-r1/live-public-inventory.json'));assert.equal(catalog.catalogBlockerRecheck,'PASS');assert.equal(catalog.additionalCatalogBlockerCount,0);
const runtime=JSON.parse(read('artifacts/r38-r1/legacy-runtime.json'));assert.equal(runtime.status,'PASS');assert.equal(runtime.initialFingerprint,'4bdfb53e2823836fc7560570667d65a1ea332ba2ba18632d4dd163389517d56a');
assert.equal(runtime.browserJourneyDatabaseUnchanged,true,'Stop local harness after QA to attest unchanged DB');
const result={at:new Date().toISOString(),status:'PASS',artifactSha256:sha(artifact),artifactBytes:artifact.length,twoCleanBuilds:'BYTE_IDENTICAL',productionSourceCount:sourcePaths.length,embeddedCssAssetCount:urls.length,hygiene,secretScan:{files:inventory.length,findings:[],valuesPrinted:0},browser:{pages:finalQa.length,sixWidths:6,overflow:0,criticalClipping:0,brokenImages:0,requests:network.length,nonReadRequests:0,failedRequests:0},accessibility:{runs:axe.length,violations:0,critical:0,manualReviewCategories:[...new Set(axe.flatMap(r=>r.incomplete.map(i=>i.id)))]},schemaFingerprint:runtime.initialFingerprint,dbUnchanged:true,catalogObservedAt:catalog.observedAt};
fs.writeFileSync(path.join(out,'candidate-source-inventory.json'),JSON.stringify(inventory,null,2)+'\n');fs.writeFileSync(path.join(out,'release-audit.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
