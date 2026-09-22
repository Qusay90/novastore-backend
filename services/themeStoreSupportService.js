'use strict';
const crypto=require('node:crypto');
const f=require('./themePlatformService');
const v=require('./themePlatformValidation');
const {authorize}=require('./themePlatformAuthService');
const {createThemeStorefrontCustomerService}=require('./themeStorefrontCustomerService');
const nonempty=(value,max)=>{const text=v.text(value,max).trim();if(!text)v.fail('THEME_INVALID_TEXT');return text;};
const dto=row=>({id:row.id,subject:row.subject,recipient:row.recipient,status:row.status,revision:Number(row.revision),
    unreadCount:Number(row.unread_count||0),lastMessageAt:row.last_message_at,createdAt:row.created_at});
const messageDto=row=>({id:Number(row.id),body:row.body,senderKind:row.sender_kind,createdAt:row.created_at});

function createThemeStoreSupportService({database,runtimeAuthority}={}) {
    const customerScope=createThemeStorefrontCustomerService({database,runtimeAuthority});
    const policy=async(client,service)=>{
        const row=await f.one(client,'SELECT recipient,revision FROM theme_store_support_policies WHERE service_id=$1',[service.id]);
        return row?{recipient:row.recipient,revision:Number(row.revision)}:{recipient:'SELLER',revision:0};
    };
    const customer=async(client,req)=>{
        const auth=req.auth;
        if(auth?.user?.principal!=='customer'||auth?.session?.principal!=='customer'||Number(auth.user.id)!==Number(auth.session.userId))v.fail('THEME_AUTH_REQUIRED',401);
        const row=await f.one(client,`SELECT s.user_id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2
            AND s.principal_type='customer' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND u.auth_enabled=TRUE AND u.role='customer' FOR SHARE OF s,u`,[auth.session.id,auth.user.id]);
        if(!row)v.fail('THEME_AUTH_REQUIRED',401);
        return {kind:'CUSTOMER',userId:Number(row.user_id)};
    };
    const unread=async(client,thread,actor)=>Number((await f.one(client,`SELECT count(*)::int AS n FROM theme_store_support_messages WHERE thread_id=$1
        AND id>$2 AND (sender_kind='CUSTOMER')=$3`,[thread.id,actor.kind==='CUSTOMER'?thread.customer_read_id:thread.operator_read_id,actor.kind!=='CUSTOMER'])).n);
    const threadDto=async(client,thread,actor)=>dto({...thread,unread_count:await unread(client,thread,actor)});
    const loadThread=async(client,service,actor,threadId)=>{
        const row=await f.one(client,`SELECT * FROM theme_store_support_threads WHERE id=$1 AND service_id=$2 AND organization_id=$3 AND store_id=$4
            AND ${actor.kind==='CUSTOMER'?'customer_id=$5':'recipient=$5'} FOR UPDATE`,[v.uuid(threadId),...f.scope(service),actor.kind==='CUSTOMER'?actor.userId:actor.recipient]);
        if(!row)v.fail('THEME_RESOURCE_NOT_FOUND',404);return row;
    };
    const message=async(client,service,thread,actor,input)=>{
        v.keys(input,['body','clientMessageId'],['body','clientMessageId']);
        const body=nonempty(input.body,5000),key=v.uuid(input.clientMessageId),hash=v.digest({body});
        const existing=await f.one(client,'SELECT * FROM theme_store_support_messages WHERE thread_id=$1 AND sender_kind=$2 AND sender_user_id=$3 AND client_message_id=$4',[thread.id,actor.kind,actor.userId,key]);
        if(existing){if(existing.request_hash!==hash)v.fail('THEME_SUPPORT_IDEMPOTENCY_CONFLICT',409);return{thread:await threadDto(client,thread,actor),message:messageDto(existing),reused:true};}
        if(thread.status!=='OPEN')v.fail('THEME_SUPPORT_THREAD_CLOSED',409);
        const row=await f.one(client,`INSERT INTO theme_store_support_messages(thread_id,service_id,organization_id,store_id,sender_kind,sender_user_id,body,client_message_id,request_hash)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[thread.id,...f.scope(service),actor.kind,actor.userId,body,key,hash]);
        const updated=await f.one(client,'UPDATE theme_store_support_threads SET last_message_at=$2,revision=revision+1 WHERE id=$1 RETURNING *',[thread.id,row.created_at]);
        return{thread:await threadDto(client,updated,actor),message:messageDto(row),reused:false};
    };
    const action=async(client,service,actor,name,params={},input={})=>{
        if(name==='context'){
            const value=await policy(client,service);return{enabled:true,recipient:value.recipient,label:value.recipient==='SELLER'?'Mağaza desteği':'Nova Store desteği',externalNotifications:false};
        }
        if(name==='list'){
            const rows=await f.rows(client,`SELECT * FROM theme_store_support_threads WHERE service_id=$1 AND organization_id=$2 AND store_id=$3
                AND ${actor.kind==='CUSTOMER'?'customer_id=$4':'recipient=$4'} ORDER BY last_message_at DESC,id DESC LIMIT 100`,[...f.scope(service),actor.kind==='CUSTOMER'?actor.userId:actor.recipient]);
            return{threads:await Promise.all(rows.map(row=>threadDto(client,row,actor)))};
        }
        if(name==='create'){
            if(actor.kind!=='CUSTOMER')v.fail('THEME_PERMISSION_DENIED',403);
            v.keys(input,['subject','body','clientMessageId'],['subject','body','clientMessageId']);
            const subject=nonempty(input.subject,160),body=nonempty(input.body,5000),key=v.uuid(input.clientMessageId),hash=v.digest({subject,body});
            const existing=await f.one(client,'SELECT * FROM theme_store_support_threads WHERE service_id=$1 AND customer_id=$2 AND client_request_id=$3',[service.id,actor.userId,key]);
            if(existing){if(existing.request_hash!==hash)v.fail('THEME_SUPPORT_IDEMPOTENCY_CONFLICT',409);return message(client,service,existing,actor,{body,clientMessageId:key});}
            const routing=await policy(client,service);
            const thread=await f.one(client,`INSERT INTO theme_store_support_threads(id,service_id,organization_id,store_id,customer_id,recipient,policy_revision,subject,client_request_id,request_hash)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[crypto.randomUUID(),...f.scope(service),actor.userId,routing.recipient,routing.revision,subject,key,hash]);
            return message(client,service,thread,actor,{body,clientMessageId:key});
        }
        const thread=await loadThread(client,service,actor,params.threadId);
        if(name==='detail'){
            const after=params.after===undefined?0:Number(params.after);v.integer(after,0,Number.MAX_SAFE_INTEGER);
            const rows=await f.rows(client,'SELECT * FROM theme_store_support_messages WHERE thread_id=$1 AND id>$2 ORDER BY id LIMIT 101',[thread.id,after]);
            return{thread:await threadDto(client,thread,actor),messages:rows.slice(0,100).map(messageDto),nextAfter:rows.length>100?Number(rows[99].id):null};
        }
        if(name==='message')return message(client,service,thread,actor,input);
        if(name==='read'){
            v.keys(input,['throughMessageId'],['throughMessageId']);v.integer(input.throughMessageId);
            f.found(await f.one(client,'SELECT id FROM theme_store_support_messages WHERE thread_id=$1 AND id=$2',[thread.id,input.throughMessageId]));
            const field=actor.kind==='CUSTOMER'?'customer_read_id':'operator_read_id';
            const row=await f.one(client,`UPDATE theme_store_support_threads SET ${field}=GREATEST(${field},$2) WHERE id=$1 RETURNING *`,[thread.id,input.throughMessageId]);
            return{thread:await threadDto(client,row,actor)};
        }
        if(name==='state'){
            v.keys(input,['status','expectedRevision'],['status','expectedRevision']);v.choice(input.status,['OPEN','CLOSED']);v.integer(input.expectedRevision);
            if(input.expectedRevision!==Number(thread.revision))v.fail('THEME_SUPPORT_REVISION_CONFLICT',409);
            const row=thread.status===input.status?thread:await f.one(client,'UPDATE theme_store_support_threads SET status=$2,revision=revision+1 WHERE id=$1 RETURNING *',[thread.id,input.status]);
            return{thread:await threadDto(client,row,actor)};
        }
        v.fail('THEME_INVALID_ACTION');
    };
    const customerAction=(req,name,params,input)=>customerScope.transaction(req,async(client,scope)=>{
        const service=f.found(await f.one(client,'SELECT * FROM seller_theme_services WHERE id=$1 FOR UPDATE',[scope.service_id]));
        await f.activeService(client,service);const actor=await customer(client,req);
        return action(client,service,actor,name,params,input);
    });
    const operatorAction=(principal,name,params={},input={})=>f.transaction(database,async client=>{
        const {service}=await f.loadScope(client,'service',{serviceId:params.serviceId},principal);
        const permission=['policy','policyRead'].includes(name)?'support.policy.manage':['list','detail','read'].includes(name)?'support.inbox.read':'support.reply';
        const authorized=await authorize(client,principal,permission,service);await f.activeService(client,service);
        if(name==='policyRead'){
            if(authorized.kind!=='admin'||authorized.role!=='super_admin')v.fail('THEME_PERMISSION_DENIED',403);
            return policy(client,service);
        }
        if(name==='policy'){
            if(authorized.kind!=='admin'||authorized.role!=='super_admin')v.fail('THEME_PERMISSION_DENIED',403);
            v.keys(input,['recipient','expectedRevision','reason'],['recipient','expectedRevision','reason']);v.choice(input.recipient,['SELLER','PLATFORM']);v.integer(input.expectedRevision,0);nonempty(input.reason,500);
            const previous=await policy(client,service);if(previous.revision!==input.expectedRevision)v.fail('THEME_SUPPORT_REVISION_CONFLICT',409);
            const next=await f.one(client,`INSERT INTO theme_store_support_policies(service_id,organization_id,store_id,recipient,approved_by)
                VALUES($1,$2,$3,$4,$5) ON CONFLICT(service_id) DO UPDATE SET recipient=EXCLUDED.recipient,approved_by=EXCLUDED.approved_by,revision=theme_store_support_policies.revision+1,updated_at=clock_timestamp() RETURNING recipient,revision`,[...f.scope(service),input.recipient,authorized.userId]);
            await f.appendAudit(client,{service,actor:authorized,action:'theme.support.routing.changed',target:{type:'theme_service',id:service.id},before:previous,after:next,correlationId:crypto.randomUUID(),reason:input.reason});
            return{recipient:next.recipient,revision:Number(next.revision)};
        }
        const actor={kind:authorized.kind==='admin'?'ADMIN':'SELLER',userId:authorized.userId,recipient:authorized.kind==='admin'?'PLATFORM':'SELLER'};
        return action(client,service,actor,name,params,input);
    });
    return Object.freeze({customerAction,operatorAction});
}
module.exports={createThemeStoreSupportService};
