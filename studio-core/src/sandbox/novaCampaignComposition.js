/** Nova Store campaign pavilions. Every photographic, graphic and copy layer
 * remains an ordinary editable campaign-canvas layer. These scenes carry no
 * prices, stock claims, links, controls or commerce state. */
export const NOVA_CAMPAIGN_PALETTE={paper:'#fffaf3',white:'#ffffff',ink:'#182b3a',muted:'#475969',orange:'#ef7739',orangeInk:'#9d3b16',apricot:'#ffe4cd'};
export const NOVA_CAMPAIGN_STAGE_OVERRIDES={'pet-care':'pets','baby-arrival':'baby','family-time':'family','childrens-day':'kids','semester-break':'kids','republic-day':'republic','gift-guide':'gifts','wedding-season':'gifts','fathers-day':'record'};
const CAMPAIGN_SPECIFIC_STAGES=new Set(['spring-refresh','autumn-reading','school-desk','womens-day','new-home','winter-hobbies','teachers-day']);

const BRAND_ORBIT={kind:'svg',viewBox:'0 0 160 100',attrs:{fill:'none',stroke:'currentColor','stroke-width':'2.4','stroke-linecap':'round'},nodes:[{tag:'path',attrs:{d:'M12 72C-1 41 40 5 86 8c43 3 74 24 65 48-7 19-34 28-63 28'}},{tag:'circle',attrs:{cx:'88',cy:'84',r:'5',fill:'currentColor',stroke:'none'}}]};
const BRAND_FOLD={kind:'svg',viewBox:'0 0 100 100',attrs:{fill:'currentColor'},nodes:[{tag:'path',attrs:{d:'M0 0h100v100L78 76V22H24L0 0Z'}}]};
const BRAND_SPARK={kind:'svg',viewBox:'0 0 32 32',attrs:{fill:'currentColor'},nodes:[{tag:'path',attrs:{d:'M16 0c2 11 5 14 16 16-11 2-14 5-16 16C14 21 11 18 0 16 11 14 14 11 16 0Z'}}]};
const SEASON_LANTERN={kind:'svg',viewBox:'0 0 24 40',attrs:{fill:'none',stroke:'currentColor','stroke-width':'1.4','stroke-linejoin':'round','stroke-linecap':'round'},nodes:[{tag:'path',attrs:{d:'M12 0v3'}},{tag:'circle',attrs:{cx:'12',cy:'6',r:'3'}},{tag:'path',attrs:{d:'m6 13 6-4 6 4M4 15h16l-2 19H6L4 15ZM8 16l1 17m7-17-1 17M6 34h12M8 36h8l-4 3-4-3Z'}},{tag:'path',attrs:{d:'M12 20c-4 5-4 9 0 9s4-4 0-9Z',fill:'currentColor'}}]};
const FAMILY_FORM={arch:'pavilion',parcel:'collage',coast:'panorama',window:'fold',notebook:'shelf',confetti:'collage',letter:'fold',record:'orbit',editorial:'shelf',botanical:'panorama',trail:'panorama',postcard:'collage',ritual:'orbit',table:'pavilion',studio:'shelf',ticket:'fold'};
const FORMS=['pavilion','collage','panorama','fold','orbit','shelf'];
const p=NOVA_CAMPAIGN_PALETTE;
const rect=(x,y,width,height)=>[x,y,width,height];
const shape=(id,b,color,more={})=>({id,kind:'shape',shape:'rect',x:b[0],y:b[1],width:b[2],height:b[3],color,...more});
const vector=(id,asset,b,color,more={})=>({id,kind:'icon',asset,x:b[0],y:b[1],width:b[2],height:b[3],color,...more});
const photo=(id,src,alt,b,more={})=>({id,kind:'image',src,alt,x:b[0],y:b[1],width:b[2],height:b[3],imageKind:'scene',fit:'cover',...more});

