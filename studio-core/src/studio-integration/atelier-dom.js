import {classicTargetURL, themeTokens} from './theme-kit-adapter.js';
import {selectedProductFacts, canQuoteProduct} from './theme-kit-product.js';

export function applyAtelierDocument(root, document, assetURL, catalog = {products:[], categories:[]}) {
  const vars = themeTokens(document);
  // Atelier's original serif display and sans-serif body remain distinct.
  if (document.theme.fontFamily === 'Georgia') vars['--body-font'] = 'Arial,Helvetica,sans-serif';
  for (const [key, value] of Object.entries(vars)) {
    root.documentElement.style.setProperty(key, value);
    root.body.style.setProperty(key, value);
  }
  const mark = (selector, id) => root.querySelectorAll(selector).forEach(node => node.setAttribute('data-visual-element', id));
  for (const [selector, id] of [['.site-header','header'],['.site-header .brand','logo'],['.search-form','search'],
    ['.search-form button','searchButton'],['.header-collection','nav'],['.site-footer','footer'],
    ['.card-fashion','productCard'],['.card-fashion .product-visual','productImage'],['.card-fashion h3','productTitle'],
    ['.card-fashion .price','productPrice'],['.card-fashion .add-button','addButton'],['.detail-image','productGallery'],['.detail-info','productInfo']]) mark(selector,id);
  root.querySelectorAll('.detail-layout,.story-product,.visual-categories,.card-fashion').forEach(node => node.setAttribute('data-canonical-content','true'));
  const header=root.querySelector('.site-header'), footer=root.querySelector('.site-footer');
  for(const [node, visible, chrome] of [[header,document.design.header,document.chrome.header],[footer,document.design.footer,document.chrome.footer]]) if(node){node.hidden=!visible;node.style.background=chrome.background;node.style.color=chrome.textColor;}
  root.querySelectorAll('.header-collection').forEach(node=>{node.hidden=!document.design.navigation;});
  root.querySelectorAll('.search-form').forEach(node=>{node.hidden=!document.chrome.header.showSearch;});
  const logo=document.design.elements.find(item=>item.id==='logoImage')?.content;
  root.querySelectorAll('.site-header .brand,.site-footer .brand').forEach(node=>{
    node.textContent=document.chrome.header.logoText;
    if(logo?.imageUrl){const image=root.createElement('img');image.src=assetURL(logo.imageUrl);image.alt=logo.alt||document.chrome.header.logoText;image.style.maxWidth='180px';image.style.maxHeight='64px';image.setAttribute('data-visual-element','logoImage');node.prepend(image);}
  });
  for(const [id, selector, title, description] of [
    ['atelier-hero','.campaign-editorial','.campaign-copy h1','.campaign-copy p'],
    ['atelier-products','.featured-section','h2',null],
    ['atelier-categories','.visual-categories',null,null],
    ['atelier-story','.collection-story','h2','p']
  ]){
    const block=document.blocks.find(item=>item.id===id),node=root.querySelector(selector);
    if(!node)continue;node.setAttribute('data-module-id',id);node.hidden=!block||block.enabled===false;if(!block)continue;
    if(title&&node.querySelector(title))node.querySelector(title).textContent=block.title;
    if(description&&node.querySelector(description))node.querySelector(description).textContent=block.description;
    if(id==='atelier-hero'){
      const image=node.querySelector('.campaign-photo'),link=node.querySelector('.hero-actions .button');
      if(image){const source=assetURL(block.image);image.hidden=!source;if(source)image.src=source;else image.removeAttribute('src');image.alt=block.alt||'Nova Store koleksiyon kampanyası';}
      if(link){const target=classicTargetURL(block.target,catalog);if(target)link.href=target;else link.removeAttribute('href');link.textContent=block.buttonText||'Koleksiyona bak';}
      const kicker=node.querySelector('.eyebrow');if(kicker)kicker.textContent='NOVA STORE ATELIER';
    }
  }
  // Keep the original complete footer; replace demo assertions with truthful
  // preview copy. Real legal/contact records are supplied separately by the host.
  const footerTag=footer?.querySelector('.footer-brand>span');if(footerTag)footerTag.textContent='Mağaza tasarımı önizlemesi';
  const orderLink=footer?.querySelector('a[href="#/orders"]');if(orderLink)orderLink.textContent='Siparişlerim';
  const bottom=footer?.querySelector('.footer-bottom');if(bottom){const spans=bottom.querySelectorAll('span');if(spans[0])spans[0].textContent='Nova Store';if(spans[1])spans[1].textContent='Salt okunur önizleme';const privacy=bottom.querySelector('[data-action="privacy-info"]');if(privacy){privacy.textContent='Mağaza koşulları';privacy.disabled=true;privacy.title='Yayınlanan hukuki içerikler bağlantı tamamlandığında gösterilir.';}}
}

