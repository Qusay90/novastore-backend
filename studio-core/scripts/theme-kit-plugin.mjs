import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {classicRuntimeSource} from '../src/studio-integration/theme-kit-runtime-source.mjs';
import {atelierRuntimeSource} from '../src/studio-integration/atelier-runtime-source.mjs';
import {customerRuntimeSource,customerProjectorSource} from '../src/studio-integration/commerce-runtime-source.mjs';
const core=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function trustedThemeKit(){return {name:'trusted-classic-presentation',generateBundle(){
 const registry=JSON.parse(fs.readFileSync(path.join(core,'../theme-platform/presentations.json'))),entry=registry.presentations.find(p=>p.id==='nova-classic'&&p.version==='1.0.0');if(!entry)throw Error('Classic registry missing');
 const base=path.join(core,'workshop-public/theme-library'),sources=new Map();
 for(const file of entry.sourceFiles){const bytes=fs.readFileSync(path.join(base,file.path));if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Trusted presentation source drift: '+file.path);sources.set(file.path,bytes.toString('utf8'));}
 for(const [from,to]of [['shared/core.css','core.css'],['themes/15-nova-classic/theme.css','theme.css'],['shared/theme-host-bridge.js','bridge.js'],['shared/support-contract.js','support.js']])this.emitFile({type:'asset',fileName:'theme-kit/'+to,source:sources.get(from)});
 const copied=JSON.parse(fs.readFileSync(path.join(core,'workshop-source-provenance.json'))),fonts=[];
 for(const [name,weight]of [['inter_regular.ttf',400],['inter_medium.ttf',500],['inter_semibold.ttf',600]]){const relative='workshop-public/calibration-assets/official/fonts/'+name,record=copied.entries.find(file=>file.path===relative),bytes=fs.readFileSync(path.join(core,relative));if(!record||crypto.createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw Error('Copied font provenance changed: '+name);this.emitFile({type:'asset',fileName:'theme-kit/fonts/'+name,source:bytes});fonts.push(`@font-face{font-family:Inter;font-style:normal;font-weight:${weight};font-display:swap;src:url('./fonts/${name}') format('truetype')}`);}
 this.emitFile({type:'asset',fileName:'theme-kit/fonts.css',source:fonts.join('\n')});
 this.emitFile({type:'asset',fileName:'theme-kit/classic-runtime.js',source:classicRuntimeSource(sources.get('shared/core.js'))});
 this.emitFile({type:'asset',fileName:'theme-kit/classic-customer.js',source:customerRuntimeSource(sources.get('shared/core.js'),'nova-classic')});
 this.emitFile({type:'asset',fileName:'theme-kit/customer-projector.js',source:customerProjectorSource(sources.get('shared/theme-host-bridge.js'))});
 const text=sources.get('themes/15-nova-classic/theme.js'),start=text.indexOf('{'),end=text.lastIndexOf('}'),theme=JSON.parse(text.slice(start,end+1));
 const presentation={};for(const key of ['id','name','style','sector','tag','desc','color','accent','bg','surface','ink','muted','hero','sub','eyebrow','cta','featuredCount'])if(Object.hasOwn(theme,key))presentation[key]=theme[key];
 this.emitFile({type:'asset',fileName:'theme-kit/classic-presentation.json',source:JSON.stringify(presentation)});
 this.emitFile({type:'asset',fileName:'theme-kit/provenance.json',source:JSON.stringify({presentation:{id:entry.id,version:entry.version,digest:entry.digest},sourceFiles:entry.sourceFiles,adaptation:'Three trusted lifecycle hooks plus canonical product-media accessor; original HTML templates/styles reused. Presentation JSON excludes demo commerce/catalog.'},null,2)});
 const atelier=registry.presentations.find(p=>p.id==='nova-atelier'&&p.version==='1.0.0');
 if(!atelier)throw Error('Atelier registry missing');
 const atelierSources=new Map();
 for(const file of atelier.sourceFiles){const bytes=fs.readFileSync(path.join(base,file.path));if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Trusted presentation source drift: '+file.path);atelierSources.set(file.path,bytes.toString('utf8'));}
 const atelierText=atelierSources.get('themes/02-atelier/theme.js'),atelierTheme=JSON.parse(atelierText.slice(atelierText.indexOf('{'),atelierText.lastIndexOf('}')+1)),atelierPresentation={};
 for(const key of ['id','name','style','sector','tag','desc','color','accent','bg','surface','ink','muted','hero','sub','eyebrow','cta','featuredCount','cardStyle','footerTitle','font'])if(Object.hasOwn(atelierTheme,key))atelierPresentation[key]=atelierTheme[key];
 this.emitFile({type:'asset',fileName:'theme-kit/nova-atelier/theme.css',source:atelierSources.get('themes/02-atelier/theme.css')});
 this.emitFile({type:'asset',fileName:'theme-kit/nova-atelier/runtime.js',source:atelierRuntimeSource(atelierSources.get('shared/core.js'))});
 this.emitFile({type:'asset',fileName:'theme-kit/nova-atelier/customer.js',source:customerRuntimeSource(atelierSources.get('shared/core.js'),'nova-atelier')});
 this.emitFile({type:'asset',fileName:'theme-kit/nova-atelier/presentation.json',source:JSON.stringify(atelierPresentation)});
 this.emitFile({type:'asset',fileName:'theme-kit/nova-atelier/provenance.json',source:JSON.stringify({presentation:{id:atelier.id,version:atelier.version,digest:atelier.digest},sourceFiles:atelier.sourceFiles,adaptation:'Original editorial home, header, fashion cards, category, PDP and complete footer templates; canonical DTO binding; no demo catalogue or executable package content.'},null,2)});
 }};}
