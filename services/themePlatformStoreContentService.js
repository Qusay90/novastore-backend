'use strict';

// This is a technical content/version authority, not a source of legal advice
// or generated policy text. It never reads private customer/account addresses.
const crypto=require('node:crypto');
const v=require('./themePlatformValidation');
const f=require('./themePlatformService');
const {authorize}=require('./themePlatformAuthService');
const TYPES=Object.freeze(['privacy','terms','distance-sales','returns','shipping','kvkk','cookie','contact','business-information']);
const PROFILE_FIELDS=Object.freeze(['displayName','legalBusinessName','logoAssetId','email','phone','address','city','region','country',
    'socialLinks','supportEmail','supportPhone','shippingSummary','returnSummary']);
const hash=value=>crypto.createHash('sha256').update(value,'utf8').digest('hex');
const locale=value=>{if(typeof value!=='string'||!/^[a-z]{2}-[A-Z]{2}$/u.test(value))v.fail('THEME_LOCALE_INVALID');return value;};
const profileFields=input=>{
    v.keys(input,PROFILE_FIELDS);
    const result=Object.fromEntries(PROFILE_FIELDS.map(key=>[key,null]));
    for(const [key,value] of Object.entries(input)) {
        if(value===null)continue;
        if(key==='logoAssetId'){result[key]=v.uuid(value);continue;}
        if(key==='socialLinks') {
            v.keys(value,['instagram','facebook','youtube','tiktok','x','linkedin']);
            result[key]={};
            for(const [network,target] of Object.entries(value)) {
                v.text(target,600);let url;try{url=new URL(target);}catch{v.fail('THEME_CONTACT_URL_INVALID');}
                if(url.protocol!=='https:'||url.username||url.password||url.hash)v.fail('THEME_CONTACT_URL_INVALID');
                result[key][network]=url.href;
            }
            continue;
        }
        v.text(value,['address','shippingSummary','returnSummary'].includes(key)?2000:200);
        if(key.toLowerCase().endsWith('email')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value))v.fail('THEME_CONTACT_EMAIL_INVALID');
        if(key.toLowerCase().endsWith('phone')&&!/^\+?[0-9() .-]{5,40}$/u.test(value))v.fail('THEME_CONTACT_PHONE_INVALID');
        result[key]=value;
    }
    return result;
};
const iso=value=>value instanceof Date?value.toISOString():value;
const legalReference=row=>({documentId:row.id,type:row.document_type,locale:row.locale,version:Number(row.version),contentHash:row.content_hash,
    approvedAt:iso(row.approved_at),effectiveAt:iso(row.effective_at),expiresAt:row.expires_at?iso(row.expires_at):null});

async function readPublicStoreContent(client,scope,{locale:language='tr-TR'}={}) {
    locale(language);
    const organizationId=Number(scope.organization_id),storeId=Number(scope.store_id);
    v.integer(organizationId,1,Number.MAX_SAFE_INTEGER);v.integer(storeId,1,Number.MAX_SAFE_INTEGER);
    const profile=await f.one(client,'SELECT * FROM theme_store_profiles WHERE organization_id=$1 AND store_id=$2',[organizationId,storeId]);
    // Revoking/expiring the effective replacement must not silently resurrect
    // an older policy. Future approvals do not supersede today's policy yet.
    const legal=await f.rows(client,`SELECT * FROM (SELECT DISTINCT ON(document_type) * FROM theme_store_legal_documents
        WHERE organization_id=$1 AND store_id=$2 AND locale=$3 AND approved_at<=clock_timestamp()
        AND effective_at<=clock_timestamp() ORDER BY document_type,version DESC) current_version
        WHERE status='APPROVED' AND (expires_at IS NULL OR expires_at>clock_timestamp())`,[organizationId,storeId,language]);
    for(const row of legal)if(hash(row.content)!==row.content_hash)v.fail('THEME_LEGAL_CONTENT_INTEGRITY',503);
    const publicProfile=profile?profileFields(profile.profile):Object.fromEntries(PROFILE_FIELDS.map(key=>[key,null]));
    if(publicProfile.logoAssetId) {
        const asset=await f.one(client,`SELECT a.id FROM theme_assets a JOIN seller_theme_services s ON s.id=a.service_id
            WHERE a.id=$1 AND a.organization_id=$2 AND a.store_id=$3 AND a.status='READY' AND s.status='ACTIVE'`,
        [publicProfile.logoAssetId,organizationId,storeId]);
        if(!asset)publicProfile.logoAssetId=null;
    }
    return {storeIdentity:{organizationId,storeId,revision:Number(profile?.revision||0),...publicProfile},
        legalReferences:legal.map(legalReference),documents:legal.map(row=>({...legalReference(row),format:'plain-text',content:row.content})),
        missingLegalTypes:TYPES.filter(type=>!legal.some(row=>row.document_type===type))};
}

