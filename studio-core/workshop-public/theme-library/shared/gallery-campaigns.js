/* Gallery adapter. The Studio model owns every canvas and section normalization. */
(function installGalleryCampaigns(root){
 function factory(engine){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value)),signatures=new WeakMap();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function available(){return !!engine?.normalizeCampaignSection&&!!engine?.renderCampaignCanvas;}
  function ready(){if(!available())throw Error('Ortak kampanya düzenleyicisi yüklenmedi. Mevcut kayıtlar korunuyor.');}
  function normalizeChannels(value){
   if(value===undefined)return undefined;ready();
   if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='app,web'||JSON.stringify(value).length>8_000_000)throw Error('Kampanya kanalları geçersiz veya 8 MB sınırını aşıyor.');
   const result={web:[],app:[]};
   for(const channel of ['web','app']){if(!Array.isArray(value[channel])||value[channel].length>12)throw Error('Bir kanala en fazla 12 kampanya paketi eklenebilir.');const seen=new Set();
    result[channel]=value[channel].map(section=>{const normalized=engine.normalizeCampaignSection(section,channel==='app'?'android':'web',true);if(seen.has(normalized.id))throw Error('Kampanya kimlikleri tekil olmalı.');seen.add(normalized.id);return normalized;});
   }return result;
  }
  function catalog(doc){
   const view=doc?.defaultView;if(!view)return[];
   if(view.NovaStoreThemeMode==='host'||view.NovaStoreCommerceHost!==undefined){const snapshot=view.NovaStoreCommerceHost?.snapshot?.();return snapshot?.phase==='ready'&&Array.isArray(snapshot.products)?snapshot.products:[];}
   return Array.isArray(view.THEME?.products)?view.THEME.products:[];
  }
  function permittedProducts(section,products){
   const allowed=new Set(products.map(p=>String(p.id)));let removed=0,needsSelection=false;
   const value=clone(section);
   for(const block of value.blocks){if(!block.productSource)continue;const source=block.productSource,previous=source.productIds||[],kept=previous.filter(id=>allowed.has(String(id)));removed+=previous.length-kept.length;
    if(source.mode!=='selected'&&block.type==='products')needsSelection=true;
    block.productSource={mode:'selected',categoryId:'',productIds:[...new Set(kept.map(String))]};
   }return {section:value,removed,needsSelection};
  }
  function themeFor(doc){const css=doc.defaultView.getComputedStyle(doc.body),pick=(name,fallback)=>{const value=css.getPropertyValue(name).trim();return /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)?value:fallback;};return {id:doc.defaultView.THEME?.id||'',accent:pick('--primary','#315642'),text:pick('--ink','#203445'),surface:pick('--surface','#f1eee7'),background:pick('--bg','#ffffff')};}
  function safeTarget(target,products){
   const routes={home:'home',categories:'catalog',search:'catalog',cart:'cart',account:'account',support:'help',favorites:'favorites'};
   if(routes[target])return '#/'+routes[target];
   if(target?.startsWith('product:')&&products.some(p=>String(p.id)===target.slice(8)))return '#/product/'+encodeURIComponent(target.slice(8));
   return '#/catalog';
  }
  function targetRoute(section){const target=section.campaign?.targetPage||'home';return ({'template:category':'catalog','template:search':'catalog','template:product':'product','template:account':'account','template:cart':'cart','template:support':'help','categories':'catalog','support':'help'})[target]||target;}
  function nextBoundary(sections,channel='web',now=Date.now()){
   const normalized=normalizeChannels({web:channel==='web'?sections:[],app:channel==='app'?sections:[]})[channel],future=[];
   for(const section of normalized){if(section.campaign&&!section.campaign.channels.includes(channel==='app'?'android':'web'))continue;const plan=engine.campaignSchedule(section.campaign);for(const pair of [plan,...section.blocks])for(const key of ['startsAt','endsAt']){const stamp=Date.parse(pair[key]);if(Number.isFinite(stamp)&&stamp>now)future.push(stamp);}}
   return future.length?Math.min(...future):null;
  }
  const runtimeCSS=`.kit-campaign-section{width:min(1280px,calc(100% - 32px));margin:32px auto;position:relative;box-sizing:border-box;color:var(--ink,#203445)}.kit-campaign-section *{box-sizing:border-box}.kit-campaign-block{margin:20px 0;overflow:hidden}.kit-campaign-copy{padding:clamp(20px,4vw,44px);border-radius:12px;background:var(--surface,#f5f5ef)}.kit-campaign-copy h2{font:500 clamp(24px,4vw,46px)/1.12 inherit;white-space:pre-line;overflow-wrap:anywhere;margin:9px 0 18px}.kit-campaign-copy p{white-space:pre-wrap;line-height:1.7;margin:10px 0}.kit-campaign-copy .kit-campaign-kicker{font-size:11px;letter-spacing:1.4px}.kit-campaign-action{display:inline-flex;align-items:center;min-height:44px;padding:10px 18px;margin-top:16px;border-radius:7px;background:var(--primary,#315642);color:var(--on-primary,#fff);font-size:13px}.kit-campaign-image{width:100%;max-height:480px;object-fit:cover;display:block}.kit-campaign-section .nova-campaign-canvas{display:block}.kit-campaign-section .product-grid{margin-top:20px}.kit-campaign-products-empty{padding:22px;border:1px dashed var(--border,#cbd5ca);font-size:13px}.kit-campaign-faq{padding:14px 0;border-bottom:1px solid var(--border,#cbd5ca)}.kit-campaign-faq summary{cursor:pointer;font-weight:600}.kit-campaign-faq p{margin:12px 0}.kit-campaign-section [data-campaign-layer]{pointer-events:none!important}.kit-campaign-section .kit-campaign-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}.kit-campaign-section .kit-campaign-grid>article{padding:20px;background:var(--surface,#f5f5ef)}@media(max-width:600px){.kit-campaign-section .kit-campaign-grid{grid-template-columns:1fr}.kit-campaign-section{margin-block:20px}}`;
  function blockHTML(block,doc){
   const products=catalog(doc),theme=themeFor(doc),title=block.showTitle===false?'':`<h2>${escape(block.title)}</h2>`,copy=`<span class="kit-campaign-kicker">${escape(block.kicker)}</span>${title}<p>${escape(block.description)}</p>`,action=block.buttonText?`<a class="kit-campaign-action" href="${safeTarget(block.target,products)}">${escape(block.buttonText)}</a>`:'';
   if(block.campaignCanvas)return engine.renderCampaignCanvas(block.campaignCanvas,{theme,visualAssets:globalThis.NovaStoreVisualAssets})+action;
   if(block.type==='products'){
    const ids=(block.productSource?.productIds||[]).filter(id=>products.some(p=>String(p.id)===id)).slice(0,block.productLimit);
    const render=doc.defaultView.NovaStoreThemeView?.renderProductCards;
    return `<div class="kit-campaign-copy">${copy}</div>`+(ids.length&&typeof render==='function'?`<div class="product-grid">${render(ids)}</div>`:`<p class="kit-campaign-products-empty">${ids.length?'Bu temanın ürün kartı bağlantısı henüz hazır değil.':'Bu kampanyanın ürünleri henüz seçilmedi.'}</p>`);
   }
   if(block.type==='divider')return '<hr>';
   if(block.type==='spacer')return `<div style="height:${block.style.padding}px" aria-hidden="true"></div>`;
   if(block.type==='faq')return `<div class="kit-campaign-copy">${title}${block.items.map(item=>`<details class="kit-campaign-faq"><summary>${escape(item.title)}</summary><p>${escape(item.body)}</p></details>`).join('')}</div>`;
   if(['features','stats','testimonials'].includes(block.type))return `<div class="kit-campaign-copy">${title}<div class="kit-campaign-grid">${block.items.map(item=>`<article><strong>${escape(item.value||item.title)}</strong><p>${escape(item.body)}</p></article>`).join('')}</div></div>`;
   let image='';if(['hero','banner','editorial'].includes(block.type)&&block.image){const src=engine.resolveMedia(block.image);if(!src.startsWith('data:image/'))throw Error('Kampanya görselini taşınabilir görsel olarak yükle.');image=`<img class="kit-campaign-image" src="${escape(src)}" alt="${escape(block.alt)}">`;}
   return `<div class="kit-campaign-copy">${image}${block.showCopy===false?'':copy}${action}</div>`;
  }
  function renderSections(doc,sections,hash,{preview=false,channel='web'}={}){
   ready();if(!doc?.body)return;const main=doc.getElementById('main-content');if(!main)return;
   if(!doc.getElementById('kit-campaign-runtime-style')){const sheet=doc.createElement('style');sheet.id='kit-campaign-runtime-style';sheet.textContent=runtimeCSS;doc.head.append(sheet);}
   const validated=normalizeChannels({web:channel==='web'?sections:[],app:channel==='app'?sections:[]})[channel];
   const route=(hash||'#/home').replace(/^#\//,'').split('?')[0],now=Date.now(),valid=validated.filter(section=>{const target=targetRoute(section);if(!(target===route||target==='product'&&route.startsWith('product/'))||section.campaign&&!section.campaign.channels.includes(channel==='app'?'android':'web'))return false;if(preview)return true;const schedule=engine.campaignSchedule(section.campaign);return (!schedule.startsAt||Date.parse(schedule.startsAt)<=now)&&(!schedule.endsAt||Date.parse(schedule.endsAt)>now);}),wanted=new Set(valid.map(section=>section.id));
   for(const node of main.querySelectorAll('[data-kit-campaign]'))if(!wanted.has(node.dataset.kitCampaign))node.remove();
   const prependAnchor=[...main.children].find(node=>!node.hasAttribute('data-kit-campaign'))||null;let changed=false;
   for(const section of valid){
    const blocks=section.blocks.filter(block=>block.enabled&&(channel==='app'?block.visibility.mobile:block.visibility.desktop)&&(preview||(!block.startsAt||Date.parse(block.startsAt)<=now)&&(!block.endsAt||Date.parse(block.endsAt)>now)));
    const signature=JSON.stringify([section,themeFor(doc),catalog(doc),blocks.map(b=>b.id)]);
    let wrapper=[...main.querySelectorAll('[data-kit-campaign]')].find(node=>node.dataset.kitCampaign===section.id);
    if(!wrapper){wrapper=doc.createElement('section');wrapper.className='kit-campaign-section';wrapper.dataset.kitCampaign=section.id;wrapper.setAttribute('aria-label',section.name);}
    if(signatures.get(wrapper)!==signature){wrapper.innerHTML=blocks.map(block=>`<div class="kit-campaign-block" data-kit-campaign-block="${escape(block.id)}">${blockHTML(block,doc)}</div>`).join('');signatures.set(wrapper,signature);changed=true;}
    const placement=section.campaign?.placement||'append';
    if(placement==='prepend'){if(wrapper.parentElement!==main||wrapper.nextSibling!==prependAnchor)main.insertBefore(wrapper,prependAnchor);}
    else if(placement==='after'&&section.campaign.afterBlockId){const anchor=doc.getElementById(section.campaign.afterBlockId);if(anchor&&main.contains(anchor)&&!wrapper.contains(anchor)){if(anchor.nextSibling!==wrapper)anchor.after(wrapper);}else if(wrapper.parentElement!==main||wrapper.nextSibling)main.append(wrapper);}
    else if(wrapper.parentElement!==main||wrapper.nextSibling)main.append(wrapper);
   }
   if(changed)doc.defaultView.NovaStoreThemeView?.refresh?.();
  }
  const api={available,normalizeChannels,permittedProducts,catalog,themeFor,renderSections,targetRoute,nextBoundary};api.runtimeSource=()=> '('+factory.toString()+')(globalThis.NovaStoreCampaignCanvas)';return Object.freeze(api);
 }
 root.NovaStoreGalleryCampaigns=factory(root.NovaStoreCampaignCanvas);
})(globalThis);

