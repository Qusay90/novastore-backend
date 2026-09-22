'use strict';

const crypto = require('node:crypto');
const v = require('./themePlatformValidation');
const f = require('./themePlatformService');
const {authorize} = require('./themePlatformAuthService');
const presentations = require('./themePlatformPresentationService');
const {createThemePublicationValidator} = require('./themePlatformPublicationValidation');
const codeOf = error => /^[A-Z0-9_]{1,120}$/u.test(error.code || '') ? error.code : 'THEME_PUBLICATION_FAILED';
const requireKnownPresentation = (presentation,channel) => {
    const current=presentations.presentationReadiness(presentation,channel);
    // PARTIAL describes today's authoring build. Explicit removal/blocking is
    // a security revocation and still stops every previously sealed build.
    if(!['READY','PARTIAL'].includes(current.status))v.fail('THEME_PRESENTATION_REVOKED',409);
    return current;
};

function createThemePublicationService({database,artifactStorage,assetStorage,rendererBundle,legalAuthority,
    responsiveAuthority,assignmentAuthority=presentations.requireAssignablePresentation}={}) {
    const validator = createThemePublicationValidator({assetStorage,rendererBundle,legalAuthority});
    const load = async (client,id) => {
        const seed=f.found(await f.one(client,'SELECT service_id FROM theme_publications WHERE id=$1',[v.uuid(id)]));
        const service=f.found(await f.one(client,'SELECT * FROM seller_theme_services WHERE id=$1 FOR UPDATE',[seed.service_id]));
        const publication=f.found(await f.one(client,'SELECT * FROM theme_publications WHERE id=$1 AND service_id=$2 FOR UPDATE',[id,service.id]));
        return {service,publication};
    };
    const stage = async (client,publication,state,evidence={},reason=null) => {
        await client.query('UPDATE theme_publications SET status=$2,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',[publication.id,state]);
        await client.query('INSERT INTO theme_publication_stage_events(publication_id,state,evidence,reason) VALUES($1,$2,$3,$4)',[publication.id,state,evidence,reason]);
        await client.query(`UPDATE theme_operations o SET status=$2,failure_reason=$3,
            result=o.result||jsonb_build_object('id',$1::text,'state',$4::text,'environment','LOCAL'),updated_at=clock_timestamp()
            FROM theme_publications p WHERE p.id=$1::uuid AND o.id=p.operation_id`,[publication.id,
            ['ACTIVE','SUPERSEDED'].includes(state)?'COMPLETED':['BLOCKED','FAILED'].includes(state)?'BLOCKED':'REQUESTED',reason,state]);
    };
    const requireStorage = () => {
        if (!artifactStorage || ['build','verify','read'].some(key=>typeof artifactStorage[key]!=='function')) v.fail('THEME_ARTIFACT_STORAGE_REQUIRED',503);
    };
    const lease = async (client,id,token) => {
        const loaded=await load(client,id);
        const valid=await f.one(client,'SELECT worker_token=$2 AND worker_expires_at>clock_timestamp() AS valid FROM theme_publications WHERE id=$1',[id,token]);
        if (!valid?.valid) v.fail('THEME_PUBLICATION_WORKER_STALE',409);
        return loaded;
    };
    const advance = (id,token,state,evidence={}) => f.transaction(database,async client=>{
        const {publication}=await lease(client,id,token);
        await stage(client,publication,state,evidence);
        await client.query("UPDATE theme_publications SET worker_expires_at=clock_timestamp()+INTERVAL '5 minutes' WHERE id=$1",[id]);
    });
    // Internal worker entry: immutable request already exists after the normal
    // authorized command transaction. There is no public 'worker ready' input.
    const build = async publicationId => {
        requireStorage();
        const token=crypto.randomUUID();
        const claim=await f.transaction(database,async client=>{
            const {service,publication}=await load(client,publicationId);
            await f.activeService(client,service);
            const existing=await f.one(client,'SELECT * FROM theme_publication_artifacts WHERE publication_id=$1',[publicationId]);
            if (existing) return {existing};
            if (['ACTIVE','SUPERSEDED'].includes(publication.status)) v.fail('THEME_PUBLICATION_STATE_CONFLICT',409);
            const busy=await f.one(client,'SELECT worker_token IS NOT NULL AND worker_expires_at>clock_timestamp() AS busy FROM theme_publications WHERE id=$1',[publicationId]);
            if (busy.busy) v.fail('THEME_PUBLICATION_WORKER_BUSY',409);
            await client.query("UPDATE theme_publications SET worker_token=$2,worker_expires_at=clock_timestamp()+INTERVAL '5 minutes' WHERE id=$1",[publicationId,token]);
            await stage(client,publication,'VALIDATING');return {};
        });
        if (claim.existing) {await artifactStorage.verify(claim.existing);return {...claim.existing,reused:true,active:false};}
        try {
            const prepared=await f.transaction(database,async client=>{
                const loaded=await lease(client,publicationId,token);
                return validator.validate(client,loaded);
            });
            const validationDigest=v.digest(prepared.validation);
            await advance(publicationId,token,'READY',{validationDigest});
            await advance(publicationId,token,'PUBLICATION_REQUESTED',{validationDigest});
            await advance(publicationId,token,'BUILDING',{environment:'LOCAL',sourceDigest:prepared.validation.sourceDigest});
            const stored=await artifactStorage.build({metadata:prepared.validation,files:prepared.files,entryPoint:prepared.entryPoint});
            await advance(publicationId,token,'DEPLOYING',{environment:'LOCAL',artifactDigest:stored.digest,localCopyCreated:true});
            await artifactStorage.verify(stored);
            return await f.transaction(database,async client=>{
                const loaded=await lease(client,publicationId,token);
                const current=await validator.validate(client,loaded);
                if (v.digest(current.validation)!==validationDigest) v.fail('THEME_PUBLICATION_AUTHORITY_CHANGED',409);
                const row=await f.one(client,`INSERT INTO theme_publication_artifacts(id,service_id,organization_id,store_id,publication_id,channel,digest,source_digest,storage_key,manifest,validation)
                    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[crypto.randomUUID(),...f.scope(loaded.service),publicationId,
                    prepared.assignment.channel,stored.digest,prepared.validation.sourceDigest,stored.storageKey,stored.manifest,prepared.validation]);
                await client.query('UPDATE theme_publications SET worker_token=NULL,worker_expires_at=NULL WHERE id=$1',[publicationId]);
                return {...row,reused:false,active:false,activationPending:true};
            });
        } catch (error) {
            await f.transaction(database,async client=>{
                const {publication}=await load(client,publicationId);
                if (publication.worker_token!==token) return;
                await stage(client,publication,error instanceof v.ThemePlatformError?'BLOCKED':'FAILED',{},codeOf(error));
                await client.query('UPDATE theme_publications SET worker_token=NULL,worker_expires_at=NULL WHERE id=$1',[publicationId]);
            });
            throw error;
        }
    };
    const validateBytes = async (client,loaded,artifact,{readOnly=false,deployed=false}={}) => {
        requireStorage();await artifactStorage.verify(artifact);
        if(v.digest(artifact.manifest.metadata)!==v.digest(artifact.validation))v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE',409);
        const current=await validator.validate(client,loaded,{readOnly,deployedArtifact:deployed?artifact:null});
        if (v.digest(current.validation)!==v.digest(artifact.validation) || artifact.manifest.metadata.sourceDigest!==artifact.source_digest) v.fail('THEME_PUBLICATION_AUTHORITY_CHANGED',409);
        requireKnownPresentation(current.validation.presentation,artifact.channel);
        return current;
    };
    const verifyReady = async (client,loaded,artifact,{readOnly=false,deployed=false}={}) => {
        const current=await validateBytes(client,loaded,artifact,{readOnly,deployed});
        // Compatibility acceptance and the individual deployment pointer are
        // distinct authorities. Candidate builds cannot grant themselves READY.
        const identity={artifactDigest:artifact.digest,sourceDigest:artifact.source_digest,
            presentation:current.validation.presentation,channel:artifact.channel};
        let compatibility;
        if(deployed){
            const recorded=await f.one(client,`SELECT evidence FROM theme_publication_activations
                WHERE artifact_id=$1 AND service_id=$2 AND organization_id=$3 AND store_id=$4 AND channel=$5
                AND environment='LOCAL' AND operation='ACTIVATE' ORDER BY generation DESC LIMIT 1`,
                [artifact.artifact_id||artifact.id,...f.scope(loaded.service),artifact.channel]);
            compatibility=recorded?.evidence?.compatibility;
            if(recorded?.evidence?.validationDigest!==v.digest(current.validation)
                ||compatibility?.assignmentEligible!==true||v.digest(compatibility.identity)!==v.digest(identity))
                v.fail('THEME_VERIFIED_ACTIVATION_REQUIRED',409);
        }else{
            const ready=await assignmentAuthority(current.validation.presentation,artifact.channel);
            if (ready?.assignmentEligible!==true) v.fail('THEME_PRESENTATION_NOT_READY',409);
            compatibility={assignmentEligible:true,identity};
        }
        if (typeof responsiveAuthority!=='function') v.fail('THEME_RESPONSIVE_EVIDENCE_REQUIRED',409);
        const evidence=await responsiveAuthority(identity);
        const widths=artifact.channel==='app'?[320,360,390,430]:[320,360,390,430,768,1024,1440];
        if (!evidence || evidence.status!=='PASS' || evidence.artifactDigest!==artifact.digest || evidence.sourceDigest!==artifact.source_digest
            || typeof evidence.evidenceId!=='string' || !evidence.evidenceId.length || !Array.isArray(evidence.widths)
            || widths.some(width=>!evidence.widths.includes(width)) || evidence.marketplaceUiAbsent!==true
            || evidence.pages?.home!=='PASS' || evidence.pages?.category!=='PASS' || evidence.pages?.product!=='PASS') v.fail('THEME_RESPONSIVE_EVIDENCE_REQUIRED',409);
        return {validationDigest:v.digest(current.validation),compatibility,responsive:evidence,environment:'LOCAL'};
    };
    const changePointer = async (client,loaded,artifact,expectedGeneration,operation,actor) => {
        const {service,publication}=loaded;
        const pointer=await f.one(client,"SELECT * FROM theme_active_artifacts WHERE service_id=$1 AND channel=$2 AND environment='LOCAL' FOR UPDATE",[service.id,artifact.channel]);
        if (Number(pointer?.generation||0)!==expectedGeneration) v.fail('THEME_ACTIVE_POINTER_CONFLICT',409);
        const evidence=await verifyReady(client,loaded,artifact,{deployed:operation==='ROLLBACK'});
        if (pointer?.artifact_id===artifact.id) return {...pointer,reused:true,environment:'LOCAL'};
        if (operation==='ROLLBACK') {
            if (!pointer || pointer.previous_artifact_id!==artifact.id) v.fail('THEME_VERIFIED_PREVIOUS_ARTIFACT_REQUIRED',409);
            f.found(await f.one(client,"SELECT id FROM theme_publication_activations WHERE artifact_id=$1 AND service_id=$2 AND environment='LOCAL'",[artifact.id,service.id]));
        }
        const generation=expectedGeneration+1;
        const next=pointer?await f.one(client,`UPDATE theme_active_artifacts SET artifact_id=$3,previous_artifact_id=artifact_id,generation=generation+1,updated_at=clock_timestamp()
            WHERE service_id=$1 AND channel=$2 AND generation=$4 RETURNING *`,[service.id,artifact.channel,artifact.id,expectedGeneration])
            :await f.one(client,`INSERT INTO theme_active_artifacts(service_id,organization_id,store_id,channel,artifact_id,generation)
                VALUES($1,$2,$3,$4,$5,1) RETURNING *`,[...f.scope(service),artifact.channel,artifact.id]);
        if (!next) v.fail('THEME_ACTIVE_POINTER_CONFLICT',409);
        await client.query(`INSERT INTO theme_publication_activations(id,service_id,organization_id,store_id,channel,environment,artifact_id,previous_artifact_id,generation,operation,evidence)
            VALUES($1,$2,$3,$4,$5,'LOCAL',$6,$7,$8,$9,$10)`,[crypto.randomUUID(),...f.scope(service),artifact.channel,artifact.id,pointer?.artifact_id||null,generation,operation,evidence]);
        if (pointer) {
            const previous=f.found(await f.one(client,'SELECT publication_id FROM theme_publication_artifacts WHERE id=$1',[pointer.artifact_id]));
            if (previous.publication_id!==publication.id) await stage(client,{id:previous.publication_id},'SUPERSEDED',{replacedBy:artifact.id,operation});
        }
        await stage(client,publication,'ACTIVE',{artifactDigest:artifact.digest,environment:'LOCAL',generation,operation});
        await f.appendAudit(client,{service,actor,action:operation==='ROLLBACK'?'theme.local.rollback':'theme.local.activated',
            target:{type:'theme_publication',id:publication.id},before:pointer,after:{id:publication.id,status:'ACTIVE',revision:generation,digest:artifact.digest},
            correlationId:crypto.randomUUID(),reason:'Verified LOCAL artifact pointer; no production or commerce mutation'});
        return {...next,reused:false,environment:'LOCAL',commerceChanged:false};
    };
    const activate = (principal,{publicationId,expectedGeneration}) => f.transaction(database,async client=>{
        if(principal?.kind!=='admin')v.fail('THEME_DIRECT_PUBLICATION_FORBIDDEN',403);
        v.integer(expectedGeneration,0,Number.MAX_SAFE_INTEGER);
        const scoped=await f.loadScope(client,'publication',{publicationId},principal);
        const actor=await authorize(client,principal,'publication.request',scoped.service);
        const artifact=f.found(await f.one(client,'SELECT * FROM theme_publication_artifacts WHERE publication_id=$1',[publicationId]));
        return changePointer(client,{service:scoped.service,publication:scoped.resource},artifact,expectedGeneration,'ACTIVATE',actor);
    });
    const rollback = (principal,{publicationId,expectedGeneration}) => f.transaction(database,async client=>{
        if(principal?.kind!=='admin')v.fail('THEME_DIRECT_PUBLICATION_FORBIDDEN',403);
        v.integer(expectedGeneration,0,Number.MAX_SAFE_INTEGER);
        const scoped=await f.loadScope(client,'publication',{publicationId},principal);
        const actor=await authorize(client,principal,'rollback.request',scoped.service);
        const artifact=f.found(await f.one(client,'SELECT * FROM theme_publication_artifacts WHERE publication_id=$1',[publicationId]));
        return changePointer(client,{service:scoped.service,publication:scoped.resource},artifact,expectedGeneration,'ROLLBACK',actor);
    });
    // Reuse the caller's snapshot. Public read transactions must not obtain row
    // locks, open nested connections or acquire the worker's service lock.
    const readActiveOn = async (client,{serviceId,organizationId,storeId,channel,environment='LOCAL'}) => {
        if(environment!=='LOCAL')v.fail('THEME_PUBLICATION_ENVIRONMENT_UNSUPPORTED',409);
        v.uuid(serviceId);v.choice(channel,['web','app']);
        const pointer=f.found(await f.one(client,`SELECT p.*,a.manifest,a.digest,a.source_digest,a.validation,a.storage_key,a.publication_id
            FROM theme_active_artifacts p JOIN theme_publication_artifacts a ON a.id=p.artifact_id
            WHERE p.service_id=$1 AND p.organization_id=$2 AND p.store_id=$3 AND p.channel=$4 AND p.environment='LOCAL'`,[serviceId,organizationId,storeId,channel]));
        const service=f.found(await f.one(client,'SELECT * FROM seller_theme_services WHERE id=$1 AND organization_id=$2 AND store_id=$3',[serviceId,organizationId,storeId]));
        const publication=f.found(await f.one(client,'SELECT * FROM theme_publications WHERE id=$1 AND service_id=$2',[pointer.publication_id,serviceId]));
        await verifyReady(client,{service,publication},pointer,{readOnly:true,deployed:true});
        return pointer;
    };
    const readActive = scope => f.transaction(database,async client=>{
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        return readActiveOn(client,scope);
    });
    // Internal pre-publication QA reader only. The caller supplies a trusted
    // exact review identity; no public HTTP route or browser override exists.
    // Unlike ACTIVE serving this does not claim completed artifact QA or move
    // any pointer. Today's policy/build and all live scope/content gates apply.
    const readBuiltCandidateOn = async (client,{publicationId,serviceId,organizationId,storeId,assignmentId,channel,artifactDigest,environment='LOCAL'}) => {
        if(environment!=='LOCAL')v.fail('THEME_PUBLICATION_ENVIRONMENT_UNSUPPORTED',409);
        v.uuid(publicationId);v.uuid(serviceId);v.uuid(assignmentId);v.choice(channel,['web','app']);
        if(typeof artifactDigest!=='string'||!/^[0-9a-f]{64}$/u.test(artifactDigest))v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE',409);
        const service=f.found(await f.one(client,'SELECT * FROM seller_theme_services WHERE id=$1 AND organization_id=$2 AND store_id=$3',[serviceId,organizationId,storeId]));
        const publication=f.found(await f.one(client,'SELECT * FROM theme_publications WHERE id=$1 AND service_id=$2 AND organization_id=$3 AND store_id=$4',[publicationId,...f.scope(service)]));
        if(publication.status!=='DEPLOYING')v.fail('THEME_CANDIDATE_STATE_CONFLICT',409);
        const artifact=f.found(await f.one(client,`SELECT * FROM theme_publication_artifacts
            WHERE publication_id=$1 AND service_id=$2 AND organization_id=$3 AND store_id=$4 AND channel=$5 AND digest=$6`,
            [publicationId,...f.scope(service),channel,artifactDigest]));
        const current=await validateBytes(client,{service,publication},artifact,{readOnly:true});
        if(current.assignment.id!==assignmentId||current.assignment.status!=='ACCEPTED')v.fail('THEME_CANDIDATE_ASSIGNMENT_REQUIRED',409);
        return {...artifact,candidate:true,active:false,acceptance:'CANDIDATE_RUNTIME_NOT_PUBLICATION'};
    };
    return Object.freeze({build,activate,rollback,readActive,readActiveOn,readBuiltCandidateOn});
}
module.exports={createThemePublicationService};
