// Test-only browser entry for the native bundle. Packaged APK CSP is never edited.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../dist/native");
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://127.0.0.1:4177");
  if(url.pathname.startsWith("/api/")||url.pathname.startsWith("/__r26/")||url.pathname.startsWith("/uploads/")||url.pathname==="/r25-product.svg"){
    const upstream=http.request({hostname:"127.0.0.1",port:5000,path:url.pathname+url.search,method:req.method,headers:{...req.headers,host:"127.0.0.1:5000"}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
    upstream.on("error",()=>{res.writeHead(503);res.end();});req.pipe(upstream);return;
  }
  try{
    const target=path.resolve(root,"."+(url.pathname==="/"?"/index.html":decodeURIComponent(url.pathname)));
    if(!target.startsWith(root+path.sep))throw new Error("path");
    let body=await fs.readFile(target);
    const type={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml",".woff2":"font/woff2",".ttf":"font/ttf"}[path.extname(target)]||"application/octet-stream";
    if(path.extname(target)===".html")body=Buffer.from(body.toString().replace("connect-src 'none'","connect-src 'self'"));
    res.writeHead(200,{"content-type":type,"cache-control":"no-store"});res.end(body);
  }catch{res.writeHead(404);res.end();}
});
server.listen(4177,"127.0.0.1",()=>console.log("R26 native browser test entry: http://127.0.0.1:4177"));
process.on("SIGINT",()=>server.close());process.on("SIGTERM",()=>server.close());
