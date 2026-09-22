import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {relocateWorkshopPaths} from '../src/workshop/paths.mjs';
const core=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=path.join(core,'workshop-public'),output=path.join(core,'dist-workshop'),changes=[];
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile()&&/\.(?:html|css|js|json)$/.test(entry.name)){const before=fs.readFileSync(file,'utf8');let after;if(file.includes(`${path.sep}sources${path.sep}`)&&file.endsWith('.json'))after=JSON.stringify(relocateWorkshopPaths(JSON.parse(before)));else after=relocateWorkshopPaths(before);if(before!==after){const relative=path.relative(source,file),target=path.join(output,relative);fs.writeFileSync(target,after);changes.push({path:relative.replaceAll('\\','/'),sourceSha256:digest(before),outputSha256:digest(after)});}}}}
walk(source);fs.writeFileSync(path.join(output,'static-relocation.json'),JSON.stringify({version:1,description:'Only known original static roots relocated under /studio-pro. Copied source payloads remain unchanged.',changes},null,2)+'\n');console.log(`Relocated ${changes.length} original static text files under /studio-pro/.`);
