/** Local, trusted shape geometry for campaign canvases.
 *
 * The 720 closed paths are generated only from the fixed catalog parameters
 * below. No caller-supplied path, expression, SVG markup or network asset is
 * evaluated. One path serves solid fill, outline and image clipping alike.
 * Frames contain a closed inner contour: use fill-rule AND clip-rule evenodd.
 */
const TAU=Math.PI*2;
const round=value=>Math.round(value*1000)/1000;
const polar=(radius,angle,x=50,y=50)=>[x+Math.cos(angle)*radius,y+Math.sin(angle)*radius];
const rotate=([x,y],angle)=>{const a=angle*Math.PI/180;return[50+(x-50)*Math.cos(a)-(y-50)*Math.sin(a),50+(x-50)*Math.sin(a)+(y-50)*Math.cos(a)];};
const encode=commands=>commands.map(([command,...coordinates])=>command+(coordinates.length?coordinates.map(round).join(' '):'')).join(' ');
const transform=(commands,fn)=>commands.map(([command,...values])=>[command,...values.flatMap((value,index)=>index%2?[]:fn([value,values[index+1]]))]);
const polygon=points=>[['M',...points[0]],...points.slice(1).map(p=>['L',...p]),['Z']];
const ellipse=(cx,cy,rx,ry)=>{
  const k=.552284749831;
  return[['M',cx+rx,cy],['C',cx+rx,cy+ry*k,cx+rx*k,cy+ry,cx,cy+ry],['C',cx-rx*k,cy+ry,cx-rx,cy+ry*k,cx-rx,cy],['C',cx-rx,cy-ry*k,cx-rx*k,cy-ry,cx,cy-ry],['C',cx+rx*k,cy-ry,cx+rx,cy-ry*k,cx+rx,cy],['Z']];
};
const roundedRectangle=(x,y,width,height,radius)=>{
  const r=Math.min(radius,width/2,height/2),right=x+width,bottom=y+height;
  return[['M',x+r,y],['L',right-r,y],['Q',right,y,right,y+r],['L',right,bottom-r],['Q',right,bottom,right-r,bottom],['L',x+r,bottom],['Q',x,bottom,x,bottom-r],['L',x,y+r],['Q',x,y,x+r,y],['Z']];
};
// Closed Catmull-Rom splines preserve tangent continuity between each lobe.
// All authored point sets have generous edge clearance; controls are bounded
// as well so strokes and image masks never acquire unbounded path coordinates.
const smoothClosed=(points,tension=.85)=>{
  const result=[['M',...points[0]]],n=points.length;
  for(let i=0;i<n;i++){
    const previous=points[(i+n-1)%n],start=points[i],end=points[(i+1)%n],next=points[(i+2)%n];
    const controls=[start[0]+(end[0]-previous[0])*tension/6,start[1]+(end[1]-previous[1])*tension/6,end[0]-(next[0]-start[0])*tension/6,end[1]-(next[1]-start[1])*tension/6];
    result.push(['C',...controls.map(value=>Math.max(2,Math.min(98,value))),...end]);
  }
  result.push(['Z']);return result;
};
const radial=(count,radiusAt,phase=-Math.PI/2,scaleX=1,scaleY=1)=>Array.from({length:count},(_,index)=>{
  const angle=phase+TAU*index/count,radius=radiusAt(angle,index);
  return [50+Math.cos(angle)*radius*scaleX,50+Math.sin(angle)*radius*scaleY];
});