export function createAtelierProductBinder({root,host,channel,onError=()=>{}}){
  let generation=0,cleanup=()=>{};
  const element=(tag,text,className)=>{const node=root.createElement(tag);if(text!==undefined)node.textContent=String(text);if(className)node.className=className;return node;};
  const money=value=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(value);
  return {
    dispose(){generation++;cleanup();},
    async render(productId){
      const request=++generation;cleanup();let closed=false,quoteSequence=0;
      cleanup=()=>{closed=true;quoteSequence++;};const active=()=>!closed&&request===generation;
      try{
        const data=await host.ports.loadProduct({channel,productId});if(!active())return;
        const p=data.product,info=root.querySelector('.detail-info'),form=root.querySelector('#product-form');
        if(!info||!form||String(p.id)!==String(productId))return;
        info.querySelector('h1').textContent=p.name;
        info.querySelector('.detail-desc').textContent=p.description||'';
        const rating=info.querySelector('.detail-rating');if(rating)rating.textContent=`${p.average_rating} / 5 · ${p.review_count} değerlendirme`;
        form.querySelector('.variant-fieldset')?.remove();
        const label=element('label','Ürün seçeneği','field'),select=element('select');select.setAttribute('aria-label','Ürün seçeneği');
        const addOption=(label,value)=>{const option=element('option',label);option.value=value;select.append(option);return option;};
        addOption('Seçenek seçin','');
        for(const variant of p.variants||[]){const option=addOption(`${variant.selections.map(s=>`${s.group}: ${s.value}`).join(' · ')} · ${money(variant.price)} · ${variant.availableStock} adet`,String(variant.id));option.disabled=!variant.purchasable;}
        if(p.variant_selection_required){label.append(select);form.prepend(label);}
        const quantityLabel=element('label','Adet','field'),quantity=element('input');quantity.type='number';quantity.name='quantity';quantity.min='1';quantity.step='1';quantity.value='1';quantity.setAttribute('aria-label','Adet');quantityLabel.append(quantity);form.prepend(quantityLabel);
        const details=info.querySelector('.details-list');if(details){details.replaceChildren();const section=element('details');section.open=true;section.append(element('summary','Ürün bilgileri'),element('p',p.description||''));const delivery=element('details');delivery.append(element('summary','Teslimat ve iade'),element('p',host.commerce?.store?.shipping_summary||'Teslimat özeti henüz tanımlanmamış.'),element('p',host.commerce?.store?.return_summary||'İade özeti henüz tanımlanmamış.'));details.append(section,delivery);}
        info.querySelectorAll(':scope > .stock-line').forEach(node=>{node.textContent=host.commerce?.store?.shipping_summary||'Teslimat bilgisi henüz tanımlanmamış.';});
        const reviews=element('section',undefined,'details-list');reviews.setAttribute('data-canonical-content','true');reviews.append(element('h2','Müşteri değerlendirmeleri'));for(const review of data.reviews||[]){const article=element('article',undefined,'profile-card');article.append(element('strong',`${review.full_name} · ${review.rating} / 5`),element('p',review.comment));reviews.append(article);}if(!(data.reviews||[]).length)reviews.append(element('p','Yayımlanmış değerlendirme bulunmuyor.'));
        reviews.append(element('h2','Soru ve cevap'));for(const q of data.questions||[]){const article=element('article',undefined,'profile-card');article.append(element('strong',q.user_name),element('p',q.question),element('p',q.answer));reviews.append(article);}if(!(data.questions||[]).length)reviews.append(element('p','Yanıtlanmış soru bulunmuyor.'));info.append(reviews);
        const images=[p.image_url,...(p.media||[]).map(item=>item.media_url)].filter((url,index,list)=>url&&list.indexOf(url)===index),main=root.querySelector('.detail-image img'),tabs=root.querySelector('.gallery-tabs');
        if(main&&images[0]){main.src=images[0];main.alt=p.name;}if(tabs){tabs.replaceChildren();images.forEach((url,index)=>{const button=element('button',`${index+1}. görsel`);button.type='button';button.setAttribute('aria-pressed',String(index===0));button.onclick=()=>{if(active()&&main){main.src=url;tabs.querySelectorAll('button').forEach(node=>node.setAttribute('aria-pressed',String(node===button)));}};tabs.append(button);});}
        const couponLabel=element('label','Kupon','field'),coupon=element('input');coupon.maxLength=80;coupon.setAttribute('aria-label','Kupon kodu');couponLabel.append(coupon);
        const calculate=element('button','Sepet tutarını hesapla','button'),output=element('section',undefined,'summary-card');calculate.type='button';output.setAttribute('aria-live','polite');form.append(couponLabel,calculate,element('p','Salt okunur önizleme: stok ayrılmaz, sipariş veya ödeme oluşturulmaz.','muted'),output);
        let pending=false;const valid=()=>canQuoteProduct(p,select.value,Number(quantity.value));
        const update=()=>{quoteSequence++;pending=false;output.replaceChildren();calculate.disabled=!valid();const facts=selectedProductFacts(p,select.value),price=info.querySelector('.detail-price');if(price){price.replaceChildren(element('span',money(facts.price),'price'));if(facts.oldPrice!==null)price.append(element('span',money(facts.oldPrice),'old-price'));}const stock=form.querySelector('.stock-line');if(stock)stock.textContent=facts.requiresSelection?'Fiyat ve stok için ürün seçeneğini seçin.':`${facts.stock} adet stokta`;quantity.max=String(facts.maxQuantity);};
        select.onchange=update;quantity.oninput=update;coupon.oninput=update;update();
        calculate.onclick=async()=>{if(!active()||pending||!valid())return;const sequence=++quoteSequence,facts=selectedProductFacts(p,select.value);pending=true;calculate.disabled=true;output.replaceChildren(element('p','Sunucu hesabı hazırlanıyor…'));try{const quote=await host.ports.quote({channel,body:{items:[{productId:p.id,...(facts.variant?{variantId:facts.variant.id}:{}),quantity:Number(quantity.value)}],...(coupon.value.trim()?{couponCode:coupon.value.trim()}:{})}});if(!active()||sequence!==quoteSequence)return;output.replaceChildren(element('h3','Sunucudan hesaplanan sepet'));for(const [key,label]of Object.entries({subtotal:'Ürünler toplamı',bundleDiscount:'Kampanya indirimi',couponDiscount:'Kupon indirimi',shippingFee:'Teslimat',total:'Toplam'}))if(Object.hasOwn(quote.totals,key))output.append(element('p',`${label}: ${money(quote.totals[key])}`));}catch(error){if(active()&&sequence===quoteSequence)output.replaceChildren(element('p',error.message));}finally{if(active()&&sequence===quoteSequence){pending=false;calculate.disabled=!valid();}}};
      }catch(error){if(active())onError(error.message);}
    }
  };
}
