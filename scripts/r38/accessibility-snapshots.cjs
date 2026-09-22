'use strict';
// Test-only: axe audits frozen rendered DOM with the exact captured production CSS.
// It neither controls a browser nor injects scripts into the application under test.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
assert.equal(path.basename(root),'pc1-r38-paytr-legacy-schema-review-rc');
const out=path.join(root,'artifacts/r38-r1');
const snapshots=path.join(out,'dom');fs.mkdirSync(snapshots,{recursive:true});
const axe=fs.readFileSync(path.join(root,'storefront-commerce-pro/node_modules/axe-core/axe.min.js'));
const runner=`(async()=>{
  await document.fonts.ready;
  const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
  const summary={engine:result.testEngine,environment:result.testEnvironment,viewport:{width:innerWidth,height:innerHeight},violations:result.violations,incomplete:result.incomplete,passes:result.passes.map(rule=>({id:rule.id,nodes:rule.nodes.length})),inapplicable:result.inapplicable.map(rule=>rule.id)};
  const output=document.createElement('pre');output.id='r38-audit-result';output.textContent=JSON.stringify({done:true,violations:summary.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length})),incomplete:summary.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))});document.body.append(output);
  await fetch(location.origin+'/result'+location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(summary)});
})().catch(error=>{const output=document.createElement('pre');output.id='r38-audit-result';output.textContent=JSON.stringify({error:error.message});document.body.append(output);});`;
const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'&&req.url==='/axe.min.js'){res.setHeader('Content-Type','application/javascript');return res.end(axe);}
  if(req.method==='GET'&&req.url==='/audit.js'){res.setHeader('Content-Type','application/javascript');return res.end(runner);}
  const result=/^\/result\/([a-z0-9-]+)$/.exec(req.url);
  if(req.method==='POST'&&result){let data='';req.on('data',chunk=>{data+=chunk;if(data.length>8e6)req.destroy();});return req.on('end',()=>{try{const value=JSON.parse(data);assert(Array.isArray(value.violations));fs.writeFileSync(path.join(out,'axe-'+result[1]+'.json'),JSON.stringify(value,null,2));res.end('saved');}catch{res.statusCode=400;res.end('invalid');}});}
  const match=/^\/([a-z0-9-]+)$/.exec(req.url);
  if(req.method!=='GET'||!match){res.statusCode=404;return res.end('Not found');}
  const file=path.join(snapshots,match[1]+'.html');
  if(!fs.existsSync(file)){res.statusCode=404;return res.end('No captured DOM');}
  const origin='http://127.0.0.1:'+server.address().port;
  const html=fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>',`<script src="${origin}/axe.min.js"></script><script src="${origin}/audit.js"></script></body>`);
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
});
server.listen(0,'127.0.0.1',()=>console.log('AXE_SNAPSHOT_ORIGIN=http://127.0.0.1:'+server.address().port));
