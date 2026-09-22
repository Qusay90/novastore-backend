'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createThemeArtifactStorage}=require('../services/themePlatformArtifactStorage');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fixture=async run=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'novastore-artifact-test-'));
    try {await run(createThemeArtifactStorage({rootDir:root}),root);}
    finally {assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('novastore-artifact-test-'));await fs.rm(root,{recursive:true,force:true});}
};
const input=()=>({metadata:{serviceId:crypto.randomUUID(),environment:'LOCAL'},entryPoint:'index.html',files:[
    {path:'index.html',bytes:Buffer.from('<!doctype html><title>Explicit renderer test double</title>'),mimeType:'text/html'},
    {path:'runtime.js',bytes:Buffer.from('/* trusted fixture, not production renderer */'),mimeType:'application/javascript'}]});
test('artifact storage requires explicit private absolute directory',()=>{
    for(const rootDir of [undefined,'relative',path.parse(process.cwd()).root,path.join(os.tmpdir(),'public','artifacts')])
        assert.throws(()=>createThemeArtifactStorage({rootDir}));
});
test('real immutable bytes build, verify, read and exact replay',()=>fixture(async(storage)=>{
    const source=input(),built=await storage.build(source),again=await storage.build(source);
    assert.equal(built.digest,again.digest);assert.equal(again.reused,true);assert.equal(built.manifest.environment,'LOCAL');
    assert.deepEqual((await storage.read(built)).bytes,source.files[0].bytes);
    await assert.rejects(storage.read({...built,filePath:'missing.js'}),error=>error.statusCode===404);
}));
test('source bytes changed under claimed SHA fail before ready artifact',()=>fixture(async(storage,root)=>{
    const source=input();source.files[0].sha256='0'.repeat(64);
    await assert.rejects(storage.build(source),error=>error.code==='THEME_RENDERER_SOURCE_CHANGED');
    assert.deepEqual(await fs.readdir(root),[]);
}));
test('content corruption is rejected on each read and verify',()=>fixture(async(storage,root)=>{
    const built=await storage.build(input());
    await fs.appendFile(path.join(root,built.storageKey,'index.html'),'tampered');
    await assert.rejects(storage.verify(built),error=>error.code==='THEME_ARTIFACT_INTEGRITY_FAILURE');
    await assert.rejects(storage.read(built),error=>error.code==='THEME_ARTIFACT_INTEGRITY_FAILURE');
}));
test('manifest corruption cannot serve otherwise intact entry point',()=>fixture(async(storage,root)=>{
    const built=await storage.build(input());await fs.appendFile(path.join(root,built.storageKey,'manifest.json'),' ');
    await assert.rejects(storage.read(built),error=>error.code==='THEME_ARTIFACT_INTEGRITY_FAILURE');
}));
test('all artifact paths reject traversal, URLs and Windows devices',()=>fixture(async(storage)=>{
    for(const name of ['../outside.html','/absolute.html','a/../../b','https://invalid.test/a','a\\b','con.txt','x//y']) {
        const source=input();source.files[0].path=name;source.entryPoint=name;
        await assert.rejects(storage.build(source));
    }
}));
test('duplicate files, missing entry and storage size limit fail closed',()=>fixture(async(storage,root)=>{
    const source=input();source.files.push(source.files[0]);await assert.rejects(storage.build(source));
    await assert.rejects(storage.build({...input(),entryPoint:'not-there.html'}));
    await assert.rejects(createThemeArtifactStorage({rootDir:root,maxBytes:5}).build(input()));
}));
test('symlink or junction ancestor cannot redirect writes',()=>fixture(async(_storage,root)=>{
    const target=path.join(root,'target'),link=path.join(root,'link');await fs.mkdir(target);await fs.symlink(target,link,process.platform==='win32'?'junction':'dir');
    await assert.rejects(createThemeArtifactStorage({rootDir:path.join(link,'artifact')}).build(input()),error=>error.code==='THEME_ARTIFACT_PATH_REJECTED');
    assert.deepEqual(await fs.readdir(target),[]);
}));
test('different scope metadata produces a different immutable artifact',()=>fixture(async(storage)=>{
    const source=input(),a=await storage.build(source),b=await storage.build({...source,metadata:{...source.metadata,serviceId:crypto.randomUUID()}});
    assert.notEqual(a.digest,b.digest);assert.equal(sha((await storage.read(a)).bytes),sha((await storage.read(b)).bytes));
}));
