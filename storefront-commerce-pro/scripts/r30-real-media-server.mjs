// Public commerce/media comes from sealed PC1 R30 and disposable PostgreSQL.
// Unrelated bootstrap reads and guest state are explicitly local fixtures.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
export const ui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const backend = path.resolve(ui, "../../android-customer-theme-20260722/pc1-r30-canonical-variant-media");
export const expectedBackend = { head: "407a06d9703a66bb092f63f4ddf8fbf5a5fa70eb", tree: "9a500b980f2c129f18f7ffefb8cc21fb5b9dcc3a" };
export function attestBackend() {
  const git = (args) => { const r=spawnSync("git",args,{cwd:backend,encoding:"utf8",windowsHide:true}); assert.equal(r.status,0); return r.stdout.trim(); };
  assert.equal(git(["rev-parse","HEAD"]),expectedBackend.head);
  assert.equal(git(["rev-parse","HEAD^{tree}"]),expectedBackend.tree);
  assert.equal(git(["status","--porcelain"]),"");
  return expectedBackend;
}
export async function startMediaFixture(port=0) {
  attestBackend();
  const ready=JSON.parse(await fs.readFile(path.join(backend,"artifacts/r30-media/server-ready.json"),"utf8"));
  assert.equal(ready.backendHead,expectedBackend.head);assert.equal(ready.origin,"http://127.0.0.1:5096");
  const html=await fs.readFile(path.join(ui,"../frontend/commerce-pro/index.html"));
  const bridges=new Map(await Promise.all(["shared-state-sync.js","favorites-sync.js"].map(async name=>["/"+name,await fs.readFile(path.join(ui,"../frontend",name))])));
  const state={calls:[],unknown:[],dtos:{},cart:{version:1,items:[]},checkout:{}};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,"http://127.0.0.1");
    const json=(body,status=200)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(body));};
    try {
      if(url.pathname==="/"){res.writeHead(200,{"Content-Type":"text/html"});return res.end(html);}
      if(bridges.has(url.pathname)){res.writeHead(200,{"Content-Type":"application/javascript"});return res.end(bridges.get(url.pathname));}
      if(["/favicon.ico","/favicon.svg"].includes(url.pathname)){res.writeHead(204);return res.end();}
      let raw="";for await(const chunk of req){raw+=chunk;assert(raw.length<=128*1024);}
      const body=raw?JSON.parse(raw):null;state.calls.push({path:url.pathname,method:req.method,body});
      const publicRead=req.method==="GET"&&(/^\/api\/products(?:\/\d+)?$/.test(url.pathname)||url.pathname.startsWith("/api/public/stores/")||url.pathname.startsWith("/uploads/local-products/"));
      const quote=req.method==="POST"&&url.pathname==="/api/campaigns/quote";
      if(publicRead||quote){
        const r=await fetch(ready.origin+url.pathname+url.search,{method:req.method,...(quote?{headers:{"Content-Type":"application/json"},body:raw}:{})});
        const bytes=Buffer.from(await r.arrayBuffer());
        if(/^\/api\/products\/\d+$/.test(url.pathname)&&r.ok)state.dtos[url.pathname]=JSON.parse(bytes);
        res.writeHead(r.status,{"Content-Type":r.headers.get("content-type")||"application/octet-stream","Cache-Control":"no-store"});return res.end(bytes);
      }
      if(url.pathname==="/api/public/categories")return json([{id:1,name:"Kategorisiz",slug:"kategorisiz",path:"kategorisiz",parent_id:null,children:[]}]);
      if(url.pathname==="/api/public/navigation/main")return json({code:"main",items:[]});
      if(["/api/public/collections","/api/campaigns/coupons/active","/api/addresses"].includes(url.pathname))return json([]);
      if(["/api/public/business-identity","/api/business-identity"].includes(url.pathname))return json({status:"pending_owner_company_formation",identity:null});
      if(url.pathname==="/api/assistant/capability")return json({available:false,reason:"provider_not_configured",modes:[]});
      if(url.pathname==="/api/payments/capability")return json({provider:"paytr",ready:false,state:"unavailable",message:"Yerel test",agreements:[]});
      if(/^\/api\/questions\/product\//.test(url.pathname))return json({items:[],limit:20,hasMore:false,nextCursor:null});
      if(/^\/api\/reviews\/product\//.test(url.pathname))return json({reviews:[],average:0,totalReviews:0,pagination:{limit:20,hasMore:false,nextCursor:null}});
      if(url.pathname==="/api/shared-state/cart"){if(body)state.cart=body.payload;return json({exists:true,payload:state.cart});}
      if(url.pathname==="/api/shared-state/checkout"){if(body)state.checkout=body.payload;return json({exists:true,payload:state.checkout});}
      if(url.pathname==="/api/favorites"||url.pathname.startsWith("/api/favorites/"))return json({productIds:[]});
      state.unknown.push({path:url.pathname,method:req.method});json({code:"R30_TEST_ROUTE_DENIED"},404);
    }catch{json({code:"R30_FIXTURE_REJECTED"},409);}
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve);});
  return {base:`http://127.0.0.1:${server.address().port}`,state,html,ready,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(()=>{attestBackend();resolve();});})};
}
if(process.argv.includes("--serve")){
  const fixture=await startMediaFixture(5097);console.log(`R30 Web ready: ${fixture.base}`);
  for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>void fixture.close());
}
