import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVariantMediaContract, resolveVariantGallery, safeVariantMediaUrl, galleryIdentity } from "../src/adapters/variantMedia.js";
import { normalizePurchasableVariants } from "../src/adapters/variantContract.js";
import { createVariantMatrix, resolveVariantSelection } from "../src/adapters/variantMatrix.js";
const selections=(finish,size)=>[{group:"Finish",value:finish},{group:"Length",value:size}];
const variants=normalizePurchasableVariants([1,2,3].map(id=>({id,sku:"opaque",price:100+id,availableStock:4,purchasable:true,selections:selections(id===3?"Gloss":"Matte",id===2?"Long":"Short")})));
const media=[1,2,3,4].map(id=>({id,media_url:`/uploads/local-products/asset-${id}.webp`,media_type:"image",sort_order:id,is_main:id===1}));
const defaults=media.map(row=>({id:String(row.id),url:row.media_url,type:"image"}));
const raw=()=>({version:1,media_driver_option_group:"Finish",option_value_media:[{value:"Matte",media:[media[1],media[2]]}],variant_media:[{variant_id:2,media:[media[3]]}]});
const product=(input=raw())=>({variants,media:defaults,variantMedia:normalizeVariantMediaContract(input,variants,defaults)});
test("R30 precedence uses canonical full row; partial driver has no purchase authority",()=>{
  const p=product(),choices=[{group:"Finish",value:"Matte"}],matrix=createVariantMatrix(variants);
  assert.equal(resolveVariantGallery(p).source,"product_default");
  assert.equal(resolveVariantGallery(p,[{group:"Length",value:"Long"}]).source,"product_default");
  assert.equal(resolveVariantGallery(p,choices).source,"driver_option_value");
  assert.equal(resolveVariantSelection(matrix,choices).variant,null);
  assert.equal(resolveVariantGallery(p,variants[1].selections,variants[1]).source,"exact_variant");
  assert.equal(resolveVariantGallery(p,choices,variants[1]).source,"driver_option_value");
  assert.equal(resolveVariantGallery(p,variants[1].selections,{...variants[1]}).source,"driver_option_value");
  assert.equal(resolveVariantGallery(p,variants[0].selections,variants[0]).source,"driver_option_value");
  assert.equal(resolveVariantGallery(p,variants[2].selections,variants[2]).source,"product_default");
});
test("R30 fresh removal restores precedence and same gallery keeps stable identity",()=>{
  const r=raw();r.variant_media=[];const p=product(r);
  const a=resolveVariantGallery(p,variants[0].selections,variants[0]);
  const b=resolveVariantGallery(p,variants[1].selections,variants[1]);
  assert.equal(a.key,b.key);assert.equal(b.source,"driver_option_value");
  assert.notEqual(galleryIdentity([...a.media].reverse()),a.key);
});
test("R30 unowned IDs, mismatched URL, descriptive driver and duplicate targets fail closed",()=>{
  const r=raw();r.media_driver_option_group="IPS panel";r.variant_media.push({variant_id:999,media:[media[0]]});
  let p=product(r);assert.equal(p.variantMedia.driverGroup,null);assert.equal(p.variantMedia.optionValues.length,0);assert.equal(p.variantMedia.variants.length,1);
  const d=raw();d.option_value_media.push({...d.option_value_media[0]});d.variant_media[0].media=[{...media[0],media_url:media[1].media_url}];
  p=product(d);assert.equal(p.variantMedia.optionValues.length,0);assert.equal(p.variantMedia.variants.length,0);
  assert.equal(resolveVariantGallery(p,variants[1].selections,variants[1]).source,"product_default");
});
test("R30 origins reject executable, credentialed, traversing and arbitrary remote URLs",()=>{
  for(const value of ["javascript:alert(1)","data:image/svg+xml,<svg/>","file:///x","//evil.invalid/a","https://evil.invalid/a.webp","https://res.cloudinary.com.evil.invalid/a/image/upload/a.jpg","https://user@res.cloudinary.com/a/image/upload/a.jpg","https://res.cloudinary.com:444/a/image/upload/a.jpg","https://res.cloudinary.com/a/image/upload/a.jpg?signature=secret","https://res.cloudinary.com/a/image/upload/%252e%252e%2fsecret","/uploads/local-products/../secret"])
    assert.equal(safeVariantMediaUrl(value),null,value);
  assert.equal(safeVariantMediaUrl(media[0].media_url),media[0].media_url);
  assert.equal(safeVariantMediaUrl("https://res.cloudinary.com/account/image/upload/v123/a.webp"),"https://res.cloudinary.com/account/image/upload/v123/a.webp");
});
test("R30 simple and legacy products stay product-default without implicit driver",()=>{
  assert.equal(normalizeVariantMediaContract(null,variants,defaults),null);
  assert.equal(resolveVariantGallery({media:defaults,variants:[]}).media,defaults);
  assert.equal(normalizeVariantMediaContract(raw(),[],defaults).driverGroup,null);
});