function oval(i){
  // Ten genuinely different aspect ratios, each in three orientations.
  const ratio=i%10,angle=Math.floor(i/10)*30;
  return transform(ellipse(50,50,43,17+ratio*2.7),p=>rotate(p,angle));
}
function rounded(i){
  const group=Math.floor(i/10),radius=3+(i%10)*2.1;
  return roundedRectangle(group===1?14:6,group===0?21:6,group===1?72:88,group===0?58:88,radius);
}
function capsule(i){
  const width=82,height=26+(i%10)*2.4,angle=Math.floor(i/10)*45;
  return transform(roundedRectangle((100-width)/2,(100-height)/2,width,height,height/2),p=>rotate(p,angle));
}
function geometric(i){
  const sides=3+(i%10),phase=-Math.PI/2+Math.floor(i/10)*.19,scaleY=1-Math.floor(i/10)*.09;
  return polygon(radial(sides,()=>44,phase,1,scaleY));
}
function star(i){
  const tips=4+(i%10),depth=18+Math.floor(i/10)*7;
  return polygon(radial(tips*2,(_angle,index)=>index%2?depth:44));
}
function flower(i){
  const petals=5+(i%10),valley=19+Math.floor(i/10)*5;
  return smoothClosed(radial(petals*2,(_angle,index)=>index%2?valley:43),1.05);
}
function blossom(i){
  // Paired rounded shoulders create wide petals, distinct from the pointed
  // radial flower family. Three shoulder widths change the silhouette.
  const petals=4+(i%10),shoulder=.19+Math.floor(i/10)*.07,points=[];
  for(let p=0;p<petals;p++){
    const base=-Math.PI/2+p*TAU/petals,step=TAU/petals;
    points.push(polar(22,base-step*.5),polar(42,base-step*shoulder),polar(43,base+step*shoulder));
  }
  return smoothClosed(points,.78);
}
function seal(i){
  const lobes=12+(i%10)*2,depth=3+Math.floor(i/10)*2.7;
  return smoothClosed(radial(lobes*2,(_angle,index)=>index%2?44-depth:44),.7);
}
function ticket(i){
  const depth=3+(i%10)*.75,half=7+(i%5),top=12+Math.floor(i/10)*7,bottom=100-top;
  // The sides are notched inward; the end arcs stay inside the outer bounds.
  return[['M',12,top],['L',88,top],['Q',94,top,94,top+6],['L',94,50-half],['C',94-depth*1.4,50-half,94-depth*1.4,50+half,94,50+half],['L',94,bottom-6],['Q',94,bottom,88,bottom],['L',12,bottom],['Q',6,bottom,6,bottom-6],['L',6,50+half],['C',6+depth*1.4,50+half,6+depth*1.4,50-half,6,50-half],['L',6,top+6],['Q',6,top,12,top],['Z']];
}
function ribbon(i){
  const notch=9+(i%10)*1.5,slant=Math.floor(i/10)*4,top=24-Math.floor(i/10)*5;
  return polygon([[5,top],[95,top+slant],[95-notch,50],[95,100-top],[5,100-top-slant],[5+notch,50]]);
}
function pennant(i){
  const notch=10+(i%10)*2.2,style=Math.floor(i/10);
  if(style===0)return polygon([[10,9],[90,9],[90,91],[50,91-notch],[10,91]]);
  if(style===1)return polygon([[10,9],[90,9],[90,66],[50,94-notch*.35],[10,66]]);
  return polygon([[7,16],[93,16],[93-notch,50],[93,84],[7,84],[7+notch*.25,50]]);
}
function bubble(i){
  const group=Math.floor(i/10),r=7+(i%5)*2,anchor=23+(i%10)*5,tip=anchor-8+(i%3)*8;
  const commands=[['M',9+r,12],['L',91-r,12],['Q',91,12,91,12+r],['L',91,73-r],['Q',91,73,91-r,73],['L',anchor+7,73],['L',tip,94],['L',anchor-7,73],['L',9+r,73],['Q',9,73,9,73-r],['L',9,12+r],['Q',9,12,9+r,12],['Z']];
  return transform(commands,p=>rotate(p,group*90));
}
function heart(i){
  const width=31+(i%10)*1.2,notch=18+Math.floor(i/10)*6,tip=86+(i%3)*3;
  return[['M',50,notch+14],['C',50-width*.4,notch-8,50-width,notch-8,50-width,notch+17],['C',50-width,57,30,68,50,tip],['C',70,68,50+width,57,50+width,notch+17],['C',50+width,notch-8,50+width*.4,notch-8,50,notch+14],['Z']];
}
function shield(i){
  const shoulder=12+(i%10)*1.8,bend=65+Math.floor(i/10)*6,crest=7+Math.floor(i/10)*4;
  return[['M',50,crest],['C',36,crest+8,19,shoulder,9,shoulder],['L',12,bend-19],['C',14,bend,31,83,50,94],['C',69,83,86,bend,88,bend-19],['L',91,shoulder],['C',81,shoulder,64,crest+8,50,crest],['Z']];
}
function organic(i){
  const a=3+i%4,b=5+i%3,phase=i*.371;
  return smoothClosed(radial(24,angle=>34+5*Math.sin(angle*a+phase)+3.4*Math.cos(angle*b-phase*.7),-.5+phase*.17),.92);
}
function drop(i){
  const belly=30+(i%10)*1.25,lean=(i%5-2)*2,commands=[['M',50+lean,6],['C',52+lean,24,50+belly,40,50+belly,61],['C',50+belly,82,68,94,50,94],['C',32,94,50-belly,82,50-belly,61],['C',50-belly,40,48+lean,24,50+lean,6],['Z']];
  return transform(commands,p=>rotate(p,Math.floor(i/10)*90));
}
function arch(i){
  const x=9+(i%10)*1.2,width=100-x*2,shoulder=38+Math.floor(i/10)*9,radius=width/2;
  return[['M',x,92],['L',x,shoulder],['C',x,shoulder-radius*.72,50-radius*.56,8,50,8],['C',50+radius*.56,8,100-x,shoulder-radius*.72,100-x,shoulder],['L',100-x,92],['Z']];
}
function wave(i){
  const peaks=2+i%5,amplitude=3+(i%6)*1.3,top=22+Math.floor(i/10)*6,bottom=100-top,phase=(i%3)*.8;
  const upper=Array.from({length:21},(_,n)=>[5+n*4.5,top+amplitude*Math.sin(n/20*TAU*peaks+phase)]);
  const lower=Array.from({length:21},(_,n)=>[95-n*4.5,bottom+amplitude*Math.sin((20-n)/20*TAU*peaks+phase+1.2)]);
  // Smooth wave edges and straight ends form a fully closed fabric-like band.
  const commands=[['M',...upper[0]]];
  const append=points=>{for(let n=1;n<points.length;n++){const a=points[n-1],b=points[n];commands.push(['C',a[0]+(b[0]-a[0])/3,a[1],a[0]+(b[0]-a[0])*2/3,b[1],...b]);}};
  append(upper);commands.push(['L',...lower[0]]);append(lower);commands.push(['Z']);return commands;
}
function frame(i){
  const style=Math.floor(i/10),inset=5+(i%10)*.9;
  if(style===0)return [...roundedRectangle(5,5,90,90,6+(i%5)*3),...roundedRectangle(5+inset,5+inset,90-inset*2,90-inset*2,Math.max(2,6+(i%5)*3-inset/2))];
  if(style===1)return [...ellipse(50,50,44,29+(i%10)*1.3),...ellipse(50,50,44-inset,29+(i%10)*1.3-inset)];
  const outer=polygon(radial(5+(i%6),()=>44,-Math.PI/2)),inner=polygon(radial(5+(i%6),()=>44-inset,-Math.PI/2));
  return [...outer,...inner];
}
function cloud(i){
  const lobes=3+i%5,height=27+Math.floor(i/5)*2.2,points=[];
  // A stable flat base differentiates clouds from all-around organic blobs.
  for(let n=0;n<=24;n++){
    const t=n/24,angle=Math.PI+Math.PI*t;
    points.push([50+42*Math.cos(angle),63+Math.sin(angle)*(height+4*Math.sin(t*Math.PI*lobes*2))]);
  }
  const commands=smoothClosed([...points,[89,72],[11,72]],.82);
  return commands;
}

