// One-time, deterministic extraction of the original gallery's embedded data.
// Its original markup, CSS, editor code and 54 HTML templates are retained.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createPortableGallerySource} from '../src/workshop/gallery-portable.mjs';
const core=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reference=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Explicit gallery reference required');
const destination=path.join(core,'workshop-public/theme-library'),entries=[];
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function write(relative,bytes,extra={}){fs.mkdirSync(path.dirname(path.join(destination,relative)),{recursive:true});fs.writeFileSync(path.join(destination,relative),bytes);entries.push({path:relative,bytes:Buffer.byteLength(bytes),sha256:digest(bytes),...extra});}
function copy(directory){for(const entry of fs.readdirSync(path.join(reference,directory),{withFileTypes:true})){const relative=path.posix.join(directory,entry.name);if(entry.isDirectory())copy(relative);else if(entry.isFile())write(relative,fs.readFileSync(path.join(reference,relative)),{kind:'original-runtime'});}}
for(const dir of ['assets','previews','shared','themes'])copy(dir);
for(const file of ['theme-library.json','themes.json','admin-gallery.html'])write(file,fs.readFileSync(path.join(reference,file)),{kind:'original-runtime'});
const original=fs.readFileSync(path.join(reference,'index.html'),'utf8');let html=original;
const tag='<script id="demo-sources" type="application/json">',start=html.indexOf(tag)+tag.length,end=html.indexOf('</script>',start);
if(start<tag.length||end<start)throw Error('Original source registry missing');
const sources=JSON.parse(html.slice(start,end)),sourceFiles={};
if(Object.keys(sources).length!==54)throw Error('Expected original 27 themes / 54 web-app sources');
for(const [id,source] of Object.entries(sources)){if(!/^[a-z0-9-]+$/.test(id)||typeof source!=='string')throw Error('Unexpected source');const file=`sources/${id}.json`;write(file,JSON.stringify(source),{kind:'original-template-json',decodedBytes:Buffer.byteLength(source),decodedSha256:digest(source)});sourceFiles[id]=file;}
html=html.slice(0,start)+JSON.stringify(sourceFiles)+html.slice(end);
const marker="(()=>{'use strict';const assets=",assetsStart=html.indexOf(marker)+marker.length,assetsEnd=html.indexOf(';const sourceFor=',assetsStart);
if(assetsStart<marker.length||assetsEnd<assetsStart)throw Error('Original asset registry missing');
const originalAssets=JSON.parse(html.slice(assetsStart,assetsEnd)),assets={},mimeTypes={};
for(const [id,value] of Object.entries(originalAssets)){const match=/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);if(!/^__NS_ASSET_[a-f0-9]{24}__$/.test(id)||!match)throw Error('Unexpected bundled gallery asset '+id);const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg'}[match[1]],file=`embedded-assets/${id.slice(11,-2)}.${extension}`;write(file,Buffer.from(match[2],'base64'),{kind:'decoded-original-asset',originalDataUriSha256:digest(value),mimeType:match[1]});assets[id]='/studio-pro/theme-library/'+file;mimeTypes[id]=match[1];}
html=html.slice(0,assetsStart)+JSON.stringify(assets)+html.slice(assetsEnd);
html=html.replace(marker,"(async()=>{'use strict';const assets=");
const originalLoad="const sources=JSON.parse(document.getElementById('demo-sources').textContent),themes=";
const newLoad="const sourceFiles=JSON.parse(document.getElementById('demo-sources').textContent),sources=Object.fromEntries(await Promise.all(Object.entries(sourceFiles).map(async([id,file])=>{const response=await fetch(file,{credentials:'omit',redirect:'error'});if(!response.ok)throw Error('Yerel tema kaynağı yüklenemedi');const source=await response.json();if(typeof source!=='string')throw Error('Yerel tema kaynağı geçersiz');return [id,source];}))),themes=";
if(!html.includes(originalLoad))throw Error('Original gallery loader changed');html=html.replace(originalLoad,newLoad);
const portable=`sourceFor.portable=(${createPortableGallerySource.toString()})({sources,assets,mimeTypes:${JSON.stringify(mimeTypes)},fetchImpl:fetch.bind(globalThis),encodeBase64:bytes=>{let result='';for(let start=0;start<bytes.length;start+=32768)result+=String.fromCharCode(...bytes.subarray(start,start+32768));return btoa(result);}});`;
html=html.replace('function download(view){const blob=new Blob([sourceFor(selected+\'-\'+view)]',portable+'async function download(view){const blob=new Blob([await sourceFor.portable(selected+\'-\'+view)]');
html=html.replace("editor.querySelector('#kit-export').onclick=()=>{try{","editor.querySelector('#kit-export').onclick=async()=>{try{");
html=html.replace("const html=sourceFor(current.theme+'-'+channel).replace", "const html=(await sourceFor.portable(current.theme+'-'+channel)).replace");
write('index.html',html,{kind:'original-gallery-with-extracted-local-data',originalSha256:digest(original),originalBytes:Buffer.byteLength(original)});
const report={version:1,reference,scope:'27 original themes / 54 original web-app source templates; CSS, markup and editor retained; data URI image bytes extracted losslessly. No generated standalone duplicate copies.',sourceTemplates:54,embeddedAssets:Object.keys(assets).length,entries};
fs.writeFileSync(path.join(core,'workshop-gallery-provenance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({templates:54,embeddedAssets:Object.keys(assets).length,indexBytes:Buffer.byteLength(html),files:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes,0),maxBytes:Math.max(...entries.map(e=>e.bytes))},null,2));
