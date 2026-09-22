'use strict';

const assert=require('node:assert/strict'),crypto=require('node:crypto');
const startDisposable=require('./helpers/themePlatformDisposableDb');
let db; const gates=[];
async function gate(name,work){await work();gates.push({name,status:'PASS'});db.originalConsole.log(`PASS ${name}`);}
(async()=>{
    db=await startDisposable();const pool=db.pool;
    const {createThemeSellerBridge,canonical,digest,loadThemeSellerBridgeResource}=require('../services/themeSellerBridgeService');
    const {authorize}=require('../services/themePlatformAuthService');
    const secret=crypto.randomBytes(48).toString('base64url');db.sensitive.add(secret);
    const userId=Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES('Bridge human','bridge@example.test','unused','customer',TRUE) RETURNING id")).rows[0].id);
    const adminId=Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES('Bridge approver','bridge-admin@example.test','unused','admin',TRUE) RETURNING id")).rows[0].id);
    const org=Number((await pool.query("INSERT INTO seller_organizations(external_key,display_name) VALUES($1,'Bridge org') RETURNING id",[crypto.randomUUID()])).rows[0].id);
    const publicStore=Number((await pool.query("INSERT INTO stores(name,slug) VALUES('Bridge store','bridge-store') RETURNING id")).rows[0].id);
    const store=Number((await pool.query("INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,'Bridge store') RETURNING id",[org,publicStore])).rows[0].id);
    const role=Number((await pool.query("SELECT id FROM seller_roles WHERE code='owner' AND organization_id IS NULL")).rows[0].id);
    const stamp=crypto.randomUUID();
    const member=Number((await pool.query('INSERT INTO seller_memberships(organization_id,user_id,role_id,security_stamp) VALUES($1,$2,$3,$4) RETURNING id',[org,userId,role,stamp])).rows[0].id);
    await pool.query('INSERT INTO seller_membership_store_scopes(membership_id,organization_id,store_id) VALUES($1,$2,$3)',[member,org,store]);
    const cid=crypto.randomUUID(),tid=crypto.randomUUID(),mapping=crypto.randomUUID(),serviceId=crypto.randomUUID();
    await pool.query(`INSERT INTO stocky_connector_connections(id,organization_id,store_id,remote_store_id,endpoint_origin,key_id,secret_ref)
        VALUES($1,$2,$3,'explicit-bridge-fixture','http://127.0.0.1:12345','bridge-test','fixture')`,[cid,org,store]);
    await pool.query(`INSERT INTO theme_seller_bridge_mappings(id,connection_id,tenant_id,stocky_user_id,organization_id,store_id,membership_id,user_id,approved_by_user_id,approval_reason)
        VALUES($1,$2,$3,9001,$4,$5,$6,$7,$8,'Explicit disposable owner-approved human fixture')`,[mapping,cid,tid,org,store,member,userId,adminId]);
    await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro')",[serviceId,org,store]);
    const service=(await pool.query('SELECT * FROM seller_theme_services WHERE id=$1',[serviceId])).rows[0];
    let stockyLive=true;
    const inspect=async()=>{if(!stockyLive){const e=new Error('THEME_BRIDGE_SESSION_REVOKED');e.code=e.message;e.statusCode=401;throw e;}};
    const bridge=createThemeSellerBridge({database:pool,runtime:{enabled:true,localOnly:true,secretsByRef:{fixture:secret}},inspect});
    const envelope=()=>{
        const request={method:'GET',path:'/assignments'},issuedAt=Math.floor(Date.now()/1000);
        const assertion={version:1,audience:'novastore-theme-seller',purpose:'theme-action',connectionId:cid,keyId:'bridge-test',tenantId:tid,humanUserId:9001,
            sessionHash:'a'.repeat(64),issuedAt,expiresAt:issuedAt+15,nonce:crypto.randomBytes(16).toString('hex'),requestHash:digest(canonical(request))};
        return {assertion,signature:crypto.createHmac('sha256',secret).update(`theme-seller-assertion-v1\n${canonical(assertion)}`).digest('hex'),request};
    };
    const transaction=async work=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
    let principal;
    await gate('real migration and explicit mapping create one scoped bridge session without normal Seller session',async()=>{
        principal=await bridge.authenticate(envelope());
        assert.equal(Number((await pool.query('SELECT count(*) FROM theme_seller_bridge_sessions')).rows[0].count),1);
        assert.equal(Number((await pool.query('SELECT count(*) FROM seller_sessions WHERE user_id=$1',[userId])).rows[0].count),0);
        const actor=await transaction(c=>authorize(c,principal,'draft.read',service));assert.deepEqual(actor.storeIds,[store]);
    });
    await gate('concurrent same assertion has exactly one winner and durable replay denial',async()=>{
        const input=envelope(),results=await Promise.allSettled([bridge.authenticate(input),bridge.authenticate(input)]);
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
        assert.equal(results.find(r=>r.status==='rejected').reason.code,'THEME_BRIDGE_ASSERTION_REPLAY');
    });
    await gate('resource helper cannot read another store before the ownership predicate',async()=>{
        assert.equal((await transaction(c=>loadThemeSellerBridgeResource(c,principal,'seller_theme_services',serviceId))).id,serviceId);
        assert.equal(await transaction(c=>loadThemeSellerBridgeResource(c,principal,'seller_theme_services',crypto.randomUUID())),undefined);
    });
    await gate('membership revision change invalidates existing bridge session, even on fresh exchange',async()=>{
        await pool.query('UPDATE seller_memberships SET membership_revision=membership_revision+1 WHERE id=$1',[member]);
        await assert.rejects(transaction(c=>authorize(c,principal,'draft.read',service)),{code:'THEME_AUTH_REQUIRED'});
        await assert.rejects(bridge.authenticate(envelope()),{code:'THEME_BRIDGE_SESSION_REVOKED'});
    });
    await gate('mapping identity is immutable and cannot be reassigned by update',async()=>{
        await assert.rejects(pool.query('UPDATE theme_seller_bridge_mappings SET stocky_user_id=9002 WHERE id=$1',[mapping]),{code:'55000'});
        assert.equal(Number((await pool.query('SELECT stocky_user_id FROM theme_seller_bridge_mappings WHERE id=$1',[mapping])).rows[0].stocky_user_id),9001);
    });
    await gate('mapping revoke is durable and prevents new assertions or resource access',async()=>{
        await pool.query('UPDATE theme_seller_bridge_mappings SET active=FALSE,revoked_at=clock_timestamp(),revision=revision+1 WHERE id=$1',[mapping]);
        await assert.rejects(bridge.authenticate(envelope()),{code:'THEME_BRIDGE_MAPPING_REQUIRED'});
        await assert.rejects(transaction(c=>loadThemeSellerBridgeResource(c,principal,'seller_theme_services',serviceId)),{code:'THEME_BRIDGE_SESSION_REVOKED'});
    });
    db.originalConsole.log(JSON.stringify({suite:'themeSellerBridgePostgresSmoke',result:'PASS',pass:gates.length,fail:0,skip:0,gates,
        scope:'Real disposable PostgreSQL, original Theme authorization, concurrency and immutable mapping. Stocky live introspection is an explicit test double; no browser, human-login or production acceptance.'}));
})().catch(error=>{(db?.originalConsole.error||console.error)(db?db.redact(error.stack):error.message);process.exitCode=1;})
    .finally(async()=>{if(db)try{console.log(JSON.stringify({cleanup:await db.cleanup()}));}catch(e){console.error(e.message);process.exitCode=1;}});
