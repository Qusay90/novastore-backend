// Maintainer-only import. The protected reference is read, never modified.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const destination=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reference=path.resolve(process.argv[2]||'');
if(!process.argv[2]||reference===destination)throw Error('Explicit distinct Studio reference required');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const entries=[],visited=new Set(),extensions=['','.js','.jsx','.ts','.tsx','.mjs','.cjs','.json','.css','.svg','.png','.jpg','.webp'];
function copy(source,relative,group,{skipExisting=false}={}){const target=path.join(destination,relative),bytes=fs.readFileSync(source);if(skipExisting&&fs.existsSync(target))return;fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);entries.push({path:relative.replaceAll('\\','/'),source:path.relative(reference,source).replaceAll('\\','/'),group,bytes:bytes.length,sha256:digest(bytes)});}
function walkDirectory(source,relative,group,filter=()=>true){for(const entry of fs.readdirSync(source,{withFileTypes:true})){const child=path.join(source,entry.name),out=path.join(relative,entry.name);if(!filter(child,out,entry))continue;if(entry.isDirectory())walkDirectory(child,out,group,filter);else if(entry.isFile())copy(child,out,group);}}
function resolve(spec,file){const base=spec.startsWith('/')?path.join(reference,spec):path.resolve(path.dirname(file),spec);for(const ext of extensions){const candidate=base+ext;if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return candidate;}for(const ext of extensions){const candidate=path.join(base,'index'+ext);if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return candidate;}throw Error('Unresolved '+spec+' from '+file);}
function walk(file){if(visited.has(file))return;visited.add(file);if(!/\.(?:[cm]?[jt]sx?|css)$/.test(file))return;const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|\brequire\(\s*)['"]([^'"\n]+)['"]/g)){const spec=match[1].split('?')[0];if(spec.startsWith('.')||spec.startsWith('/'))walk(resolve(spec,file));}if(file.endsWith('.css'))for(const match of source.matchAll(/@import\s*(?:url\()?['"]([^'"]+)['"]/g))if(match[1].startsWith('.'))walk(resolve(match[1],file));}
walk(path.join(reference,'src/main.jsx'));walk(path.join(reference,'src/android-entry.tsx'));
for(const file of [...visited].sort())copy(file,path.relative(reference,file),'source',{skipExisting:true});
walkDirectory(path.join(reference,'public'),'workshop-public','public');
walkDirectory(path.join(reference,'vendor'),'vendor','vendor',(file,out,entry)=>!entry.isDirectory()||!['android','ios','.git','build','node_modules'].includes(entry.name));
const pkg=JSON.parse(fs.readFileSync(path.join(destination,'package.json'))),original=JSON.parse(fs.readFileSync(path.join(reference,'package.json')));pkg.dependencies={...pkg.dependencies,...original.dependencies};pkg.scripts['build:workshop']='vite build --config vite.workshop.config.mjs && node scripts/relocate-workshop-public.mjs';fs.writeFileSync(path.join(destination,'package.json'),JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync(path.join(destination,'workshop-source-provenance.json'),JSON.stringify({version:1,reference,description:'Only missing static entry closure; existing shared core is retained. Public assets are byte-identical. Vendor omits native platform/build trees; browser runtime files retained.',entries},null,2)+'\n');
console.log(JSON.stringify({files:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes,0),groups:Object.fromEntries([...new Set(entries.map(e=>e.group))].map(g=>[g,{files:entries.filter(e=>e.group===g).length,bytes:entries.filter(e=>e.group===g).reduce((n,e)=>n+e.bytes,0)}]))},null,2));
