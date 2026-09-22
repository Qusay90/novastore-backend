import React, {useState} from 'react';
import {ArrowDown,ArrowUp,Search,X} from 'lucide-react';
import {getDocumentCatalog,getKnownDocumentCatalog} from '../store.js';
import {Select} from './Controls.jsx';

export default function ProductSource({block,document,channel,updateBlock}) {
  const [search,setSearch]=useState('');
  const source=block.productSource||{mode:'all',categoryId:'',productIds:[]};
  const active=getDocumentCatalog(document,channel);
  const catalog=active.products.map(product=>({...product,id:String(product.id)}));
  const groups=active.categories;
  const selected=(source.productIds||[]).map(String);
  const hasSector=groups.some(category=>category.id.startsWith('sector-'));
  const known=getKnownDocumentCatalog(channel);
  const legacyCategory=source.categoryId&&!groups.some(category=>category.id===source.categoryId)&&!(channel==='android'&&!hasSector&&source.categoryId==='market')?[{value:source.categoryId,label:`Korunan kategori · ${known.categories.find(category=>category.id===source.categoryId)?.name||source.categoryId}`}]:[];
  const patch=value=>updateBlock('productSource',{...source,...value});
  const matches=catalog.filter(p=>`${p.name} ${p.brand||''}`.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')));
  return <div className="sp-product-picker"><Select label="Ürün seçkisi" value={source.mode} options={[{value:'all',label:'Tüm ürünler'},{value:'category',label:'Kategoriye göre'},{value:'selected',label:'Ürünleri kendim seçeceğim'}]} onChange={mode=>patch({mode})}/>
    {source.mode==='category'&&<Select label="Seçki kategorisi" value={source.categoryId} options={[{value:'',label:'Kategori seç'},...groups.map(c=>({value:c.id,label:c.name})),...(channel==='android'&&!hasSector?[{value:'market',label:'Süpermarket'}]:[]),...legacyCategory]} onChange={categoryId=>patch({categoryId})}/>}
    {source.mode==='selected'&&<><p className="sp-hint">{selected.length}/24 ürün · Ürünler buradaki sırayla gösterilir.</p><ol className="sp-curated-list">{selected.map((id,index)=><li key={id}><span>{catalog.find(p=>p.id===id)?.name||(known.products.find(p=>String(p.id)===id)?`${known.products.find(p=>String(p.id)===id).name} · Bu tasarımda gösterilmez`:'Katalogda bulunamayan ürün')}</span><button aria-label={`${index+1}. ürünü yukarı taşı`} disabled={index===0} onClick={()=>{const ids=[...selected];[ids[index-1],ids[index]]=[ids[index],ids[index-1]];patch({productIds:ids});}}><ArrowUp size={12}/></button><button aria-label={`${index+1}. ürünü aşağı taşı`} disabled={index===selected.length-1} onClick={()=>{const ids=[...selected];[ids[index+1],ids[index]]=[ids[index],ids[index+1]];patch({productIds:ids});}}><ArrowDown size={12}/></button><button aria-label={`${index+1}. ürünü seçkiden çıkar`} onClick={()=>patch({productIds:selected.filter(value=>value!==id)})}><X size={12}/></button></li>)}</ol><label className="sp-search"><Search size={14}/><input aria-label="Seçkiye ürün bul" placeholder="Ürün veya marka ara…" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="sp-product-picker-results">{matches.map(product=><label key={product.id}><input type="checkbox" checked={selected.includes(product.id)} disabled={!selected.includes(product.id)&&selected.length>=24} onChange={e=>patch({productIds:e.target.checked?[...selected,product.id]:selected.filter(id=>id!==product.id)})}/><span>{product.name}</span></label>)}{!matches.length&&<p className="sp-hint">Eşleşen ürün bulunamadı.</p>}</div></>}
    {source.mode!=='all'&&<p className="sp-hint">Bu seçim ürün rafını belirler. Aşağıdaki bağlantı, bölüm düğmesinin gideceği sayfadır. Yalnız deneme kataloğundaki ürünler kullanılır.</p>}
  </div>;
}