async function publicationLegalAuthority(client,{service,assignment,document,locale:language='tr-TR'}) {
    if(assignment?.service_id&&assignment.service_id!==service.id)v.fail('THEME_LEGAL_SCOPE_INVALID',403);
    const value=await readPublicStoreContent(client,service,{locale:language});
    if(value.missingLegalTypes.length)v.fail('THEME_LEGAL_REQUIRED',409);
    const identity=value.storeIdentity;
    // These are publication completeness requirements, not invented business data.
    if(!identity.displayName||!identity.legalBusinessName||!identity.address||!identity.city||!identity.country||(!identity.email&&!identity.phone)) {
        v.fail('THEME_STORE_CONTACT_REQUIRED',409);
    }
    return {storeIdentity:identity,legalReferences:value.legalReferences};
}

function createStoreContentService(database) {
    const execute=(principal,action,params,body,meta)=>f.transaction(database,async client=>{
        const {service}=await f.loadScope(client,'service',params,principal);
        const actor=await authorize(client,principal,'service.manage',service);await f.activeService(client,service);
        if(!['saveContact','createLegal','approveLegal','revokeLegal'].includes(action))v.fail('THEME_UNKNOWN_ACTION',404);
        const allowed={saveContact:['expectedRevision','profile','reason'],createLegal:['locale','type','content','reason'],
            approveLegal:['expectedRevision','effectiveAt','expiresAt','reason'],revokeLegal:['expectedRevision','reason']}[action];
        v.keys(body,allowed,allowed);v.text(body.reason,240);
        if(!/^[A-Za-z0-9._:-]{8,128}$/u.test(meta?.idempotencyKey||''))v.fail('THEME_IDEMPOTENCY_KEY_REQUIRED');
        const requestHash=v.digest({action,params,body});
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`theme-content:${service.id}:${actor.actorId}:${meta.idempotencyKey}`]);
        const previous=await f.one(client,'SELECT * FROM theme_operations WHERE scope_key=$1 AND actor_id=$2 AND idempotency_key=$3',
        [service.id,actor.actorId,meta.idempotencyKey]);
        if(previous){if(previous.request_hash!==requestHash)v.fail('THEME_IDEMPOTENCY_PAYLOAD_CONFLICT',409);return{operationId:previous.id,result:previous.result};}
        const operationId=crypto.randomUUID(),correlationId=crypto.randomUUID();
        await client.query(`INSERT INTO theme_operations(id,service_id,organization_id,store_id,scope_key,actor_id,type,status,idempotency_key,request_hash,correlation_id)
            VALUES($1,$2::uuid,$3,$4,$2::text,$5,$6,'REQUESTED',$7,$8,$9)`,[operationId,...f.scope(service),actor.actorId,action,meta.idempotencyKey,requestHash,correlationId]);
        let result,targetId;
        if(action==='saveContact') {
            v.integer(body.expectedRevision,0);const profile=profileFields(body.profile);
            const current=await f.one(client,'SELECT * FROM theme_store_profiles WHERE organization_id=$1 AND store_id=$2 FOR UPDATE',[service.organization_id,service.store_id]);
            if(Number(current?.revision||0)!==body.expectedRevision)v.fail('THEME_REVISION_CONFLICT',409);
            if(profile.logoAssetId&&!await f.one(client,"SELECT id FROM theme_assets WHERE id=$1 AND service_id=$2 AND status='READY'",[profile.logoAssetId,service.id]))v.fail('THEME_ASSET_UNAVAILABLE',404);
            result=await f.one(client,`INSERT INTO theme_store_profiles(organization_id,store_id,profile) VALUES($1,$2,$3)
                ON CONFLICT(store_id) DO UPDATE SET profile=EXCLUDED.profile,revision=theme_store_profiles.revision+1,updated_at=clock_timestamp() RETURNING *`,
            [service.organization_id,service.store_id,profile]);targetId=String(service.store_id);
        } else if(action==='createLegal') {
            locale(body.locale);v.choice(body.type,TYPES);v.text(body.content,262144);
            if(Buffer.byteLength(body.content,'utf8')>262144)v.fail('THEME_LEGAL_CONTENT_TOO_LARGE');
            const next=await f.one(client,'SELECT COALESCE(MAX(version),0)+1 AS version FROM theme_store_legal_documents WHERE organization_id=$1 AND store_id=$2 AND locale=$3 AND document_type=$4',
            [service.organization_id,service.store_id,body.locale,body.type]);
            targetId=crypto.randomUUID();result=await f.one(client,`INSERT INTO theme_store_legal_documents(id,organization_id,store_id,locale,document_type,version,content,content_hash)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[targetId,service.organization_id,service.store_id,body.locale,body.type,next.version,body.content,hash(body.content)]);
        } else {
            targetId=v.uuid(params.documentId);v.integer(body.expectedRevision);
            const current=f.found(await f.one(client,'SELECT * FROM theme_store_legal_documents WHERE id=$1 AND organization_id=$2 AND store_id=$3 FOR UPDATE',[targetId,service.organization_id,service.store_id]));
            f.checkRevision(current,body.expectedRevision);
            if(hash(current.content)!==current.content_hash)v.fail('THEME_LEGAL_CONTENT_INTEGRITY',503);
            if(action==='approveLegal') {
                if(current.status!=='DRAFT')v.fail('THEME_LEGAL_STATE_CONFLICT',409);
                v.date(body.effectiveAt);v.date(body.expiresAt,true);
                if(body.expiresAt&&Date.parse(body.expiresAt)<=Date.parse(body.effectiveAt))v.fail('THEME_LEGAL_EFFECTIVE_RANGE');
                result=await f.one(client,`UPDATE theme_store_legal_documents SET status='APPROVED',approved_at=clock_timestamp(),effective_at=$2,expires_at=$3,revision=revision+1 WHERE id=$1 RETURNING *`,[targetId,body.effectiveAt,body.expiresAt]);
            } else {
                if(current.status==='REVOKED')v.fail('THEME_LEGAL_STATE_CONFLICT',409);
                result=await f.one(client,"UPDATE theme_store_legal_documents SET status='REVOKED',revoked_at=clock_timestamp(),revision=revision+1 WHERE id=$1 RETURNING *",[targetId]);
            }
        }
        await f.appendAudit(client,{service,actor,action:`theme.store.${action}`,target:{type:'store_content',id:targetId},before:null,
            after:{revision:result.revision,status:result.status,version:result.version,digest:result.content_hash},correlationId,reason:body.reason});
        await f.addOutbox(client,service,operationId,`theme.store.${action}`,{id:targetId,revision:result.revision,status:result.status,digest:result.content_hash});
        await client.query("UPDATE theme_operations SET status='COMPLETED',result=$2,updated_at=clock_timestamp() WHERE id=$1",[operationId,result]);
        return{operationId,result};
    });
    const read=(principal,params)=>f.transaction(database,async client=>{
        const {service}=await f.loadScope(client,'service',params,principal);await authorize(client,principal,'draft.read',service);await f.activeService(client,service);
        return {public:await readPublicStoreContent(client,service),history:await f.rows(client,'SELECT * FROM theme_store_legal_documents WHERE organization_id=$1 AND store_id=$2 ORDER BY locale,document_type,version DESC',
        [service.organization_id,service.store_id])};
    });
    return Object.freeze({execute,read});
}

module.exports=Object.freeze({TYPES,PROFILE_FIELDS,profileFields,createStoreContentService,readPublicStoreContent,publicationLegalAuthority});