// Additional ornament families keep the original 600 identities unchanged.
function crescent(i){
 const inset=15+(i%10)*1.8;
 const commands=[['M',68,8],['C',13,3,4,85,68,92],['C',inset,72,inset,28,68,8],['Z']];
 return transform(commands,p=>rotate(p,Math.floor(i/10)*90));
}
function leaf(i){
 const belly=16+(i%10)*2;
 const commands=[['M',50,6],['C',50+belly,24,94,68,50,94],['C',6,68,50-belly,24,50,6],['Z']];
 return transform(commands,p=>rotate(p,Math.floor(i/10)*45));
}
function corner(i){
 const inset=14+(i%10)*2.3;
 const commands=[['M',7,7],['L',93,7],['C',93,55,55,93,7,93],['L',7,93-inset],['C',44,93-inset,93-inset,44,93-inset,7+inset],['L',7,7+inset],['Z']];
 return transform(commands,p=>rotate(p,Math.floor(i/10)*90));
}
function arrow(i){
 const shaft=10+(i%10)*1.1,head=52+(i%10)*1.5;
 return transform(polygon([[6,50-shaft],[head,50-shaft],[head,8],[94,50],[head,92],[head,50+shaft],[6,50+shaft]]),p=>rotate(p,Math.floor(i/10)*90));
}

