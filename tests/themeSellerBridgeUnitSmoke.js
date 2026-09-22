'use strict';

const test=require('node:test'), assert=require('node:assert/strict'), crypto=require('node:crypto');
const {createThemeSellerBridge,isThemeSellerBridgePrincipal,validateAssertion,canonical,digest,liveIntrospection}=require('../services/themeSellerBridgeService');
const {matchThemeSellerRequest}=require('../routes/themeSellerBridgeRoutes');
const {authorize,principalFromSeller}=require('../services/themePlatformAuthService');
const cid='11111111-1111-4111-8111-111111111111',tid='22222222-2222-4222-8222-222222222222',mid='33333333-3333-4333-8333-333333333333';
const stamp='44444444-4444-4444-8444-444444444444',sid='55555555-5555-4555-8555-555555555555';
const secret='synthetic-test-only-secret-never-production-0123456789';
const runtime={enabled:true,localOnly:true,allowedOrigins:['http://127.0.0.1:12345'],secretsByRef:{fixture:secret}};
const service={id:cid,organization_id:20,store_id:30,status:'ACTIVE'};
function envelope(change={},request={method:'GET',path:'/assignments'}) {
    const issuedAt=Math.floor(Date.now()/1000);
    const assertion={version:1,audience:'novastore-theme-seller',purpose:'theme-action',connectionId:cid,keyId:'fixture',tenantId:tid,humanUserId:90,
        sessionHash:'a'.repeat(64),issuedAt,expiresAt:issuedAt+15,nonce:crypto.randomBytes(16).toString('hex'),requestHash:digest(canonical(request)),...change};
    return {assertion,signature:crypto.createHmac('sha256',secret).update(`theme-seller-assertion-v1\n${canonical(assertion)}`).digest('hex'),request};
}
function fixture() {
    let session=null, live=true;
    const nonces=new Set(), calls=[];
    const connection={id:cid,key_id:'fixture',secret_ref:'fixture',organization_id:20,store_id:30,endpoint_origin:'http://127.0.0.1:12345'};
    const mapping={id:mid,connection_id:cid,tenant_id:tid,stocky_user_id:90,user_id:12,organization_id:20,membership_id:21,store_id:30,active:true,revision:1};
    const member={id:21,organization_id:20,user_id:12,role_id:22,status:'active',effective:true,membership_revision:3,security_stamp:stamp};
    const records={
        'seller-organization':[{id:20,status:'active'}], 'seller-membership':[member],
        'seller-existing-role':[{id:22,organization_id:null,code:'owner',role_kind:'system',is_active:true}],
        'seller-user':[{id:12,auth_enabled:true}], 'seller-theme-role':[], 'seller-store-scopes':[{store_id:30},{store_id:31}]
    };
    const client={release(){},async query(sql,args=[]){
        calls.push(sql);
        if(/^(?:BEGIN|COMMIT|ROLLBACK)/u.test(sql))return{rows:[]};
        const tag=sql.match(/theme-bridge:([a-z-]+)/u)?.[1];
        if(tag==='connection')return{rows:[connection]};
        if(tag==='mapping')return{rows:mapping.active&&args[1]===mapping.tenant_id&&args[2]===mapping.stocky_user_id?[mapping]:[]};
        if(tag==='nonce'){if(nonces.has(args[1]))return{rows:[]};nonces.add(args[1]);return{rows:[{nonce:args[1]}]};}
        if(tag==='member')return{rows:member.status==='active'?[member]:[]};
        if(tag==='open'){if(session)return{rows:[]};session={id:sid,mapping_revision:1,membership_revision:3,security_stamp:stamp,revoked_at:null,unexpired:true};return{rows:[{id:sid}]};}
        if(tag==='session')return{rows:[session]};
        if(tag==='renew')return{rows:[]};
        if(tag==='live-scope')return{rows:mapping.active&&session.revoked_at===null?[{...mapping,membership_revision:session.membership_revision,security_stamp:session.security_stamp}]:[]};
        if(sql.includes('INSERT INTO theme_seller_bridge_audit'))return{rows:[]};
        const auth=sql.match(/theme-auth:([a-z-]+)/u)?.[1];
        if(auth&&Object.hasOwn(records,auth))return{rows:records[auth]};
        throw new Error(`Unexpected fixture query ${sql.slice(0,70)}`);
    }};
    const database={connect:async()=>client};
    const inspect=async()=>{if(!live){const e=new Error('THEME_BRIDGE_SESSION_REVOKED');e.code=e.message;e.statusCode=401;throw e;}};
    return {bridge:createThemeSellerBridge({database,runtime,inspect}),client,mapping,member,records,calls,stop:()=>{live=false;},revoke:()=>{session.revoked_at=new Date();}};
}