// Text width uses the canvas renderer's 1200-unit typography scale. Explicit
// newlines are respected, including when a merchant edits a preset headline.
function fittedSize(value,box,ratio,preferred){
 const maxWidth=box[2]*12,maxHeight=box[3]*12/ratio;
 for(let size=Math.min(96,preferred);size>=10;size-=.5){
  let lines=0;
  for(const paragraph of String(value).split('\n')){let used=0,row=1;for(const word of paragraph.split(/\s+/)){const width=word.length*size*.56;if(used&&used+width+size*.31>maxWidth){row++;used=width;}else used+=width+(used?size*.31:0);if(width>maxWidth)row+=Math.floor(width/maxWidth);}lines+=row;}
  if(lines*size*1.15<=maxHeight*.95)return size;
 }
 return 10;
}
function text(id,value,b,ratio,size,more={}){return{id,kind:'text',text:String(value||''),x:b[0],y:b[1],width:b[2],height:b[3],fontSize:fittedSize(value,b,ratio,size),fontWeight:500,font:'sans',color:p.ink,...more};}
function brand(b,ratio,mobile=false){const[x,y,w,h]=b;return[
 shape('nova-brand-ribbon',b,p.orange,{radius:8}),
 text('nova-brand-name','Nova Store',[x+w*.08,y+h*.19,w*.84,h*.67],ratio,mobile?53:28,{color:p.ink,fontWeight:600}),
 ];}
function signature(b,ratio,mobile=false){return[
 shape('nova-signature-paper',[0,b[1]-.75,100,100-b[1]+.75],p.paper),
 text('nova-collection-signature','Nova Store için seçildi.',b,ratio,mobile?37:18,{color:p.muted,fontWeight:400}),
 ];}
function copy(pack,{plate,eyebrow,headline,body},ratio,{mobile=false,compact=false}={}){return[
 shape('nova-story-paper',plate,p.paper,{radius:2}),
 text('eyebrow',pack.occasion||pack.name||'Mevsimin seçkisi',eyebrow,ratio,mobile?42:22,{color:p.orangeInk,fontWeight:600}),
 text('headline',pack.title||pack.name||'Sana iyi gelen seçimler.',headline,ratio,mobile?84:66,{fontWeight:500}),
 ...(!compact?[text('body',pack.description||'Günlük hayatına eşlik edecek özenli seçimler.',body,ratio,mobile?51:26,{color:p.muted,fontWeight:400})]:[]),
 ];}
function campaignPhoto(pack,art,b,more={}){return photo('scene-photo',pack.image||art.image,pack.name||'Nova Store kampanya seçkisi',b,more);}
function stageSource(pack,art){return art.stageImage||(CAMPAIGN_SPECIFIC_STAGES.has(pack.id)?pack.image:undefined)||`/media/campaign-stages-20260915/${NOVA_CAMPAIGN_STAGE_OVERRIDES[pack.id]||art.family}.webp`;}
function stage(pack,art,b=[0,0,100,100],more={}){return photo('nova-season-stage',stageSource(pack,art),`${pack.name||art.familyLabel||'Mevsim'} için hazırlanan Nova Store vitrini`,b,more);}
function cardFrame(b,rotate=0){return shape('nova-photo-mat',[b[0]-1.1,b[1]-1.7,b[2]+2.2,b[3]+3.4],p.white,{radius:2,rotate});}
function footer(ratio,art,y=91){return[
 shape('nova-collection-rail',[0,y,100,100-y],p.orange),
 text('nova-collection-note',art.note||'Hayatına yakışan seçimler.',[5,y+2,78,100-y-2.4],ratio,20,{color:p.ink,fontWeight:500}),
 vector('nova-collection-mark',BRAND_SPARK,[92,y+1.8,2.7,100-y-3.6],p.ink),
 ];}

