import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {listSharedModuleClosure,updateSourceFingerprint} from '../admin-commerce-pro/scripts/source-fingerprint.mjs';

const repositoryRoot=fileURLToPath(new URL('../',import.meta.url));
const entry='studio-core/src/studio-integration/platform-bridge.js';
test('real Admin closure includes nested validation, preview, models and visual assets',async()=>{
  const files=await listSharedModuleClosure(repositoryRoot,[entry]);
  for(const name of ['studio-core/src/studio-integration/native-document-validation.js','studio-core/src/studio-integration/preview-navigation.js','studio-core/src/sandbox/documentModel.js','studio-core/src/sandbox/campaignShapeRenderer.js','studio-core/src/sandbox/visual/visual-assets.js'])assert.ok(files.includes(name),name);
  assert.deepEqual(files,[...new Set(files)].sort());
});

async function fixture(run) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'novastore-fingerprint-'));
  const write=async(name,source)=>{const target=path.join(directory,'studio-core',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,source);};
  try {await run(directory,write);} finally {
    const target=path.resolve(directory),parent=path.resolve(os.tmpdir());
    assert.equal(path.dirname(target).toLowerCase(),parent.toLowerCase());assert.match(path.basename(target),/^novastore-fingerprint-[a-zA-Z0-9_-]+$/);
    await fs.rm(target,{recursive:true,force:false});
  }
}

test('parser follows multiline imports, reexports and literal dynamic imports; ignores comments and strings',()=>fixture(async(root,write)=>{
  await write('entry.js',`import {\n a\n} from './a.js';export {b} from './b.js';import('./c.js');import('node:fs');\n// import './missing.js';\nconst example="import './also-missing.js'";`);
  await write('a.js',`export const a=1;export * from './entry.js';`);await write('b.js','export const b=2;');await write('c.js','export default 3;');
  assert.deepEqual(await listSharedModuleClosure(root,['studio-core/entry.js']),['studio-core/a.js','studio-core/b.js','studio-core/c.js','studio-core/entry.js']);
}));
test('missing transitive source aborts fingerprint instead of silently accepting a partial graph',()=>fixture(async(root,write)=>{
  await write('entry.js',`import './missing.js';`);await assert.rejects(listSharedModuleClosure(root,['studio-core/entry.js']),{code:'ENOENT'});
}));
test('relative module escape and computed import are rejected before accepting source identity',()=>fixture(async(root,write)=>{
  await write('entry.js',`import '../outside.js';`);await assert.rejects(listSharedModuleClosure(root,['studio-core/entry.js']),/kapsam dışına/);
  await write('entry.js',`const file='./module.js';import(file);`);await assert.rejects(listSharedModuleClosure(root,['studio-core/entry.js']),/mühürlenemedi/);
}));
test('a deep dependency byte change changes identity even when direct bridge source is unchanged',()=>fixture(async(root,write)=>{
  await write('entry.js',`import './inner/deep.js';`);await write('inner/deep.js','export const value=1;');
  const hash=async()=>{const digest=crypto.createHash('sha256');for(const file of await listSharedModuleClosure(root,['studio-core/entry.js']))updateSourceFingerprint(digest,file,await fs.readFile(path.join(root,file)));return digest.digest('hex');};
  const before=await hash();await write('inner/deep.js','export const value=2;');assert.notEqual(await hash(),before);
}));
