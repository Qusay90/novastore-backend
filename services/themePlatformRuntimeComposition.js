'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const v=require('./themePlatformValidation');
const DIST=path.resolve(__dirname,'../studio-core/dist');
const QA=path.resolve(__dirname,'../theme-platform/publication-acceptance.json');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const safe=name=>typeof name==='string'&&/^[a-zA-Z0-9_./-]{1,240}$/u.test(name)&&name.split('/').every(p=>p&&p!=='.'&&p!=='..');
async function readBuildFile(name){
    if(!safe(name))v.fail('THEME_RENDERER_BUILD_INVALID',409);
    const target=path.join(DIST,...name.split('/'));let current=DIST;
    if((await fs.lstat(DIST)).isSymbolicLink())v.fail('THEME_RENDERER_BUILD_INVALID',409);
    for(const part of name.split('/')){current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())v.fail('THEME_RENDERER_BUILD_INVALID',409);}
    const stat=await fs.stat(target);if(!stat.isFile()||stat.size>67108864)v.fail('THEME_RENDERER_BUILD_INVALID',409);
    return fs.readFile(target);
}
async function rendererBundle({presentation,channel}){
    const registry=JSON.parse((await readBuildFile('renderer-bundles.json')).toString('utf8'));
    if(registry.schemaVersion!==1||!Array.isArray(registry.bundles))v.fail('THEME_RENDERER_BUILD_INVALID',409);
    const matched=registry.bundles.filter(row=>row.channel===channel&&v.digest(row.presentation)===v.digest(presentation));
    if(matched.length!==1)v.fail('THEME_RENDERER_BUILD_AUTHORITY_REQUIRED',503);
    const bundle=matched[0];
    if(!Array.isArray(bundle.files)||!bundle.files.length||bundle.files.length>256)v.fail('THEME_RENDERER_BUILD_INVALID',409);
    const files=[];
    for(const item of bundle.files){const bytes=await readBuildFile(item.path);if(sha(bytes)!==item.sha256)v.fail('THEME_RENDERER_SOURCE_CHANGED',409);files.push({...item,bytes});}
    return{...bundle,files};
}
async function responsiveAuthority(identity){
    const stat=await fs.lstat(QA).catch(error=>{if(error.code!=='ENOENT')throw error;});
    if(!stat||!stat.isFile()||stat.isSymbolicLink()||stat.size>1048576)v.fail('THEME_RESPONSIVE_EVIDENCE_REQUIRED',409);
    const registry=JSON.parse(await fs.readFile(QA,'utf8'));
    const matches=registry.schemaVersion===1&&Array.isArray(registry.acceptances)?registry.acceptances.filter(row=>row.artifactDigest===identity.artifactDigest
        &&row.sourceDigest===identity.sourceDigest&&row.channel===identity.channel&&v.digest(row.presentation)===v.digest(identity.presentation)):[];
    if(matches.length!==1)v.fail('THEME_RESPONSIVE_EVIDENCE_REQUIRED',409);
    return matches[0];
}
function createThemeRuntimeComposition({database,environment=process.env}={}){
    // Construction is lazy: catalog/authoring stays usable without publication
    // storage. Missing deployment authority must fail only that operation.
    let services;
    const get=()=>{
        if(services)return services;
        const assetStorage=require('./themePlatformAssetStorage').createThemeAssetStorage({rootDir:environment.NOVASTORE_THEME_ASSET_ROOT});
        const artifactStorage=require('./themePlatformArtifactStorage').createThemeArtifactStorage({rootDir:environment.NOVASTORE_THEME_ARTIFACT_ROOT});
        const publication=require('./themePlatformPublicationService').createThemePublicationService({database,assetStorage,artifactStorage,rendererBundle,responsiveAuthority});
        services={publication,artifactStorage};return services;
    };
    const active=async(client,scope)=>get().publication.readActiveOn(client,{serviceId:scope.service_id,organizationId:scope.organization_id,storeId:scope.store_id,channel:scope.channel});
    const customerRuntimeAuthority=async(client,scope)=>{
        if(environment.NOVASTORE_THEME_CUSTOMER_RUNTIME_ENABLED!=='true')return{enabled:false,contractVersion:2,reason:'THEME_CUSTOMER_RUNTIME_DISABLED'};
        const artifact=await active(client,scope);
        if(artifact.validation.assignmentId!==scope.assignment_id)v.fail('THEME_PUBLICATION_ASSIGNMENT_MISMATCH',409);
        const content=await get().artifactStorage.read({...artifact,filePath:'novastore-document.json'});
        return{enabled:true,contractVersion:2,storeId:Number(scope.legacy_store_id),artifactDigest:artifact.digest,document:JSON.parse(content.bytes.toString('utf8'))};
    };
    const serve=async(req,res)=>{
        if(environment.NOVASTORE_THEME_CUSTOMER_RUNTIME_ENABLED!=='true')return res.status(503).json({code:'THEME_CUSTOMER_RUNTIME_DISABLED'});
        const client=await database.connect();
        try{
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const scope=await require('./themePlatformCommerceService').resolvePublic(client,req),artifact=await active(client,scope);
            if(artifact.validation.assignmentId!==scope.assignment_id)v.fail('THEME_PUBLICATION_ASSIGNMENT_MISMATCH',409);
            const filePath=req.path==='/'?artifact.manifest.entryPoint:req.path.startsWith('/theme-studio/')?req.path.slice('/theme-studio/'.length):null;
            if(!filePath||!safe(filePath))v.fail('THEME_RESOURCE_NOT_FOUND',404);
            const file=await get().artifactStorage.read({...artifact,filePath});
            await client.query('COMMIT');
            res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
            res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
            res.type(file.mimeType).send(file.bytes);
        }catch(error){await client.query('ROLLBACK');res.status(error.statusCode||503).json({code:error.statusCode?error.code:'STOREFRONT_NOT_PUBLISHED'});}
        finally{client.release();}
    };
    return Object.freeze({get,customerRuntimeAuthority,serve});
}
module.exports={createThemeRuntimeComposition,rendererBundle,responsiveAuthority};
