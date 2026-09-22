'use strict';
// Actual signed callback proof after human browser actions; never logs or injects
// browser credentials. Reads only the exact owned Stocky fixture's lease hashes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const connector=require('../services/stockySystemConnectorService');
const [directory,portText,out]=process.argv.slice(2);
assert(path.isAbsolute(directory)&&path.isAbsolute(out));
const full=path.resolve(directory),port=Number(portText);
assert.equal(path.dirname(full),path.resolve(os.tmpdir()));assert(path.basename(full).startsWith('novastore-r22-s09-'));
assert(Number.isInteger(port)&&port>1024&&port<65536);
const state=JSON.parse(fs.readFileSync(path.join(full,'state.json'),'utf8'));
assert.equal(state.purpose,'r22-authenticated-tenant-sales-acceptance');assert(/^[a-f0-9]{16}$/.test(state.token));
assert.equal(state.resources.app,`novastore-r22-s09-${state.token}-web`);
const source=state.tenants[0];assert.equal(source.tenant_host,'127.0.0.1');
const connection={id:source.connection_key,key_id:source.key_id,secret_ref:'fixture',endpoint_origin:`http://127.0.0.1:${port}`};
const runtime={enabled:true,localOnly:true,secretsByRef:{fixture:source.secret}};
(async()=>{
    const read=cp.spawnSync('docker',['exec','-e','APP_ENV=testing',state.resources.app,'php','/srv/app/tests/theme-seller/sessionEvidence.php'],{encoding:'utf8',windowsHide:true,timeout:30000});
    assert.equal(read.status,0,'Owned read-only lease inspection failed');
    const data=JSON.parse(read.stdout.trim());assert(Array.isArray(data.leases)&&data.leases.length>0,'No actual browser-created lease exists');
    const results=[];
    for(const [index,lease] of data.leases.entries()){
        assert(/^[a-f0-9]{64}$/.test(lease.hash));
        const endpoint='/api/integrations/novastore/v1/theme-seller-session/introspect';
        const body=connector.stableStringify({tenantId:source.tenant_id,humanUserId:1,sessionHash:lease.hash});
        const signed=connector.signStockyThemeSellerRequest({connection,runtime,method:'POST',path:endpoint,body});
        const response=await connector.createSafeStockyThemeSellerTransport()({url:connection.endpoint_origin+endpoint,method:'POST',headers:signed.headers,body,runtime});
        connector.verifyStockyResponse({...response,path:endpoint,connection,runtime,expectedNonce:signed.nonce,expectedTimestamp:signed.timestamp});
        const value=JSON.parse(response.rawBody);
        assert.equal(response.statusCode,200);assert.equal(value.sessionHash,lease.hash);assert.equal(value.tenantId,source.tenant_id);assert.equal(value.humanUserId,1);assert.equal(typeof value.active,'boolean');
        results.push({leaseOrdinal:index+1,durableRevoked:lease.revoked,signedResponse:true,status:response.statusCode,active:value.active});
    }
    const report={time:new Date().toISOString(),source:'actual Stocky tenant session store and signed callback, no callback mock',leases:results,rawSessionIdExported:false,browserCredentialsInjected:false};
    fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(error=>{console.error(JSON.stringify({result:'FAIL',code:error.code||error.name}));process.exitCode=1;});