function desktop(pack,art,form,secondary){
 const i=Number.isInteger(art.index)?art.index:0,d=(i%7)*.31+Math.floor(i/7)*.055,ratio=secondary?2.08+(i%4)*.015:2.02+(i%5)*.02;
 const layers=[stage(pack,art)];
 if(form==='pavilion'){
  // A brand pavilion: the photographic seasonal world surrounds a stepped
  // story plinth; its companion photograph floats across the display orbit.
  const b=rect(64-d,31+d,29+d,48-d);
  layers.push(vector('nova-display-orbit',BRAND_ORBIT,[55,6,43,72],p.orange,{opacity:.8}),shape('nova-display-plinth',[57,77,39,11],p.apricot,{radius:2}),cardFrame(b,-3),campaignPhoto(pack,art,b,{rotate:-3,radius:1}));
  layers.push(...copy(pack,{plate:[4,25,54,61],eyebrow:[8,31,45,6],headline:[8,42,45,23],body:[8,68,45,14]},ratio),...brand([5,7,24,11],ratio),vector('nova-story-fold',BRAND_FOLD,[51,25,7,12],p.orange),...footer(ratio,art));
 }else if(form==='collage'){
  // A three-level shopping collage with an editorial card crossing both
  // photographs. The hierarchy is central, rather than left-copy/right-image.
  const b=rect(5+d,18,25-d,58+d);
  layers.push(shape('nova-collage-floor',[0,78,100,22],p.apricot),vector('nova-display-orbit',BRAND_ORBIT,[5,0,86,91],p.orange,{rotate:-6,opacity:.62}),cardFrame(b,-4),campaignPhoto(pack,art,b,{rotate:-4,radius:1}),photo('nova-stage-detail',stageSource(pack,art),'Aynı seçkinin sahne ayrıntısı',[76,29+d,18,54-d],{rotate:4,radius:2}));
  layers.push(...copy(pack,{plate:[30,22,45,62],eyebrow:[34,28,37,6],headline:[34,39,37,25],body:[34,67,37,13]},ratio),...brand([34,8,28,10],ratio),vector('nova-collage-star',BRAND_SPARK,[84,12,7,13],p.orange),...signature([5,89,76,6],ratio));
 }else if(form==='panorama'){
  // A wide photographic horizon and a landscape-format story plate, with a
  // tilted field note above it. This works for coast, garden and outdoor packs.
  const b=rect(71-d,8+d,22+d,35);
  layers.push(vector('nova-display-orbit',BRAND_ORBIT,[39,0,59,61],p.orange,{opacity:.7}),cardFrame(b,3),campaignPhoto(pack,art,b,{rotate:3,radius:1}),shape('nova-story-offset',[7,55,89,41],p.apricot,{radius:2}));
  layers.push(...copy(pack,{plate:[4,50,90,43],eyebrow:[8,55,74,5],headline:[8,63,73,15],body:[8,81,77,8]},ratio),...brand([5,8,25,10],ratio),vector('nova-horizon-spark',BRAND_SPARK,[87,56,4,8],p.orange),...signature([8,95,72,4],ratio));
 }else if(form==='fold'){
  // The personal photograph is a large page, tucked into a wider invitation
  // fold. The headline and scene overlap without placing text over busy pixels.
  const b=rect(6+d,16,36-d,69);
  layers.push(shape('nova-fold-spine',[3,13,41,75],p.apricot,{rotate:-2,radius:1}),cardFrame(b,-2),campaignPhoto(pack,art,b,{rotate:-2,radius:1}));
  layers.push(...copy(pack,{plate:[34,30,61,59],eyebrow:[39,35,50,6],headline:[39,46,50,24],body:[39,73,50,12]},ratio),...brand([56,9,27,11],ratio),vector('nova-envelope-fold',BRAND_FOLD,[84,30,11,18],p.orange),shape('nova-fold-foot',[34,89,61,3],p.orange),...signature([6,94,77,4],ratio));
 }else if(form==='orbit'){
  // A circular product world on an elliptical display orbit, anchored by a
  // low story card. Coffee, care and leisure get this softer visual rhythm.
  const b=rect(58-d,16+d,35+d,61-d);
  layers.push(vector('nova-display-orbit',BRAND_ORBIT,[41,3,57,83],p.orange,{opacity:.9}),shape('nova-orbit-plinth',[62,72,34,15],p.apricot,{radius:8}),shape('nova-orbit-photo-rim',[b[0]-1.4,b[1]-2,b[2]+2.8,b[3]+4],p.white,{shape:'circle'}),campaignPhoto(pack,art,b,{radius:50}));
  layers.push(...copy(pack,{plate:[5,32,54,55],eyebrow:[9,37,45,6],headline:[9,48,45,22],body:[9,73,45,11]},ratio),...brand([5,8,26,11],ratio),vector('nova-orbit-spark',BRAND_SPARK,[43,14,6,11],p.orange),...footer(ratio,art));
 }else{
  // A gallery shelf. A wide photographic field and a compact collection print
  // sit above a full-width editorial label, like a physical Nova Store display.
  const b=rect(60+d,10,32-d,44+d);
  layers.push(shape('nova-shelf-back',[5,9,39,43],p.apricot,{radius:2}),photo('nova-stage-detail',stageSource(pack,art),'Nova Store seçki sahnesi',[7,11,35,39],{radius:1}),cardFrame(b,2),campaignPhoto(pack,art,b,{rotate:2,radius:1}),shape('nova-display-shelf',[3,54,94,5],p.orange));
  layers.push(...copy(pack,{plate:[5,60,90,35],eyebrow:[9,64,73,5],headline:[9,73,76,12],body:[9,86,77,7]},ratio),...brand([33,27,29,12],ratio),vector('nova-shelf-spark',BRAND_SPARK,[47,8,6,11],p.orange));
 }
 return{aspectRatio:ratio,layers};
}

