import {normalizeCampaignCanvas} from './campaignCanvas.js';
import {getCampaignArtDirection} from './campaignArtDirection.js';

export const RAMADAN_LANTERN={kind:'svg',viewBox:'0 0 24 40',attrs:{fill:'none',stroke:'currentColor','stroke-width':'1.4','stroke-linejoin':'round','stroke-linecap':'round'},nodes:[{tag:'path',attrs:{d:'M12 0v3'}},{tag:'circle',attrs:{cx:'12',cy:'6',r:'3'}},{tag:'path',attrs:{d:'m6 13 6-4 6 4M4 15h16l-2 19H6L4 15ZM8 16l1 17m7-17-1 17M6 34h12M8 36h8l-4 3-4-3Z'}},{tag:'path',attrs:{d:'M12 20c-4 5-4 9 0 9s4-4 0-9Z',fill:'currentColor'}}]};
function archMask(width,height,aspectRatio){const h=Math.round(100*height/(width*aspectRatio)*100)/100,cap=Math.min(50,h*.55),curve=Math.round(cap*.44772*100)/100;return{kind:'svg',viewBox:`0 0 100 ${h}`,attrs:{fill:'currentColor'},nodes:[{tag:'path',attrs:{d:`M0 0H50C22.386 0 0 ${curve} 0 ${cap}ZM50 0H100V${cap}C100 ${curve} 77.614 0 50 0Z`}}]};}
const drawing=path=>({kind:'svg',viewBox:'0 0 24 24',attrs:{fill:'none',stroke:'currentColor','stroke-width':'1.3','stroke-linejoin':'round','stroke-linecap':'round'},nodes:[{tag:'path',attrs:{d:path}}]});
const CUSTOM_MOTIFS={'nova-ramadan-lantern':RAMADAN_LANTERN,kite:drawing('M12 2 21 10 12 18 3 10 12 2ZM12 2v16M3 10h18M12 18c-5 3 5 1 0 5'),flag:drawing('M5 22V3m0 1c5-5 9 5 15 0v11c-6 5-10-5-15 0'), 'pencil-ruler':drawing('m3 17 1 4 4-1L20 8 16 4 3 17Zm11-11 4 4M6 14l4 4M3 3h6v6H3V3Zm0 3h2m-2 3h3')};
export function campaignMotifAsset(id,visualAssets=globalThis.NovaStoreVisualAssets){return visualAssets.normalizeAsset(CUSTOM_MOTIFS[id]||visualAssets.icon(id));}
export const CANVAS_MOTIF_SETS=[
 {id:'ramadan',label:'Ramazan · Hilal ve fener',icons:['moon-star','nova-ramadan-lantern','star']},
 {id:'eid',label:'Bayram · Hediye ve kutlama',icons:['gift','party-popper','flower-2']},
 {id:'spring',label:'İlkbahar · Çiçek ve yaprak',icons:['flower-2','leaf','sunrise','sprout']},
 {id:'summer',label:'Yaz · Güneş ve palmiye',icons:['sun','tree-palm','sunset','plane']},
 {id:'autumn',label:'Sonbahar · Yaprak ve kitap',icons:['leaf','book-open','cloud-sun','umbrella']},
 {id:'winter',label:'Kış · Kar ve sıcak ışık',icons:['snowflake','lamp','moon','mountain']},
 {id:'school',label:'Okul · Kitap ve yeni dönem',icons:['graduation-cap','notebook-pen','book-open','backpack']},
 {id:'love',label:'Özel gün · Kalp ve hediye',icons:['heart','gift','flower','heart-handshake']},
 {id:'shop',label:'Mağaza · Paket ve keşif',icons:['shopping-bag','package','sparkles','calendar-days']},
 {id:'routine',label:'Günlük hayat · Sofra ve küçük molalar',icons:['coffee','utensils','headphones','droplets']},
 {id:'family',label:'Birlikte · Aile ve küçük dostlar',icons:['baby','puzzle','paw-print','house']},
];
export function motifForCampaign(pack){const s=`${pack.id} ${pack.season}`;return CANVAS_MOTIF_SETS.find(m=>m.id===(/ramadan/.test(s)?'ramadan':/eid|sacrifice/.test(s)?'eid':/school|university|semester/.test(s)?'school':/mothers|fathers|valentines|gift|wedding/.test(s)?'love':/spring/.test(s)?'spring':/summer/.test(s)?'summer':/autumn/.test(s)?'autumn':/winter|new-year/.test(s)?'winter':/family|baby|pet/.test(s)?'family':'shop'));}
const box=(id,x,y,width,height,color,more={})=>({id,kind:'shape',shape:'rect',x,y,width,height,color,...more});
const line=(id,x,y,width,color,more={})=>box(id,x,y,width,1,color,{shape:'line',strokeWidth:1,...more});
const symbol=(id,iconId,x,y,width,height,color,more={})=>({id,kind:'icon',...(CUSTOM_MOTIFS[iconId]?{asset:CUSTOM_MOTIFS[iconId]}:{iconId}),x,y,width,height,color,...more});
const safeBox=([x,y,w,h])=>[Math.max(0,x),Math.max(0,y),Math.min(w,100-Math.max(0,x)),Math.min(h,100-Math.max(0,y))];
const oldPhoto=/^\/media\/(category-|product-|hero-editorial|android-home-hero)/;
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16));
function luminance(hex){const c=rgb(hex).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function readableAccent(p){const from=rgb(p.accent),to=rgb(p.text);for(let step=0;step<=50;step++){const t=step/50,c='#'+from.map((v,i)=>Math.round(v+(to[i]-v)*t).toString(16).padStart(2,'0')).join('');if(contrast(c,p.background)>=4.5&&contrast(c,p.surface)>=4.5)return c;}return p.text;}

// Conservative word wrapping keeps Turkish copy inside its editable text box.
function fittedSize(value,width,height,aspectRatio,preferred){
 const words=String(value).split(/\s+/),availableWidth=width*12,availableHeight=height*12/aspectRatio;
 let size=Math.min(96,preferred);
 for(;size>10;size-=.5){let lines=1,used=0;for(const word of words){const w=word.length*size*.54;if(used&&used+size*.3+w>availableWidth){lines++;used=w;}else used+=w+(used?size*.3:0);if(w>availableWidth)lines+=Math.floor(w/availableWidth);}if(lines*size*1.18<=availableHeight*.94)break;}
 return Math.max(10,size);
}
function typography(id,value,rect,preferred,palette,aspectRatio,more={}){const[x,y,width,height]=safeBox(rect);return{id,kind:'text',text:value,x,y,width,height,fontSize:fittedSize(value,width,height,aspectRatio,preferred),fontWeight:500,font:'inherit',color:palette.text,...more,...(more.color===palette.accent?{color:readableAccent(palette)}:{})};}
function photo(pack,art,rect,more={}){const[x,y,width,height]=safeBox(rect),src=pack.image&&!oldPhoto.test(pack.image)?pack.image:art.image,imageKind=pack.imageKind||(/\/sectors\//.test(src)?'object':'scene');return{id:'scene-photo',kind:'image',src,alt:pack.name||pack.title||'Kampanya görseli',x,y,width,height,imageKind,fit:imageKind==='scene'?'cover':'contain',...more};}
const semantic={arch:'poster',parcel:'collage',coast:'split',window:'showcase',notebook:'split',confetti:'poster',letter:'editorial',record:'showcase',editorial:'editorial',botanical:'collage',trail:'split',postcard:'collage',ritual:'showcase',table:'editorial',studio:'showcase',ticket:'ribbon'};
const fallbackFamily={poster:'confetti',split:'coast',collage:'postcard',ribbon:'ticket',editorial:'editorial',showcase:'studio'};
function variantLayouts(art){const second=semantic[art.secondary]===art.layout?['editorial','collage','split','showcase','poster'].find(id=>id!==art.layout):semantic[art.secondary],third=['ribbon','poster','collage','split','showcase','editorial'].find(id=>id!==art.layout&&id!==second);return[art.layout,second,third];}
export function campaignCanvasVariants(pack,theme={},channel='web'){const art=getCampaignArtDirection(pack);return variantLayouts(art).map((layout,index)=>({id:layout,label:[art.familyLabel,'İkinci vitrin','Kısa duyuru'][index],canvas:createCampaignCanvas(pack,{layout,theme,channel,variant:index})}));}

function copyLayers(pack,art,rect,aspectRatio,{mobile=false,compact=false,center=false,font='inherit',note=true}={}){
 const p=art.palette,[x,y,w,h]=rect,eyebrowHeight=mobile?5:8,headlineY=y+(mobile?7:11),headlineHeight=h*(compact?.63:mobile?.42:.49),bodyY=headlineY+headlineHeight+(mobile?2:3),align=center?'center':'left';
 const layers=[typography('eyebrow',pack.occasion||'Nova Store seçkisi',[x,y,w,eyebrowHeight],mobile?44:20,p,aspectRatio,{color:p.accent,fontWeight:600,align}),typography('headline',pack.title||pack.name,[x,headlineY,w,headlineHeight],mobile?78:art.fontSize,p,aspectRatio,{font,fontWeight:font==='serif'?400:500,align})];
 if(!compact)layers.push(typography('body',pack.description||'',[x,bodyY,w,Math.min(h*(mobile?.34:.24),99-bodyY,note?Math.min(95,y+h-4)-2-bodyY:100)],mobile?52:23,p,aspectRatio,{fontWeight:400,align}));
 if(note&&!compact){const noteY=Math.min(95,y+h-4);layers.push(typography('collection-note',art.note,[x,noteY,w,4],mobile?25:16,p,aspectRatio,{color:p.accent,fontWeight:400,align}));}
 return layers;
}
function mainDesktop(pack,art,family,aspectRatio){
 const p=art.palette,[x,y,w,h]=art.photo,[cx,cy,cw]=art.copy,photoRight=x>45,layers=[];let copyOptions={},copyRect=art.copy;
 if(family==='arch'){
  layers.push(line('arch-floor',x-1,Math.min(97,y+h+2),w+2,p.accent,{opacity:.45}),photo(pack,art,art.photo),{id:'arch-cutout',kind:'icon',asset:archMask(w,h,aspectRatio),x,y,width:w,height:h,color:p.background});
  layers.push(symbol('left-lantern','nova-ramadan-lantern',photoRight?3:46,0,5,26,p.accent),symbol('right-lantern','nova-ramadan-lantern',photoRight?47:94,0,4,19,p.accent),symbol('crescent','moon-star',cx+cw-7,7,6,13,p.accent),line('arch-rule',cx,cy-4,12,p.accent,{opacity:.8}));copyOptions={font:'serif'};
 }else if(family==='parcel'){
  layers.push(box('wrapping-panel',x-2,y-4,w+4,h+8,p.surface,{radius:3}),box('vertical-ribbon',photoRight?x-4:x+w+1,0,2,100,p.accent,{opacity:.48}),line('horizontal-ribbon',0,y+h*.67,100,p.accent,{opacity:.2}),photo(pack,art,art.photo,{radius:2}),symbol('gift-bow',art.motif,photoRight?x-6:x+w-2,5,9,18,p.accent),line('gift-label-line',cx,cy-6,11,p.accent));
 }else if(family==='coast'){
  layers.push(box('horizon-band',0,80,100,20,p.surface),photo(pack,art,art.photo),line('horizon',0,80,100,p.accent,{opacity:.6}),symbol('summer-sun',art.motif,cx+cw-7,5,8,17,p.accent),box('horizon-step',photoRight?43:4,88,9,1,p.accent));copyRect=[cx,cy,cw,Math.min(art.copy[3],77-cy)];copyOptions={note:false};layers.push(typography('coast-note',art.note,[6,88,83,5],18,p,aspectRatio,{fontWeight:400}));
 }else if(family==='window'){
  layers.push(box('window-frame',x-2,y-3,w+4,h+6,p.surface,{radius:2}),photo(pack,art,art.photo,{radius:3}),line('window-sill',x-4,Math.min(98,y+h+5),w+8,p.accent,{opacity:.5}),box('window-label',photoRight?x-5:x+w-5,y+h-14,12,21,p.background,{radius:50}),symbol('window-symbol',art.motif,photoRight?x-3:x+w-3,y+h-11,8,14,p.accent),line('quiet-rule',cx,cy-5,15,p.accent));
 }else if(family==='notebook'){
  layers.push(box('paper-sheet',4,6,92,88,p.surface,{radius:1}),box('writing-page',photoRight?5:51,7,44,86,p.background));for(let i=0;i<4;i++)layers.push(box(`binding-${i}`,photoRight?5.5:50,17+i*19,1,5,p.accent,{radius:40,opacity:.5}));
  layers.push(photo(pack,art,art.photo,{radius:1}),box('photo-tab',x+w-11,Math.max(2,y-4),8,9,p.accent,{opacity:.52,rotate:4}),symbol('notebook-symbol',art.motif,cx+cw-5,7,5,10,p.accent));
 }else if(family==='confetti'){
  layers.push(box('celebration-ground',x-3,y+4,w+6,h-2,p.surface,{radius:3}),photo(pack,art,art.photo,{radius:4}));[[3,9,2,4,-14],[45,8,1,6,18],[95,75,2,4,8],[43,90,1,5,-12]].forEach(([dx,dy,dw,dh,r],i)=>layers.push(box(`paper-confetti-${i}`,dx,dy,dw,dh,p.accent,{rotate:r,opacity:.62})));layers.push(symbol('celebration-symbol',art.motif,cx+cw-6,6,6,13,p.accent),line('celebration-rule',cx,cy-5,14,p.accent));
 }else if(family==='letter'){
  layers.push(box('letter-paper',photoRight?5:50,8,45,85,p.surface,{radius:1}),line('letter-edge',photoRight?5:50,9,45,p.accent,{opacity:.25}),photo(pack,art,art.photo,{rotate:photoRight?2:-2,radius:1}),symbol('letter-seal',art.motif,photoRight?53:46,72,9,18,p.accent),line('letter-signature',cx,Math.min(94,cy+art.copy[3]),14,p.accent,{opacity:.55}));copyOptions={font:'serif',note:false};
 }else if(family==='record'){
  layers.push(box('record-halo',x-3,y-6,w+6,h+12,p.surface,{shape:'circle'}),photo(pack,art,art.photo,{radius:50}),box('record-label',x+w-10,y+h-16,12,24,p.background,{shape:'circle'}),symbol('record-symbol',art.motif,x+w-7,y+h-11,6,13,p.accent),line('record-rule',cx,cy-5,12,p.accent),line('record-rule-short',cx+14,cy-5,4,p.accent,{opacity:.3}));
 }else if(family==='editorial'){
  layers.push(line('edition-top',5,4,90,p.accent,{opacity:.42}),photo(pack,art,art.photo),line('edition-bottom',5,95,90,p.accent,{opacity:.32}),typography('edition-index','Nova Store / Seçki',[photoRight?7:55,7,35,5],16,p,aspectRatio,{color:p.accent,fontWeight:400}),symbol('editorial-mark',art.motif,photoRight?46:93,84,4,8,p.accent));copyOptions={font:'serif',note:false};
 }else if(family==='botanical'){
  layers.push(box('botanical-paper',x-3,y-5,w+6,h+10,p.surface,{radius:2}),photo(pack,art,art.photo,{radius:3}),symbol('botanical-sprig',art.motif,photoRight?45:1,4,10,19,p.accent,{rotate:photoRight?12:-14}),symbol('botanical-leaf','leaf',photoRight?87:40,78,11,20,p.accent,{rotate:25,opacity:.7}),line('botanical-caption',cx,cy-5,13,p.accent));
 }else if(family==='trail'){
  layers.push(box('trail-panel',x-2,y+3,w+4,h-2,p.surface,{rotate:photoRight?-3:3,radius:2}),photo(pack,art,art.photo,{radius:2}));for(let i=0;i<4;i++)layers.push(line(`route-dash-${i}`,photoRight?48:52,24+i*15,3,p.accent,{rotate:90,opacity:.4}));layers.push(symbol('route-marker',art.motif,cx+cw-6,6,6,13,p.accent),line('route-baseline',cx,cy-5,12,p.accent));
 }else if(family==='postcard'){
  layers.push(box('postcard-paper',x-3,y-5,w+6,h+15,p.surface,{rotate:photoRight?2:-2,radius:1}),photo(pack,art,art.photo,{rotate:photoRight?2:-2,radius:1}),box('paper-tape',x+w*.32,Math.max(1,y-7),w*.36,10,p.accent,{rotate:photoRight?-5:5,opacity:.3}),symbol('postcard-stamp',art.motif,cx+cw-6,5,6,13,p.accent),line('postcard-address',cx,cy-5,17,p.accent,{opacity:.4}));
 }else if(family==='ritual'){
  layers.push(box('ritual-color-field',x-7,0,w+14,100,p.surface),photo(pack,art,art.photo,{radius:17}),symbol('ritual-symbol',art.motif,photoRight?x-5:x+w-4,68,10,20,p.accent),line('ritual-line',cx,cy-5,16,p.accent),box('ritual-dot',cx+18,cy-5,1,2,p.accent,{shape:'circle'}));copyOptions={font:'serif'};
 }else if(family==='table'){
  layers.push(box('table-mat',x-3,y-4,w+6,h+8,p.surface,{radius:2}),photo(pack,art,art.photo,{radius:3}),line('table-rule',cx,cy-5,cw,p.accent,{opacity:.4}),symbol('table-emblem',art.motif,cx+cw-6,5,6,12,p.accent),line('table-linen-fold',photoRight?3:96,3,1,p.accent,{opacity:.25}));copyOptions={font:'serif'};
 }else if(family==='studio'){
  layers.push(box('studio-platform',x-3,y+h*.68,w+6,100-(y+h*.68),p.surface,{radius:3}),photo(pack,art,art.photo,{radius:5}),line('studio-detail',cx,cy-5,10,p.accent),symbol('studio-symbol',art.motif,cx+cw-6,7,6,12,p.accent),line('studio-baseline',cx,Math.min(95,cy+art.copy[3]),cw,p.accent,{opacity:.25}));
 }else if(family==='ticket'){
  const seam=photoRight?x-5:x+w+5;layers.push(box('ticket-paper',4,5,92,90,p.surface,{radius:3}),photo(pack,art,art.photo,{radius:2}));for(let i=0;i<6;i++)layers.push(box(`ticket-perforation-${i}`,seam,13+i*13,1,5,p.accent,{opacity:.4}));layers.push(symbol('ticket-symbol',art.motif,cx+cw-6,7,6,12,p.accent));
 }
 if(!layers.some(l=>l.kind==='image'))layers.push(photo(pack,art,art.photo));
 layers.push(...copyLayers(pack,art,copyRect,aspectRatio,copyOptions));return layers;
}
function secondaryArt(art){const reverse=art.photo[0]>45,delta=art.index%4;return{...art,family:art.secondary,photo:reverse?[6+delta,10,40-delta,76]:[54+delta,8,39-delta,80],copy:reverse?[54,17,39,73]:[7,17,40,72],aspectRatio:2.08+(art.index%3)*.04,fontSize:art.fontSize-1};}
function compactDesktop(pack,art,aspectRatio){const p=art.palette,left=art.index%2===0,imageX=left?4:78,copyX=left?27:6,copyW=left?65:63;return[box('announcement-inset',2,8,96,84,p.surface,{radius:2}),photo(pack,art,[imageX,15,18,70],{radius:art.index%3===0?50:5}),line('announcement-rule',copyX,20,10,p.accent),typography('eyebrow',pack.occasion||pack.name,[copyX,27,copyW-10,12],19,p,aspectRatio,{color:p.accent,fontWeight:600}),typography('headline',pack.title||pack.name,[copyX,45,copyW,33],37,p,aspectRatio,{fontWeight:500}),symbol('announcement-symbol',art.motif,copyX+copyW-5,21,4,16,p.accent)];}

// App stories are recomposed vertically with their own image/copy order and
// ornament proportions, rather than clipping a desktop banner to phone width.
function mobileScene(pack,art,family,{compact=false,secondary=false}={}){
 const p=art.palette,index=art.index,layers=[];
 if(compact){const aspectRatio=1.6,left=index%2===0;layers.push(box('mobile-note-paper',3,6,94,88,p.surface,{radius:3}),photo(pack,art,[left?5:66,14,29,72],{radius:index%3===0?50:4}),typography('eyebrow',pack.occasion||pack.name,[left?39:8,17,52,10],30,p,aspectRatio,{fontWeight:600,color:p.accent}),typography('headline',pack.title||pack.name,[left?39:8,36,52,42],52,p,aspectRatio,{fontWeight:500}));return{aspectRatio,layers};}
 const photoFirst=['window','postcard','record','ritual','coast','table'].includes(family),inset=index%3===0?7:9;
 let photoRect=photoFirst?[inset,5,100-inset*2,45]:[inset,52,100-inset*2,42],copyRect=photoFirst?[9,55,82,40]:[9,7,82,41],radius=3,aspectRatio=.78+(index%3)*.025,font='inherit';
 if(family==='coast'){photoRect=[0,0,100,49];copyRect=[9,57,82,39];layers.push(box('mobile-shore',0,45,100,9,p.surface),symbol('mobile-sun',art.motif,79,48,11,8,p.accent));}
 else if(family==='record'){photoRect=[17,4,66,50];copyRect=[9,60,82,36];radius=50;aspectRatio=.76;layers.push(box('mobile-record-halo',13,1,74,56,p.surface,{shape:'circle'}));}
 else if(family==='letter'){photoRect=[16,58,70,33];copyRect=[12,10,76,44];radius=1;font='serif';layers.push(box('mobile-letter-paper',5,4,90,91,p.surface,{radius:2}),line('mobile-letter-line',12,6,40,p.accent,{opacity:.4}));}
 else if(family==='editorial'){photoRect=[8,49,84,45];copyRect=[8,9,84,35];font='serif';layers.push(line('mobile-edition-top',8,4,84,p.accent,{opacity:.5}),typography('mobile-edition-label','Nova Store / Seçki',[8,96,80,3],21,p,aspectRatio,{color:p.accent,fontWeight:400}));}
 else if(family==='notebook'){photoRect=[14,53,76,40];copyRect=[14,9,75,39];layers.push(box('mobile-notebook-paper',6,4,88,92,p.surface,{radius:2}),box('mobile-notebook-copy',9,6,83,44,p.background));for(let i=0;i<5;i++)layers.push(box(`mobile-binding-${i}`,7,12+i*17,1,3,p.accent,{radius:50,opacity:.6}));}
 else if(family==='table'){photoRect=[7,5,86,46];copyRect=[10,58,80,37];font='serif';layers.push(box('mobile-table-mat',4,3,92,50,p.surface,{radius:3}),line('mobile-table-rule',10,55,80,p.accent,{opacity:.4}));}
 else if(family==='arch'){photoRect=[17,51,66,44];copyRect=[10,9,80,37];font='serif';layers.push(symbol('mobile-hanging-lantern','nova-ramadan-lantern',3,0,8,18,p.accent),symbol('mobile-hanging-lantern-small','nova-ramadan-lantern',88,0,6,13,p.accent));}
 else if(family==='botanical'){photoRect=[12,53,76,41];copyRect=[10,10,80,37];layers.push(box('mobile-botanical-paper',8,50,84,47,p.surface,{radius:3}),symbol('mobile-botanical-leaf','leaf',77,2,15,10,p.accent,{rotate:20}));}
 else if(family==='parcel'){photoRect=[14,54,72,36];copyRect=[10,10,80,38];layers.push(box('mobile-gift-ribbon',6,0,2,100,p.accent,{opacity:.5}),box('mobile-gift-paper',11,51,78,42,p.surface,{radius:3}),line('mobile-gift-knot',0,93,100,p.accent,{opacity:.4}));}
 else if(family==='trail'){photoRect=[12,53,76,40];copyRect=[9,9,82,39];layers.push(box('mobile-route-panel',8,54,84,41,p.surface,{rotate:-2,radius:3}),line('mobile-route-line',9,4,32,p.accent));}
 else if(family==='studio'){photoRect=[9,53,82,40];copyRect=[10,10,80,38];radius=4;layers.push(box('mobile-studio-platform',4,79,92,18,p.surface,{radius:3}),line('mobile-studio-top',10,5,22,p.accent));}
 else if(family==='ticket'){photoRect=[9,54,82,37];copyRect=[10,10,80,38];layers.push(box('mobile-ticket-paper',4,4,92,92,p.surface,{radius:3}));for(let i=0;i<6;i++)layers.push(box(`mobile-ticket-dash-${i}`,10+i*14,49,6,1,p.accent,{opacity:.4}));}
 else if(family==='confetti'){photoRect=[12,52,76,40];copyRect=[10,10,80,38];radius=4;layers.push(box('mobile-celebration-paper',8,50,84,45,p.surface,{radius:3}),box('mobile-confetti-one',88,6,2,4,p.accent,{rotate:18}),box('mobile-confetti-two',5,45,2,4,p.accent,{rotate:-15}));}
 else if(family==='postcard'){photoRect=[12,6,76,41];copyRect=[9,56,82,39];radius=1;layers.push(box('mobile-postcard-paper',8,3,84,49,p.surface,{rotate:2,radius:1}),box('mobile-postcard-tape',36,1,28,5,p.accent,{opacity:.3,rotate:-3}));}
 else if(family==='ritual'){photoRect=[16,5,68,45];copyRect=[10,57,80,38];radius=18;font='serif';layers.push(box('mobile-ritual-inset',9,0,82,53,p.surface));}
 else if(family==='window'){photoRect=[12,6,76,43];copyRect=[10,57,80,38];radius=4;layers.push(box('mobile-window-frame',8,3,84,49,p.surface,{radius:3}),line('mobile-window-sill',6,52,88,p.accent,{opacity:.45}));}
 if(!secondary&&art.mobile){
  const before=photoRect,after=art.mobile.photo,frames=new Set(['mobile-shore','mobile-record-halo','mobile-table-mat','mobile-botanical-paper','mobile-gift-paper','mobile-route-panel','mobile-studio-platform','mobile-celebration-paper','mobile-postcard-paper','mobile-ritual-inset','mobile-window-frame']);
  for(const l of layers)if(frames.has(l.id)){const rx=after[2]/before[2],ry=after[3]/before[3],[x,y,width,height]=safeBox([after[0]+(l.x-before[0])*rx,after[1]+(l.y-before[1])*ry,l.width*rx,l.height*ry]);Object.assign(l,{x,y,width,height});}
  photoRect=[...after];copyRect=[...art.mobile.copy];aspectRatio=art.mobile.aspectRatio;
 }
 if(secondary){aspectRatio+=.035;photoRect=[photoRect[0]+1,photoRect[1],photoRect[2]-2,photoRect[3]];}
 layers.push(photo(pack,art,photoRect,{radius,rotate:family==='postcard'?2:0}));
 if(family==='arch')layers.push({id:'mobile-arch-cutout',kind:'icon',asset:archMask(photoRect[2],photoRect[3],aspectRatio),x:photoRect[0],y:photoRect[1],width:photoRect[2],height:photoRect[3],color:p.background});
 layers.push(...copyLayers(pack,art,copyRect,aspectRatio,{mobile:true,font,note:false,center:['record','ritual'].includes(family)}));
 const chipX=photoRect[0]+photoRect[2]-13,chipY=photoRect[1]+photoRect[3]-9;
 layers.push(box('mobile-season-chip',chipX,chipY,13,9,p.background,{radius:35}),symbol('mobile-season-symbol',art.motif,chipX+3,chipY+1.5,7,6,p.accent));
 return{aspectRatio,layers};
}
export function createCampaignCanvas(pack,{layout,theme={},channel='web',variant}={}){
 const initial=getCampaignArtDirection(pack),layouts=variantLayouts(initial),requested=layout||initial.layout,position=variant??layouts.indexOf(requested),compact=position===2||(variant===undefined&&requested==='ribbon'&&initial.layout!=='ribbon'),art=position===1||position<0?secondaryArt(initial):initial,family=position===1?initial.secondary:position<0?fallbackFamily[requested]||initial.family:initial.family;
 if(variant!==undefined||!layout||layouts.includes(requested)){
  const composition=createNovaCampaignComposition(pack,initial,{channel,variant:Math.max(0,position)});
  return normalizeCampaignCanvas({version:1,layout:requested,themeMode:'custom',background:NOVA_CAMPAIGN_PALETTE.paper,sourceTheme:theme.id||'',...composition});
 }
 let aspectRatio=compact?3.5:art.aspectRatio,layers;
 if(channel==='android'){const c=mobileScene(pack,art,family,{compact,secondary:position===1});aspectRatio=c.aspectRatio;layers=c.layers;}
 else layers=compact?compactDesktop(pack,art,aspectRatio):mainDesktop(pack,art,family,aspectRatio);
 return normalizeCampaignCanvas({version:1,layout:requested,themeMode:'custom',background:art.palette.background,aspectRatio,sourceTheme:theme.id||'',layers});
}
import {createNovaCampaignComposition,NOVA_CAMPAIGN_PALETTE} from './novaCampaignComposition.js';
