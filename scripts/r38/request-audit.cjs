'use strict';
// Explicit test-harness preload; never loaded by the production entry point.
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const originalEmit=http.Server.prototype.emit;
const target=path.resolve(__dirname,'../../artifacts/r38-r1/browser-network.jsonl');
http.Server.prototype.emit=function(event,...args){
  if(event==='request'){
    const [req,res]=args;
    res.once('finish',()=>fs.appendFileSync(target,JSON.stringify({time:new Date().toISOString(),method:req.method,path:req.url.split('?')[0],status:res.statusCode})+'\n'));
  }
  return originalEmit.call(this,event,...args);
};