function compactDesktop(pack,art){
 const i=Number.isInteger(art.index)?art.index:0,ratio=3.35+(i%3)*.035,d=(i%7)*.3;
 const b=[76-d,13,19+d,73];
 return{aspectRatio:ratio,layers:[stage(pack,art),shape('nova-ribbon-paper',[0,0,73,100],p.paper),shape('nova-ribbon-edge',[70,0,3,100],p.orange),cardFrame(b,-2),campaignPhoto(pack,art,b,{rotate:-2,radius:2}),...brand([4,12,21,24],ratio),text('eyebrow',pack.occasion||pack.name,[29,14,37,15],ratio,23,{color:p.orangeInk,fontWeight:600}),text('headline',pack.title||pack.name,[4,49,61,39],ratio,43),vector('nova-ribbon-orbit',BRAND_ORBIT,[71,0,28,100],p.orange,{opacity:.7})]};
}

function mobile(pack,art,form,secondary){
 const i=Number.isInteger(art.index)?art.index:0,d=(i%7)*.32+Math.floor(i/7)*.055,ratio=(secondary?.745:.72)+(i%5)*.009;
 const layers=[stage(pack,art)];
 if(form==='panorama'||form==='shelf'){
  const b=[58-d,16,33+d,26];
  layers.push(vector('nova-mobile-orbit',BRAND_ORBIT,[6,11,87,38],p.orange,{opacity:.8}),cardFrame(b,3),campaignPhoto(pack,art,b,{rotate:3,radius:2}),shape('nova-mobile-plinth',[3,44,94,3],p.orange));
  layers.push(...copy(pack,{plate:[5,49,90,45],eyebrow:[10,54,80,4],headline:[10,61,80,13],body:[10,77,80,12]},ratio,{mobile:true}),...brand([7,5,47,8],ratio,true),...signature([10,95,80,3],ratio,true));
 }else if(form==='collage'){
  const b=[7+d,18,35-d,30];
  layers.push(vector('nova-mobile-orbit',BRAND_ORBIT,[8,14,84,35],p.orange,{rotate:-5,opacity:.75}),cardFrame(b,-4),campaignPhoto(pack,art,b,{rotate:-4,radius:1}),photo('nova-stage-detail',stageSource(pack,art),'Nova Store sahne ayrıntısı',[59,22,32,27],{rotate:4,radius:1}));
  layers.push(...copy(pack,{plate:[5,45,90,50],eyebrow:[10,51,80,4],headline:[10,59,80,14],body:[10,77,80,13]},ratio,{mobile:true}),...brand([26,5,49,8],ratio,true),vector('nova-mobile-fold',BRAND_FOLD,[84,45,11,8],p.orange),...signature([10,96,80,3],ratio,true));
 }else if(form==='fold'){
  const b=[8+d,17,47-d,34];
  layers.push(shape('nova-mobile-photo-page',[5,15,55,39],p.apricot,{rotate:-3,radius:1}),cardFrame(b,-3),campaignPhoto(pack,art,b,{rotate:-3,radius:1}));
  layers.push(...copy(pack,{plate:[5,47,90,48],eyebrow:[10,52,80,4],headline:[10,60,80,13],body:[10,77,80,13]},ratio,{mobile:true}),...brand([45,5,47,8],ratio,true),vector('nova-mobile-fold',BRAND_FOLD,[79,47,16,10],p.orange),...signature([10,96,80,3],ratio,true));
 }else if(form==='orbit'){
  const b=[25-d,17,54+d,32];
  layers.push(vector('nova-mobile-orbit',BRAND_ORBIT,[5,11,90,43],p.orange,{opacity:.9}),shape('nova-mobile-orbit-rim',[b[0]-1.3,b[1]-1,b[2]+2.6,b[3]+2],p.white,{shape:'circle'}),campaignPhoto(pack,art,b,{radius:50}));
  layers.push(...copy(pack,{plate:[5,50,90,44],eyebrow:[10,55,80,4],headline:[10,63,80,12],body:[10,78,80,11]},ratio,{mobile:true}),...brand([8,5,48,8],ratio,true),...signature([10,95,80,3],ratio,true));
 }else{
  const b=[59-d,18,33+d,30];
  layers.push(vector('nova-mobile-orbit',BRAND_ORBIT,[27,12,67,41],p.orange,{opacity:.85}),shape('nova-mobile-display-plinth',[52,44,44,5],p.apricot,{radius:3}),cardFrame(b,-3),campaignPhoto(pack,art,b,{rotate:-3,radius:1}));
  layers.push(...copy(pack,{plate:[5,48,90,46],eyebrow:[10,53,80,4],headline:[10,61,80,13],body:[10,77,80,12]},ratio,{mobile:true}),...brand([7,5,48,8],ratio,true),vector('nova-mobile-fold',BRAND_FOLD,[83,48,12,9],p.orange),...signature([10,95,80,3],ratio,true));
 }
 return{aspectRatio:ratio,layers};
}