const families=[
  ['oval','Elipsler','Elips',oval],
  ['rounded','Yuvarlak kutular','Yumuşak kutu',rounded],
  ['capsule','Kapsüller','Kapsül',capsule],
  ['polygon','Çokgenler','Çokgen',geometric],
  ['star','Yıldızlar','Yıldız',star],
  ['flower','Çiçekler','Çiçek',flower],
  ['blossom','Çiçek rozetleri','Taç yaprak',blossom],
  ['seal','Rozetler','Tırtıklı rozet',seal],
  ['ticket','Biletler','Kampanya bileti',ticket],
  ['ribbon','Kurdeleler','Kurdele',ribbon],
  ['pennant','Flamalar','Flama',pennant],
  ['bubble','Konuşma balonları','Konuşma balonu',bubble],
  ['heart','Kalpler','Kalp',heart],
  ['shield','Kalkanlar','Kalkan',shield],
  ['organic','Organik formlar','Organik form',organic],
  ['drop','Damlalar','Damla',drop],
  ['arch','Kemerler','Kemer',arch],
  ['wave','Dalgalı şeritler','Dalgalı şerit',wave],
  ['frame','Çerçeveler','Çerçeve',frame],
  ['cloud','Bulutlar','Bulut',cloud],
  ['crescent','Hilaller','Hilal',crescent],
  ['leaf','Yapraklar','Yaprak',leaf],
  ['corner','Köşe süsleri','Köşe yayı',corner],
  ['arrow','Yön okları','Yön oku',arrow],
];

export const CAMPAIGN_SHAPE_CATEGORIES=Object.freeze(families.map(([id,label])=>Object.freeze({id,label})));
export const CAMPAIGN_SHAPES=Object.freeze(families.flatMap(([family,category,label,create])=>
  Array.from({length:30},(_,index)=>Object.freeze({
    id:`nova-shape-${family}-${String(index+1).padStart(2,'0')}`,
    label:`${label} ${String(index+1).padStart(2,'0')}`,
    category:family,
    categoryLabel:category,
    family,
    path:encode(create(index)),
    viewBox:'0 0 100 100',
    fillRule:'evenodd',
  }))
));
const shapesById=new Map(CAMPAIGN_SHAPES.map(shape=>[shape.id,shape]));

export function getCampaignShape(id){
  if(typeof id!=='string'||!shapesById.has(id))throw new Error('Hazır şekil bulunamadı.');
  return shapesById.get(id);
}

/** Matching Turkish and plain-keyboard search is useful in a large picker. */
const searchText=value=>String(value??'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export function searchCampaignShapes(query='',category='all'){
  const terms=searchText(query).trim().split(/\s+/).filter(Boolean);
  return CAMPAIGN_SHAPES.filter(shape=>(category==='all'||shape.category===category||shape.categoryLabel===category)&&terms.every(term=>searchText(`${shape.label} ${shape.categoryLabel} ${shape.family}`).includes(term)));
}
