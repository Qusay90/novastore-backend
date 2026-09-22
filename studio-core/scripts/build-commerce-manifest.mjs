import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const core=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(core,'dist');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=name=>{if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Invalid build path');let target=dist;for(const part of name.split('/')){target=path.join(target,part);if(fs.lstatSync(target).isSymbolicLink())throw Error('Symlink in build');}return fs.readFileSync(target);};
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'.vite/manifest.json'))),registry=JSON.parse(fs.readFileSync(path.join(core,'../theme-platform/presentations.json')));
const common=new Set(['customer.html']);
function visit(key){const entry=manifest[key];if(!entry)throw Error('Missing customer build entry: '+key);if(common.has(entry.file))return;common.add(entry.file);for(const file of [...(entry.css||[]),...(entry.assets||[])])common.add(file);for(const dependency of [...(entry.imports||[]),...(entry.dynamicImports||[])])visit(dependency);}
visit('customer.html');
const mime=name=>({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[path.extname(name)]||'application/octet-stream';
const sourceFiles=fs.readdirSync(path.join(core,'src/studio-integration')).filter(name=>name.startsWith('commerce-')||name==='commerce.css').sort().map(name=>({path:'studio-core/src/studio-integration/'+name,sha256:sha(fs.readFileSync(path.join(core,'src/studio-integration',name)))}));
for(const name of ['theme-platform/presentation-capabilities.json','studio-core/scripts/theme-kit-plugin.mjs','studio-core/scripts/build-commerce-manifest.mjs','studio-core/vite.studio.config.mjs'])sourceFiles.push({path:name,sha256:sha(fs.readFileSync(path.join(core,'..',name)))});
const bundles=['nova-classic','nova-atelier'].map(id=>{
 const record=registry.presentations.find(row=>row.id===id&&row.version==='1.0.0');if(!record)throw Error('Unknown presentation');
 const presentation={id:record.id,version:record.version,digest:record.digest};
 const names=new Set([...common,'theme-kit/core.css','theme-kit/fonts.css','theme-kit/customer-projector.js',...['inter_regular.ttf','inter_medium.ttf','inter_semibold.ttf'].map(name=>'theme-kit/fonts/'+name),...(id==='nova-classic'?['theme-kit/theme.css','theme-kit/classic-presentation.json','theme-kit/classic-customer.js']:['theme-kit/nova-atelier/theme.css','theme-kit/nova-atelier/presentation.json','theme-kit/nova-atelier/customer.js'])]);
 const files=[...names].sort().map(name=>({path:name,sha256:sha(read(name)),mimeType:mime(name)}));
 return {presentation,channel:'web',sourceDigest:sha(JSON.stringify({presentation,originalSource:record.sourceFiles,behaviorSources:sourceFiles,files})),entryPoint:'customer.html',
  commerceCapabilities:{customerAuth:true,persistentCart:true,favorites:true,variantSelection:true,stockCheck:true,checkoutPreparation:true,orderHistory:true,reviews:true,questions:true,supportRouting:true,singleStore:true},
  requiredAssetKeys:[],files,sourceFiles,acceptance:{customerRuntime:'PENDING_ACTUAL_BROWSER_ACCEPTANCE',supportRouting:'BACKEND_PASS_BROWSER_PENDING',productionReady:false}};
});
fs.writeFileSync(path.join(dist,'renderer-bundles.json'),JSON.stringify({schemaVersion:1,bundles},null,2)+'\n');
console.log(JSON.stringify({bundles:bundles.map(row=>({presentation:row.presentation,sourceDigest:row.sourceDigest,fileCount:row.files.length,entryPoint:row.entryPoint})),manifestSHA256:sha(fs.readFileSync(path.join(dist,'renderer-bundles.json')))}));