/* Parent-page controls; exported storefronts only include the factory above. */
(function installCampaignEditor(root){
 const copy=value=>JSON.parse(JSON.stringify(value));
 function readyEngine(){const engine=root.NovaStoreCampaignCanvas;if(!engine?.campaignCanvasVariants)throw Error('Yeni hazır kompozisyon kütüphanesi yüklenmedi. Kayıtlı tasarım korunuyor.');return engine;}
 function variantsFor(section,block,{theme={},channel='web'}={}){
  const engine=readyEngine(),source=engine.CAMPAIGN_PACKS.find(item=>item.id===section.campaign?.sourceId)||{id:'custom',name:section.name,title:block.title,description:block.description,occasion:block.kicker};
  const pack={...source,title:block.title||source.title,description:block.description||source.description,occasion:block.kicker||source.occasion,image:engine.resolveMedia(block.image||source.image||'')};
  return engine.campaignCanvasVariants(pack,theme,channel);
 }
 function createReadySection(packId,{id,channel='web',theme={},products=[],route='home'}={}){
  const engine=readyEngine(),pack=engine.CAMPAIGN_PACKS.find(item=>item.id===packId);
  if(!pack)throw Error('Hazır paket bulunamadı.');
  const canvas=engine.campaignCanvasVariants(pack,theme,channel)[0].canvas;
  return engine.toPortableSection({id,name:pack.name,blocks:engine.createCampaignBlocks(packId,channel,{catalog:{products,categories:[]},theme,variant:0,canvas}),campaign:{...engine.defaultCampaign(pack,channel,route),channels:[channel],placement:'append'}},channel);
 }
 function selectVariant(section,blockIndex,variantIndex,{theme={},channel='web'}={}){
  if(!Number.isInteger(variantIndex)||variantIndex<0||variantIndex>2)throw Error('Üç hazır kompozisyondan birini seç.');
  const engine=readyEngine(),next=copy(section),block=next.blocks[blockIndex];
  if(!block?.campaignCanvas)throw Error('Önce tuval içeren bölümü seç.');
  const previous=block.campaignCanvas,canvas=variantsFor(next,block,{theme,channel})[variantIndex].canvas;
  // A layout change preserves the owner's text and selected photograph. Opening
  // an existing record never calls this function or replaces its saved canvas.
  for(const layer of canvas.layers){const old=previous.layers.find(item=>item.id===layer.id&&item.kind===layer.kind);if(!old)continue;if(layer.kind==='text')layer.text=old.text;if(layer.kind==='image'){layer.src=old.src;layer.alt=old.alt;layer.imageKind=old.imageKind;layer.fit=old.fit;}}
  block.campaignCanvas=canvas;
  return engine.toPortableSection(next,channel);
 }
 function mount(options){
  const {editor,frame,canvasTools,getCurrent,getChannel,getRoute,commit,apply,notify,host}=options,engine=root.NovaStoreCampaignCanvas,api=root.NovaStoreGalleryCampaigns;
  const clone=value=>JSON.parse(JSON.stringify(value)),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const canEdit=()=>api.available()&&(!host||host.can('edit','saveLibrary')&&host.can('catalog','readCampaignCatalog'));
  let draft=null,blockIndex=0,layerIndex=0,selectedId=null,products=[],opener=null,chosenVariantIndex=null,textPanel=null;
  const button=document.createElement('button');button.id='kit-add-campaign';button.textContent='Kampanya ekle';button.disabled=!canEdit();button.title=host&&!canEdit()?'Mağazanın kampanya katalog bağlantısı hazır değil.':'';canvasTools.append(button);
  const dialog=document.createElement('dialog');dialog.className='kit-campaign-dialog';dialog.setAttribute('aria-label','Kampanya paketi ve tuval düzenleyicisi');dialog.innerHTML=`<header><div><h2>Kampanyanı tasarla</h2><p>Hazır dönem paketini seç, tuvali ve ürünlerini bu temaya göre düzenle.</p></div><button data-campaign-close aria-label="Kampanya düzenleyicisini kapat">Kapat</button></header><div class="kit-campaign-editor-body"><aside class="kit-campaign-setup"><label>Hazır dönem paketi<select data-campaign-pack>${(engine?.CAMPAIGN_PACKS||[]).map(pack=>`<option value="${esc(pack.id)}">${esc(pack.name)}</option>`).join('')}</select></label><label>Studio paketini içe al<input data-campaign-import type="file" accept="application/json,.json"></label><label>Paket adı<input data-campaign-name maxlength="100"></label><label>Hedef sayfa<select data-campaign-route>${[['home','Ana sayfa'],['catalog','Katalog'],['favorites','Favoriler'],['account','Hesabım'],['cart','Sepet'],['help','Yardım']].map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><label>Yerleşim<select data-campaign-placement><option value="prepend">İçeriğin başına</option><option value="append">İçeriğin sonuna</option></select></label><label>Bölüm<select data-campaign-block></select></label><div class="kit-campaign-block-fields"></div><fieldset><legend>Yayın planı</legend><label>Plan<select data-campaign-schedule><option value="none">Tarih yok</option><option value="manual">Elle tarih seç</option></select></label><label>Başlangıç<input data-campaign-start type="datetime-local"></label><label>Bitiş<input data-campaign-end type="datetime-local"></label><small>Europe/Istanbul. Bu işlem yalnız tema taslağıdır; yayın veya fiyat kuralı oluşturmaz.</small></fieldset></aside><section class="kit-campaign-stage"><div class="kit-campaign-layouts" role="group" aria-label="Pakete özel üç kompozisyon"></div><div class="kit-campaign-live" aria-label="Düzenlenebilir kampanya tuvali"></div><p class="kit-campaign-drag-hint">Bir tuval öğesine tıkla; fareyle sürükle veya ok tuşlarıyla taşı.</p><div class="kit-campaign-products"></div></section><aside class="kit-campaign-layer-controls"></aside></div><footer><p data-campaign-status role="status"></p><button data-campaign-remove>Paketi kaldır</button><button data-campaign-cancel>Vazgeç</button><button data-campaign-apply>Temaya kaydet</button></footer>`;document.body.append(dialog);
  const status=dialog.querySelector('[data-campaign-status]'),setup=dialog.querySelector('.kit-campaign-setup'),stage=dialog.querySelector('.kit-campaign-live'),controls=dialog.querySelector('.kit-campaign-layer-controls');
  const activeBlock=()=>draft?.blocks[blockIndex],activeCanvas=()=>activeBlock()?.campaignCanvas,theme=()=>api.themeFor(frame.contentDocument),apiChannel=()=>getChannel()==='app'?'android':'web';
  function message(value){status.textContent=value;}
  function normalize(){draft=engine.normalizeCampaignSection(draft,apiChannel(),true);return draft;}
  function mutate(fn){const previous=clone(draft),previousVariant=chosenVariantIndex;try{fn();normalize();message('Tuval önizlemesi güncel. Temaya kaydet ile uygula.');render();}catch(error){draft=previous;chosenVariantIndex=previousVariant;render();message(error.message);}}
  function choosePack(id){try{draft=createReadySection(id,{id:selectedId||crypto.randomUUID(),channel:apiChannel(),theme:theme(),products,route:getRoute()});chosenVariantIndex=0;blockIndex=Math.max(0,draft.blocks.findIndex(block=>block.campaignCanvas));layerIndex=0;render();message('Pakete özel ilk kompozisyon hazır. Üç düzen arasından seçim yapabilir, ürün rafına bu mağazadan ürün ekleyebilirsin.');}catch(error){message(error.message);}}
  function productFields(){const block=activeBlock(),box=dialog.querySelector('.kit-campaign-products');box.replaceChildren();if(block?.type!=='products')return;
   const title=document.createElement('h3');title.textContent='Bu bölüme eklenecek ürünler';box.append(title);
   if(!products.length){const empty=document.createElement('p');empty.textContent='Yetkili ürün kataloğu bulunmuyor. Örnek ürün eklenmedi.';box.append(empty);return;}
   for(const product of products){const label=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span');input.type='checkbox';input.value=String(product.id);input.checked=block.productSource.productIds.includes(String(product.id));name.textContent=product.name||product.title||String(product.id);label.append(input,name);box.append(label);input.onchange=()=>mutate(()=>{const ids=new Set(block.productSource.productIds);input.checked?ids.add(input.value):ids.delete(input.value);block.productSource={mode:'selected',categoryId:'',productIds:[...ids]};});}
  }
  function textFields(layer){
   const select=(key,label,entries,value=layer[key])=>`<label>${label}<select data-campaign-text-option="${key}">${entries.map(([id,name])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
   const number=(key,label,value,min,max,step=1)=>`<label>${label}<input data-campaign-text-number="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
   const deco=layer.textDecoration||'none',groups=[...new Set(engine.CAMPAIGN_FONTS.map(font=>font.group))];
   const fonts=`<label class="kit-text-family"><span class="kit-text-sr">Yazı tipi</span><select title="Yazı tipi" data-campaign-text-option="font" style="font-family:${esc(engine.campaignFontFamily(layer.font))}">${groups.map(group=>`<optgroup label="${esc(group)}">${engine.CAMPAIGN_FONTS.filter(font=>font.group===group).map(font=>`<option value="${font.id}" style="font-family:${esc(font.family)}" ${font.id===layer.font?'selected':''}>${esc(font.label)}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
   return `<section class="kit-campaign-text-tools" aria-label="Yazı biçimlendirme"><h3>Yazıyı düzenle <small>${engine.CAMPAIGN_FONTS.length} yazı tipi seçeneği</small></h3>
    <div class="kit-text-toolbar" role="group" aria-label="Yazı araç çubuğu">${fonts}
    <div class="kit-text-size-row"><div class="kit-text-sizing" role="group" aria-label="Yazı boyutunu ayarla"><button data-campaign-text-size="-2" aria-label="Yazıyı küçült" title="Yazıyı küçült" ${layer.fontSize<=8?'disabled':''}><span aria-hidden="true">A<sup>−</sup></span></button><label><span class="kit-text-sr">Yazı boyutu</span><input data-campaign-text-number="fontSize" type="number" min="8" max="144" value="${layer.fontSize}"></label><button data-campaign-text-size="2" aria-label="Yazıyı büyüt" title="Yazıyı büyüt" ${layer.fontSize>=144?'disabled':''}><span aria-hidden="true">A<sup>+</sup></span></button></div><label class="kit-text-weight"><span class="kit-text-sr">Yazı kalınlığı</span><select title="Yazı kalınlığı" data-campaign-text-option="fontWeight">${engine.CAMPAIGN_TEXT_WEIGHTS.map(w=>`<option value="${w.value}" ${w.value===layer.fontWeight?'selected':''}>${w.label}</option>`).join('')}</select></label></div>
    <div class="kit-text-tool-row"><div class="kit-campaign-text-buttons" role="group" aria-label="Yazı biçimi">${[['bold','Kalın','<b>A</b>',layer.fontWeight>=700],['italic','İtalik','<i>T</i>',layer.fontStyle==='italic'],['underline','Altı çizili','<u>A</u>',deco.includes('underline')],['line-through','Üstü çizili','<s>A</s>',deco.includes('line-through')]].map(([id,label,icon,pressed])=>`<button data-campaign-text-toggle="${id}" aria-label="${label}" title="${label}" aria-pressed="${pressed}"><span aria-hidden="true">${icon}</span></button>`).join('')}</div>
    <div class="kit-text-align" role="group" aria-label="Yazı hizalama">${[['left','Sola hizala','M3 4h14M3 8h8M3 12h14M3 16h8'],['center','Ortala','M3 4h14M6 8h8M3 12h14M6 16h8'],['right','Sağa hizala','M3 4h14M9 8h8M3 12h14M9 16h8']].map(([value,label,d])=>`<button data-campaign-text-align="${value}" aria-label="${label}" title="${label}" aria-pressed="${layer.align===value}"><svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true"><path d="${d}" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></button>`).join('')}</div></div>
    <div class="kit-text-extra-tools"><button data-campaign-text-panel="color" aria-label="Yazı rengini düzenle" title="Yazı rengi" aria-expanded="${textPanel==='color'}"><span class="kit-color-letter" style="border-bottom-color:${engine.resolvedColor(layer.color,theme())}" aria-hidden="true">A</span></button><button data-campaign-text-panel="spacing" aria-label="Aralıklar ve harf biçimi" title="Satır, harf aralığı ve diğer yazı ayarları" aria-expanded="${textPanel==='spacing'}"><svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 5h4m4 0h8M2 15h8m4 0h4M6 2v6m4 4v6M10 2v6m4 4v6" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></button><button data-campaign-text-reset aria-label="Yazı biçimini sıfırla" title="Yazı biçimini sıfırla"><span aria-hidden="true">↶</span></button></div>
    <div class="kit-text-tool-panel" ${textPanel==='color'?'':'hidden'}><label>Yazı rengi HEX veya tema rengi<input data-campaign-color value="${esc(layer.color)}" maxlength="20"></label><small>Özel HEX renk ya da @accent, @text, @surface.</small></div>
    <div class="kit-text-tool-panel" ${textPanel==='spacing'?'':'hidden'}><h4>Aralıklar ve harf biçimi</h4><div class="kit-campaign-numbers">${number('lineHeight','Satır aralığı',layer.lineHeight??1.14,.8,2.5,.05)}${number('letterSpacing','Harf aralığı (%)',Math.round((layer.letterSpacing||0)*100),-8,50)}</div>${select('verticalAlign','Kutuda dikey hizalama',[['top','Üstte'],['middle','Ortada'],['bottom','Altta']],layer.verticalAlign||'top')}${select('textTransform','Harf biçimi',[['none','Yazdığım gibi'],['uppercase','BÜYÜK HARF'],['lowercase','küçük harf']],layer.textTransform||'none')}</div>
    </div><label class="kit-text-entry">Yazı<textarea data-campaign-text maxlength="1200" style="font-family:${esc(engine.campaignFontFamily(layer.font))};font-weight:${layer.fontWeight};font-style:${layer.fontStyle||'normal'}">${esc(layer.text)}</textarea></label><small>Biçim seçili yazı kutusuna uygulanır. Boyut tuvalle birlikte ölçeklenir. Cihazda bulunmayan yazı tipi yedek ailesiyle gösterilir.</small></section>`;
  }
  function renderLayers(){
   const canvas=activeCanvas();controls.replaceChildren();if(!canvas){controls.innerHTML='<h3>Bölüm bilgileri</h3><p>Tuval içeren bir bölüm seçerek yazı, renk ve yerleşim düzenleyebilirsin.</p>';return;}
   layerIndex=Math.min(layerIndex,Math.max(0,canvas.layers.length-1));const layer=canvas.layers[layerIndex];
   controls.innerHTML=`<h3>Tuval öğeleri</h3><p>Negatif konumlar kenar süsü oluşturur. Tuval dışında kalan bölüm kırpılır.</p><button data-campaign-center>Seçili öğeyi ortaya getir</button><label>Öğe<select data-campaign-layer>${canvas.layers.map((item,index)=>`<option value="${index}" ${index===layerIndex?'selected':''}>${esc(item.kind==='text'?item.text.slice(0,32):item.kind==='icon'?(item.iconId||'Özgün dönem simgesi'):item.kind==='image'?'Kampanya görseli':'Dekoratif şekil')}</option>`).join('')}</select></label><label>Tuval zemini<input data-campaign-background value="${esc(canvas.background)}" maxlength="20"></label><label>En / boy oranı<input data-campaign-aspect type="number" min="0.5" max="4" step="0.1" value="${canvas.aspectRatio}"></label>${layer?`${layer.kind==='text'?textFields(layer):''}${layer.kind!=='text'?`<label>Öğe rengi<input data-campaign-color value="${esc(layer.color)}" maxlength="20"></label><small>HEX renk veya @accent, @text, @surface. Tema rengi seçilirse görünüm temayla uyumlu kalır.</small>`:''}<div class="kit-campaign-numbers">${[['x','Yatay · %',-200,200],['y','Dikey · %',-200,200],['width','Genişlik · %',1,200],['height','Yükseklik · %',1,200],['rotate','Açı',-180,180],['opacity','Saydamlık',0,1]].map(([key,label,min,max])=>`<label>${label}<input data-campaign-number="${key}" type="number" min="${min}" max="${max}" step="${key==='opacity'?'.05':'1'}" value="${layer[key]}"></label>`).join('')}</div>`:''}`;
   controls.querySelector('[data-campaign-center]').onclick=()=>{if(layer)mutate(()=>Object.assign(layer,engine.placeCampaignLayer(layer,'center')));};
   controls.querySelector('[data-campaign-layer]').onchange=event=>{layerIndex=Number(event.target.value);renderPreview();renderLayers();};
   controls.querySelector('[data-campaign-background]').onchange=e=>mutate(()=>canvas.background=e.target.value.trim());controls.querySelector('[data-campaign-aspect]').onchange=e=>mutate(()=>canvas.aspectRatio=Number(e.target.value));
   controls.querySelector('[data-campaign-text]')?.addEventListener('change',e=>mutate(()=>layer.text=e.target.value));controls.querySelector('[data-campaign-color]')?.addEventListener('change',e=>mutate(()=>{layer.color=e.target.value.trim();if(layer.kind==='icon')layer.iconColorMode='single';}));
   controls.querySelectorAll('[data-campaign-text-size]').forEach(button=>button.onclick=()=>mutate(()=>layer.fontSize=Math.max(8,Math.min(144,layer.fontSize+Number(button.dataset.campaignTextSize)))));
   controls.querySelectorAll('[data-campaign-text-align]').forEach(button=>button.onclick=()=>mutate(()=>layer.align=button.dataset.campaignTextAlign));
   controls.querySelectorAll('[data-campaign-text-panel]').forEach(button=>button.onclick=()=>{textPanel=textPanel===button.dataset.campaignTextPanel?null:button.dataset.campaignTextPanel;renderLayers();controls.querySelector(`[data-campaign-text-panel="${button.dataset.campaignTextPanel}"]`)?.focus();});
   controls.querySelectorAll('[data-campaign-text-option]').forEach(input=>input.onchange=()=>mutate(()=>layer[input.dataset.campaignTextOption]=input.dataset.campaignTextOption==='fontWeight'?Number(input.value):input.value));
   controls.querySelectorAll('[data-campaign-text-number]').forEach(input=>input.onchange=()=>{if(!input.value.trim()||!input.checkValidity()){input.reportValidity();return;}mutate(()=>layer[input.dataset.campaignTextNumber]=Number(input.value)/(input.dataset.campaignTextNumber==='letterSpacing'?100:1));});
   controls.querySelectorAll('[data-campaign-text-toggle]').forEach(button=>button.onclick=()=>mutate(()=>{const key=button.dataset.campaignTextToggle;
    if(key==='bold')layer.fontWeight=layer.fontWeight>=700?400:700;
    else if(key==='italic')layer.fontStyle=layer.fontStyle==='italic'?'normal':'italic';
    else{const lines=new Set((layer.textDecoration||'none').split(' '));lines.has(key)?lines.delete(key):lines.add(key);layer.textDecoration=['underline','line-through'].filter(line=>lines.has(line)).join(' ')||'none';}
   }));
   const resetText=controls.querySelector('[data-campaign-text-reset]');if(resetText)resetText.onclick=()=>mutate(()=>{Object.assign(layer,engine.CAMPAIGN_TEXT_DEFAULTS);engine.CAMPAIGN_TEXT_OPTIONAL.forEach(key=>delete layer[key]);});
   controls.querySelectorAll('[data-campaign-number]').forEach(input=>input.onchange=()=>mutate(()=>layer[input.dataset.campaignNumber]=Number(input.value)));
  }
  function renderPreview(){
   const canvas=activeCanvas();stage.replaceChildren();if(!canvas){stage.innerHTML='<p>Bu bölümün bilgileri solda; ürün seçimi aşağıdadır.</p>';return;}
   stage.innerHTML=engine.renderCampaignCanvas(canvas,{theme:theme(),visualAssets:root.NovaStoreVisualAssets,motion:false});const surface=stage.firstElementChild;
   canvas.layers.forEach((layer,index)=>{const handle=document.createElement('button');handle.type='button';handle.className='kit-campaign-layer-handle';handle.dataset.campaignLayerHandle=String(index);handle.setAttribute('aria-label',(layer.kind==='text'?layer.text.slice(0,40):layer.id)+' öğesini taşı');handle.setAttribute('aria-pressed',String(index===layerIndex));Object.assign(handle.style,{left:layer.x+'%',top:layer.y+'%',width:layer.width+'%',height:layer.height+'%',transform:`rotate(${layer.rotate}deg)`});surface.append(handle);
    handle.onclick=()=>{layerIndex=index;renderLayers();surface.querySelectorAll('.kit-campaign-layer-handle').forEach((node,i)=>node.setAttribute('aria-pressed',String(i===index)));};
    handle.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();layerIndex=index;mutate(()=>{layer.x=Math.min(engine.CANVAS_GEOMETRY.maxPosition,Math.max(engine.CANVAS_GEOMETRY.minPosition,layer.x+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)));layer.y=Math.min(engine.CANVAS_GEOMETRY.maxPosition,Math.max(engine.CANVAS_GEOMETRY.minPosition,layer.y+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0)));});stage.querySelector(`[data-campaign-layer-handle="${index}"]`)?.focus();};
    handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();layerIndex=index;renderLayers();const box=surface.getBoundingClientRect(),start={x:event.clientX,y:event.clientY,left:layer.x,top:layer.y};handle.setPointerCapture(event.pointerId);
     handle.onpointermove=e=>{layer.x=Math.min(engine.CANVAS_GEOMETRY.maxPosition,Math.max(engine.CANVAS_GEOMETRY.minPosition,start.left+(e.clientX-start.x)/box.width*100));layer.y=Math.min(engine.CANVAS_GEOMETRY.maxPosition,Math.max(engine.CANVAS_GEOMETRY.minPosition,start.top+(e.clientY-start.y)/box.height*100));handle.style.left=layer.x+'%';handle.style.top=layer.y+'%';const visual=surface.querySelector(`[data-campaign-layer="${layer.id}"]`);visual.style.left=layer.x+'%';visual.style.top=layer.y+'%';};
     const end=()=>{handle.onpointermove=handle.onpointerup=handle.onpointercancel=null;try{normalize();render();}catch(error){message(error.message);}};handle.onpointerup=end;handle.onpointercancel=()=>{layer.x=start.left;layer.y=start.top;end();};
    };
   });
  }
  function render(){
   setup.querySelector('[data-campaign-name]').value=draft.name;setup.querySelector('[data-campaign-route]').value=api.targetRoute(draft);setup.querySelector('[data-campaign-placement]').value=draft.campaign?.placement==='prepend'?'prepend':'append';setup.querySelector('[data-campaign-schedule]').value=draft.campaign?.scheduleMode==='none'?'none':'manual';setup.querySelector('[data-campaign-start]').value=draft.campaign?.startsLocal||'';setup.querySelector('[data-campaign-end]').value=draft.campaign?.endsLocal||'';
   setup.querySelector('[data-campaign-block]').innerHTML=draft.blocks.map((block,index)=>`<option value="${index}" ${index===blockIndex?'selected':''}>${index+1}. ${esc(block.title||block.type)}</option>`).join('');const block=activeBlock();setup.querySelector('.kit-campaign-block-fields').innerHTML=`<label>Bölüm başlığı<input data-campaign-title maxlength="200" value="${esc(block.title)}"></label><label>Bölüm açıklaması<textarea data-campaign-description maxlength="10000">${esc(block.description)}</textarea></label>`;setup.querySelector('[data-campaign-title]').onchange=e=>mutate(()=>block.title=e.target.value);setup.querySelector('[data-campaign-description]').onchange=e=>mutate(()=>block.description=e.target.value);
   const layouts=dialog.querySelector('.kit-campaign-layouts');layouts.setAttribute('aria-label','Pakete özel üç kompozisyon');layouts.replaceChildren();if(activeCanvas())variantsFor(draft,block,{theme:theme(),channel:apiChannel()}).forEach((variant,index)=>{const choice=document.createElement('button');choice.type='button';choice.dataset.campaignLayout=variant.id;choice.dataset.campaignVariant=String(index);choice.textContent=variant.label;choice.setAttribute('aria-pressed',String(chosenVariantIndex===index));choice.onclick=()=>mutate(()=>{draft=selectVariant(draft,blockIndex,index,{theme:theme(),channel:apiChannel()});chosenVariantIndex=index;layerIndex=0;});layouts.append(choice);});
   renderPreview();renderLayers();productFields();dialog.querySelector('[data-campaign-remove]').hidden=!selectedId;
  }
  async function open(sectionId){
   if(!canEdit()){notify('Kampanya düzenlemesi için yetkili katalog ve kayıt bağlantısı gerekli. Demo kataloğu kullanılmadı.');return;}
   opener=document.activeElement;selectedId=sectionId||null;products=api.catalog(frame.contentDocument);const recordId=getCurrent().id,openedChannel=getChannel();
   if(host){try{products=await host.campaignCatalog(getCurrent().theme,getChannel());if(!editor.open||getCurrent().id!==recordId||getChannel()!==openedChannel){notify('Önizleme değişti. Kampanyayı bu tasarımda yeniden aç.');return;}}catch(error){notify(error.message);return;}}
   const existing=(getCurrent().campaigns?.[getChannel()]||[]).find(section=>section.id===selectedId);dialog.showModal();
   if(existing){draft=clone(existing);chosenVariantIndex=null;blockIndex=Math.max(0,draft.blocks.findIndex(block=>block.campaignCanvas));layerIndex=0;render();message('Kaydedilmiş özel kompozisyon korunuyor. Yeni bir hazır düzeni yalnız istersen seç.');}else choosePack(dialog.querySelector('[data-campaign-pack]').value);
  }
  button.onclick=()=>open();dialog.querySelector('[data-campaign-pack]').onchange=e=>choosePack(e.target.value);
  setup.querySelector('[data-campaign-name]').onchange=e=>mutate(()=>draft.name=e.target.value);
  setup.querySelector('[data-campaign-route]').onchange=e=>mutate(()=>draft.campaign={...(draft.campaign||engine.defaultCampaign({},apiChannel())),targetPage:e.target.value});setup.querySelector('[data-campaign-placement]').onchange=e=>mutate(()=>draft.campaign={...(draft.campaign||engine.defaultCampaign({},apiChannel())),placement:e.target.value,afterBlockId:''});setup.querySelector('[data-campaign-block]').onchange=e=>{blockIndex=Number(e.target.value);layerIndex=0;render();};
  for(const [selector,key] of [['schedule','scheduleMode'],['start','startsLocal'],['end','endsLocal']])setup.querySelector('[data-campaign-'+selector+']').onchange=e=>mutate(()=>draft.campaign={...(draft.campaign||engine.defaultCampaign({},apiChannel())),[key]:e.target.value});
  setup.querySelector('[data-campaign-import]').onchange=async event=>{try{const file=event.target.files?.[0];if(!file)return;if(file.size>8_000_000)throw Error('Studio paketi en fazla 8 MB olabilir.');const parsed=engine.parseCampaignPackage(await file.text()),section=engine.toPortableSection({id:selectedId||crypto.randomUUID(),...parsed.package,campaign:{...(parsed.package.campaign||engine.defaultCampaign({},apiChannel())),channels:[apiChannel()]}},apiChannel()),filtered=api.permittedProducts(section,products);draft=filtered.section;chosenVariantIndex=null;const remappedTarget=!['home','catalog','product','favorites','account','cart','help'].includes(api.targetRoute(draft));if(remappedTarget)draft.campaign.targetPage='home';blockIndex=Math.max(0,draft.blocks.findIndex(block=>block.campaignCanvas));layerIndex=0;normalize();render();message((remappedTarget?'Paketin hedef sayfası bu demoda yok; Ana sayfaya alındı. ':'')+(filtered.removed||filtered.needsSelection?`${filtered.removed} başka katalog ürün kimliği çıkarıldı. Ürün bölümünden bu temanın ürünlerini seç.`:`Studio paketi ${getChannel()==='app'?'uygulama':'web'} kanalına alındı. Ürün seçimini gözden geçir.`));}catch(error){message(error.message);}finally{event.target.value='';}};
  dialog.querySelector('[data-campaign-apply]').onclick=()=>{try{normalize();const result=api.permittedProducts(draft,products);if(result.removed)throw Error('Seçilen ürün artık bu katalogda yok. Ürün seçimini yenile.');if(commit(item=>{item.campaigns??={web:[],app:[]};const list=item.campaigns[getChannel()],index=list.findIndex(section=>section.id===draft.id);if(index<0)list.push(clone(draft));else list[index]=clone(draft);})) {dialog.close();apply();notify('Kampanya tema çalışma kopyasına kaydedildi. Henüz yayımlanmadı.');}}catch(error){message(error.message);}};
  dialog.querySelector('[data-campaign-remove]').onclick=()=>{if(commit(item=>{item.campaigns[getChannel()]=item.campaigns[getChannel()].filter(section=>section.id!==selectedId);})){dialog.close();apply();notify('Kampanya bu tema kopyasından kaldırıldı. Geri al ile dönebilirsin.');}};
  for(const selector of ['[data-campaign-close]','[data-campaign-cancel]'])dialog.querySelector(selector).onclick=()=>dialog.close();dialog.addEventListener('close',()=>opener?.focus());
  return {open,handleSelection(target){const section=target.closest('[data-kit-campaign]');if(!section)return false;open(section.dataset.kitCampaign);return true;},apply(){if(!getCurrent()||!frame.contentDocument?.body)return;api.renderSections(frame.contentDocument,getCurrent().campaigns?.[getChannel()]||[],frame.contentWindow.location.hash,{preview:true,channel:getChannel()});},dispose(){dialog.remove();button.remove();}};
 }
 root.NovaStoreGalleryCampaignEditor=Object.freeze({mount,variantsFor,createReadySection,selectVariant});
})(globalThis);
