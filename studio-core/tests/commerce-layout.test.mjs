import test from 'node:test';
import assert from 'node:assert/strict';
import {renderProductGallery,bottomNavigationClearance,createCommerceLayout} from '../src/studio-integration/commerce-layout.js';

function element(){return{children:[],attributes:{},classList:{add(){}},setAttribute(name,value){this.attributes[name]=value;},append(child){this.children.push(child);},replaceChildren(){this.children=[];}};}
test('canonical gallery selects accessible thumbnails without mutating a stale product view',()=>{
 const root={createElement:element},main=element(),thumbnails=element();let current=true;
 renderProductGallery({root,main,thumbnails,urls:['/uploads/a.png','/uploads/b.png'],name:'Ceket',isCurrent:()=>current});
 assert.equal(main.src,'/uploads/a.png');assert.equal(main.alt,'Ceket');
 assert.deepEqual(thumbnails.children.map(b=>b.attributes['aria-pressed']),['true','false']);
 assert.ok(thumbnails.children.every(b=>b.type==='button'&&b.children[0].width===64&&b.children[0].height===64&&b.children[0].alt===''));
 thumbnails.children[1].onclick();assert.equal(main.src,'/uploads/b.png');
 assert.deepEqual(thumbnails.children.map(b=>b.attributes['aria-pressed']),['false','true']);
 current=false;thumbnails.children[0].onclick();assert.equal(main.src,'/uploads/b.png');
});
test('empty canonical gallery never invents substitute product media',()=>{
 const main=element(),thumbnails=element();renderProductGallery({root:{createElement:element},main,thumbnails,urls:[],name:'Ürün',isCurrent:()=>true});
 assert.equal(thumbnails.children.length,0);assert.equal(main.src,undefined);
});
test('floating controls clear only a visible fixed navigation bar',()=>{
 const style={display:'flex',visibility:'visible',position:'fixed'},view={innerHeight:900,getComputedStyle:()=>style};let box={width:430,height:68,top:832,bottom:900};const navigation={getBoundingClientRect:()=>box};
 assert.equal(bottomNavigationClearance(navigation,view),84);
 style.display='none';assert.equal(bottomNavigationClearance(navigation,view),0);
 style.display='flex';style.position='static';assert.equal(bottomNavigationClearance(navigation,view),0);
 style.position='fixed';box={...box,top:901,bottom:969};assert.equal(bottomNavigationClearance(navigation,view),0);
 assert.equal(bottomNavigationClearance(null,view),0);
});
test('customer layout responds to navigation resize and restores desktop/theme settings on cleanup',()=>{
 const values=new Map([['--floating-bottom','30px']]),listeners=new Map();let observed=null,callback,nav={getBoundingClientRect:()=>({width:430,height:68,top:832,bottom:900})},visible=true;
 const view={innerHeight:900,getComputedStyle:()=>({display:visible?'flex':'none',visibility:'visible',position:'fixed'}),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),ResizeObserver:class{constructor(fn){callback=fn;}observe(target){observed=target;}disconnect(){observed=null;}}};
 const root={querySelector:()=>nav,body:{style:{getPropertyValue:key=>values.get(key)||'',setProperty:(key,value)=>values.set(key,value),removeProperty:key=>values.delete(key)}}};
 const layout=createCommerceLayout(root,view);layout.refresh();assert.equal(values.get('--floating-bottom'),'84px');assert.equal(observed,nav);
 nav={getBoundingClientRect:()=>({width:430,height:88,top:812,bottom:900})};layout.refresh();assert.equal(observed,nav);assert.equal(values.get('--floating-bottom'),'104px');
 visible=false;listeners.get('resize')();assert.equal(values.get('--floating-bottom'),'30px');
 visible=true;callback();assert.equal(values.get('--floating-bottom'),'104px');
 layout.dispose();assert.equal(values.get('--floating-bottom'),'30px');assert.equal(observed,null);assert.equal(listeners.size,0);
 callback();assert.equal(values.get('--floating-bottom'),'30px');
});