test('action signatures canonically bind the request and preserve empty object vs array',()=>{
    assert.notEqual(canonical({body:{}}),canonical({body:[]}));
    const env=envelope();assert.equal(validateAssertion(env.assertion,env.request),env.assertion);
    assert.throws(()=>validateAssertion(env.assertion,{method:'POST',path:'/assignments'}),{code:'THEME_BRIDGE_AUTH_REQUIRED'});
});
for(const change of [{audience:'seller'},{purpose:'rep'},{tenantId:'bad'},{humanUserId:'90'},{role:'seller_owner'},
    {expiresAt:Math.floor(Date.now()/1000)-1},{issuedAt:Math.floor(Date.now()/1000)+100},{expiresAt:Math.floor(Date.now()/1000)+300}]) {
    test(`assertion rejects unsupported identity/timing ${Object.keys(change)[0]}`,()=>{
        const env=envelope(change);assert.throws(()=>validateAssertion(env.assertion,env.request),{code:'THEME_BRIDGE_AUTH_REQUIRED'});
    });
}
test('finite dispatch only exposes Seller Theme routes; arbitrary URLs and Admin cannot be proxied',()=>{
    assert.ok(matchThemeSellerRequest({method:'GET',path:'/assignments'}));
    assert.ok(matchThemeSellerRequest({method:'PUT',path:`/drafts/${cid}`,body:{},idempotencyKey:'fixture-1'}));
    for(const request of [{method:'GET',path:'/themes'},{method:'GET',path:'/api/seller/v1/me'},
        {method:'GET',path:'https://elsewhere.invalid'}, {method:'GET',path:'/assignments?role=admin'},
        {method:'DELETE',path:`/drafts/${cid}`}, {method:'GET',path:'/assignments',body:{}},
        {method:'GET',path:`/services/${cid}/versions/${cid}/assets/..%2Fsecret`}]) assert.equal(matchThemeSellerRequest(request),null);
});
test('finite Seller support reads, cursor, reply and state retain the scoped bridge domain',()=>{
    const base=`/services/${cid}/support/threads`;
    for(const [method,path,action]of [['GET',base,'list'],['GET',`${base}/${mid}`,'detail'],['GET',`${base}/${mid}/after/123`,'detail'],
        ['POST',`${base}/${mid}/messages`,'message'],['POST',`${base}/${mid}/read`,'read'],['PATCH',`${base}/${mid}/state`,'state']]){
        const matched=matchThemeSellerRequest({method,path});assert.equal(matched.engine,'support');assert.equal(matched.action,action);assert.equal(matched.params.serviceId,cid);
    }
    for(const [method,path]of [['POST',base],['PUT',`/services/${cid}/support/policy`],['PATCH',`/drafts/${cid}`],
        ['GET',`${base}/${mid}?after=1`],['GET',`${base}/${mid}/after/-1`],['GET',`${base}/${mid}/after/1e9`],['GET',`${base}/${mid}/after/01`]])assert.equal(matchThemeSellerRequest({method,path}),null);
});
test('non-asset action has 1MiB cap before authentication; larger asset envelope still requires identity',async()=>{
    const express=require('express'),app=express();let connected=0;
    app.use(express.json({limit:'7mb',verify:(req,_res,bytes)=>{req.themeBridgeBodyBytes=bytes.length;}}));app.use(require('../routes/themeSellerBridgeRoutes').createThemeSellerBridgeRouter({database:{connect:async()=>{connected++;throw Error('Unexpected authentication');}},runtime,enabled:true}));
    const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    try{const send=body=>fetch(`http://127.0.0.1:${server.address().port}/dispatch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
        const over={...envelope({}, {method:'PUT',path:`/drafts/${cid}`,body:{reason:'x'.repeat(1100000)}})};
        assert.equal((await send(over)).status,413);assert.equal(connected,0);
        const padded=await fetch(`http://127.0.0.1:${server.address().port}/dispatch`,{method:'POST',headers:{'content-type':'application/json'},body:' '.repeat(1100000)+JSON.stringify(envelope())});
        assert.equal(padded.status,413);assert.equal(connected,0);
        const asset={request:{method:'POST',path:`/services/${cid}/stored-assets`,body:{bytesBase64:'A'.repeat(1100000)}}};
        assert.equal((await send(asset)).status,401);assert.equal(connected,0);
    }finally{await new Promise(resolve=>server.close(resolve));}
});
test('a signed mapped human produces an explicit branded Theme principal, never a normal Seller token',async()=>{
    const f=fixture(),principal=await f.bridge.authenticate(envelope());
    assert.equal(isThemeSellerBridgePrincipal(principal),true);assert.equal(isThemeSellerBridgePrincipal({...principal}),false);
    assert.equal(principal.authentication,'stocky-theme-bridge');assert.equal(principal.sessionId,undefined);
    assert.throws(()=>principalFromSeller({sellerPrincipal:principal}),{code:'THEME_AUTH_REQUIRED'});
    await assert.rejects(authorize(f.client,{...principal},'assignment.read'),{code:'THEME_AUTH_REQUIRED'});
});
test('replayed successful assertions are rejected, not reused as a bearer credential',async()=>{
    const f=fixture(),env=envelope();await f.bridge.authenticate(env);
    await assert.rejects(f.bridge.authenticate(env),{code:'THEME_BRIDGE_ASSERTION_REPLAY'});
});
test('signature tampering, unknown mapping and foreign tenant all fail closed',async()=>{
    let f=fixture(),env=envelope();env.signature='0'.repeat(64);await assert.rejects(f.bridge.authenticate(env),{code:'THEME_BRIDGE_AUTH_REQUIRED'});
    f=fixture();await assert.rejects(f.bridge.authenticate(envelope({humanUserId:91})),{code:'THEME_BRIDGE_MAPPING_REQUIRED'});
    await assert.rejects(f.bridge.authenticate(envelope({tenantId:cid})),{code:'THEME_BRIDGE_MAPPING_REQUIRED'});
});
test('fresh live callback and durable bridge revocation are enforced again during authorization',async()=>{
    const f=fixture(),principal=await f.bridge.authenticate(envelope());f.stop();
    await assert.rejects(authorize(f.client,principal,'assignment.read'),{code:'THEME_BRIDGE_SESSION_REVOKED'});
    const g=fixture(),second=await g.bridge.authenticate(envelope());g.revoke();
    await assert.rejects(authorize(g.client,second,'assignment.read'),{code:'THEME_BRIDGE_SESSION_REVOKED'});
});
test('bridge preserves live role policy, narrows to the explicit store and never grants publication implicitly',async()=>{
    const f=fixture(),principal=await f.bridge.authenticate(envelope());
    let actor=await authorize(f.client,principal,'draft.read',service);assert.deepEqual(actor.storeIds,[30]);
    await assert.rejects(authorize(f.client,principal,'draft.read',{...service,store_id:31}),{code:'THEME_RESOURCE_NOT_FOUND'});
    f.records['seller-theme-role']=[{role:'seller_viewer',publish_allowed:true,active:true,revision:2}];
    await assert.rejects(authorize(f.client,principal,'draft.edit',service),{code:'THEME_PERMISSION_DENIED'});
    await assert.rejects(authorize(f.client,principal,'publication.request',service),{code:'THEME_PERMISSION_DENIED'});
    f.member.membership_revision=4;await assert.rejects(authorize(f.client,principal,'draft.read',service),{code:'THEME_AUTH_REQUIRED'});
});
test('live PC1 user disable or membership revoke denies even with active Stocky session',async()=>{
    const f=fixture(),principal=await f.bridge.authenticate(envelope());f.member.status='revoked';
    await assert.rejects(authorize(f.client,principal,'assignment.read'),{code:'THEME_PERMISSION_DENIED'});
    f.member.status='active';f.records['seller-user'][0].auth_enabled=false;
    await assert.rejects(authorize(f.client,principal,'assignment.read'),{code:'THEME_AUTH_REQUIRED'});
});
