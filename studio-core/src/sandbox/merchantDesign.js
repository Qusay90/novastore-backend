import {getCurrentMerchant,isUnknownMerchant} from './merchantWorkspaces.js';
import {getSectorCatalog} from './sectorCatalog.js';

export function resolveCatalogFamily(document) {
  return getCurrentMerchant()?.catalogFamily || (isUnknownMerchant() ? '__missing__' : document?.theme?.family);
}

// A theme changes presentation. A merchant's catalogue is owned by its workspace.
export function adaptMerchantDemo(document, channel='web') {
  const merchant=getCurrentMerchant();
  if(!merchant)return document;
  const catalog=getSectorCatalog(merchant.catalogFamily);
  const next=JSON.parse(JSON.stringify(document));
  const categories=new Set(catalog.categories.map(item=>item.id));
  const productIds=new Set(catalog.products.map(item=>String(item.id)));
  next.menus=catalog.categories.map(item=>({id:item.id,label:item.name,target:`category:${item.id}`,enabled:true}));
  next.chrome.header.logoText="Nova Store";
  next.chrome.header.tagline=`${catalog.name} seçkisi`;
  next.chrome.header.announcement=`Nova Store · Kendi seçkini keşfet`;
  next.chrome.footer.description=`Nova Store mağazasının ${catalog.name.toLocaleLowerCase('tr-TR')} seçkisi.`;
  next.chrome.footer.columns=[{id:'shop-collections',title:'Koleksiyonlar',links:next.menus.map(item=>({...item}))},{id:'shop-help',title:'Alışverişin',links:[{id:'account',label:'Hesabım',target:'account',enabled:true},{id:'cart',label:'Sepetim',target:'cart',enabled:true},{id:'help',label:'Yardım',target:'support',enabled:true}]}];
  next.blocks.forEach((block,index)=>{
    for(const key of ['target','secondaryTarget'])if(/^(category|product|android-product|android-category):/.test(block[key]||'')){
      const id=block[key].split(':')[1];
      if(!categories.has(id)&&!productIds.has(id))block[key]='categories';
    }
    if(block.type==='products'){
      block.title=index===2?'Mağazanın seçkisi':'Keşfetmeye devam et';
      block.productSource={mode:'all',categoryId:'',productIds:[]};
    }
    if(['hero','editorial','banner'].includes(block.type)){
      const product=catalog.products[index%catalog.products.length];
      block.image=product.imageUrl;block.mobileImage=product.imageUrl;block.alt=product.name;
      block.kicker="Nova Store";block.description=`${catalog.name} koleksiyonunu yakından keşfet.`;
      block.title=block.type==='hero'?`Nova Store.\nSenin seçkin.`:'Sana eşlik eden detaylar.';
      block.showCopy=true;block.target='categories';block.buttonText='Koleksiyonu keşfet';
    }
  });
  return next;
}