function compactMobile(pack,art){
 const i=Number.isInteger(art.index)?art.index:0,ratio=1.2+(i%4)*.01,d=(i%7)*.35,b=[68-d,13,26+d,35];
 return{aspectRatio:ratio,layers:[stage(pack,art),cardFrame(b,3),campaignPhoto(pack,art,b,{rotate:3,radius:1}),...brand([6,9,48,13],ratio,true),shape('nova-short-story',[4,52,92,43],p.paper,{radius:2}),text('eyebrow',pack.occasion||pack.name,[9,58,80,7],ratio,39,{color:p.orangeInk,fontWeight:600}),text('headline',pack.title||pack.name,[9,69,80,21],ratio,65),vector('nova-short-orbit',BRAND_ORBIT,[56,0,42,49],p.orange,{opacity:.8})]};
}

function seasonalOrnaments(pack,mobile=false,compact=false){
 if(!/^(ramadan|eid|sacrifice-feast)/.test(pack.id||''))return[];
 const a=mobile?[65,0,5,17]:compact?[67,0,2,28]:[34,0,3.5,24],b=mobile?[87,0,4,12]:compact?[75,0,2,17]:[44,0,2.6,18],moon=mobile?[77,8,8,6]:[91,2,4,9];
 return[vector('nova-season-lantern-tall',SEASON_LANTERN,a,p.orangeInk),vector('nova-season-lantern-short',SEASON_LANTERN,b,p.orangeInk),{id:'nova-season-crescent',kind:'icon',iconId:'moon-star',x:moon[0],y:moon[1],width:moon[2],height:moon[3],color:p.orangeInk}];
}

/** @returns {{aspectRatio:number,layers:Array<object>}} */
export function createNovaCampaignComposition(pack,art,{channel='web',variant=0}={}){
 const primary=FAMILY_FORM[art.family]||'pavilion',secondary=variant===1;
 // A secondary composition changes its visual architecture, not just its hue.
 const suggested=FAMILY_FORM[art.secondary]||'collage',form=secondary?(suggested===primary?FORMS[(FORMS.indexOf(primary)+2)%FORMS.length]:suggested):primary;
 const result=variant===2?(channel==='android'?compactMobile(pack,art):compactDesktop(pack,art)):(channel==='android'?mobile(pack,art,form,secondary):desktop(pack,art,form,secondary));
 // Seasonal decorations live behind the editorial plates, so a long edited
 // headline can never collide with a lantern. They remain individually editable.
 result.layers.splice(1,0,...seasonalOrnaments(pack,channel==='android',variant===2));
 return result;
}
