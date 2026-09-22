import {build} from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidenceRoot=path.resolve(root,'../artifacts/r38-r1');
await fs.mkdir(evidenceRoot,{recursive:true});
// Every invocation compiles into a new empty directory, independent of prior output.
const cleanOutput=await fs.mkdtemp(path.join(evidenceRoot,'clean-web-build-'));
await build({configFile:path.join(root,'vite.public-review.config.mjs'),mode:'public-review',build:{outDir:cleanOutput,emptyOutDir:true},plugins:[{
  name:'review-source-evidence',async generateBundle(_options,bundle){
    const modules=Object.values(bundle).filter(chunk=>chunk.type==='chunk').flatMap(chunk=>Object.entries(chunk.modules).map(([id,value])=>({id:path.relative(path.resolve(root,'..'),id).replaceAll('\\','/'),renderedLength:value.renderedLength})));
    await fs.writeFile(path.join(evidenceRoot,'bundle-modules.json'),JSON.stringify(modules,null,2)+'\n');
  },
}]});
const outputArg=process.argv.indexOf('--out-dir');
const output=outputArg===-1?path.resolve(root,'../frontend/public-review'):path.resolve(process.argv[outputArg+1]||'');
if(output!==path.resolve(root,'../frontend/public-review')&&!output.startsWith(evidenceRoot+path.sep))throw new Error('Build destination must remain in this R38 workspace');
const html=await fs.readFile(path.join(cleanOutput,'public-review.html'),'utf8');
for(const pattern of [/\b(?:localhost|127\.0\.0\.1)\b/i,/deneme\.novastore\.tr/i,/createCanonicalFixtureRuntime|main-integrated-fixture|fixture-integrated/i,/@vite\/client|sourceMappingURL/i,/-----BEGIN.*PRIVATE KEY-----/i,/postgres(?:ql)?:\/\//i]) {
  if(pattern.test(html))throw new Error(`Review artifact hygiene failed: ${pattern}`);
}
await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'index.html'),html);
// Proven task-owned duplicate from the intermediate builder, not source.
if(output===path.resolve(root,'../frontend/public-review'))await fs.unlink(path.join(output,'public-review.html')).catch(error=>{if(error.code!=='ENOENT')throw error;});
console.log(JSON.stringify({webSha256:createHash('sha256').update(html).digest('hex'),bytes:Buffer.byteLength(html),cleanBuild:true,output:path.relative(path.resolve(root,'..'),output)}));
