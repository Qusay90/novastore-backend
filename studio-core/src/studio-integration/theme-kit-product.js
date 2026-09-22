// All values remain canonical DTO values; variant parents never lend discounts
// to differently priced options.
export function selectedProductFacts(product,variantId=''){
 const variant=(product.variants||[]).find(item=>String(item.id)===String(variantId));
 const price=variant?.price??product.price,stock=variant?.availableStock??product.stock;
 const previous=variant?variant.old_price:product.old_price;
 return {variant,price,stock,oldPrice:typeof previous==='number'&&previous>price?previous:null,maxQuantity:Math.min(20,Math.max(0,Number.isSafeInteger(stock)?stock:0)),requiresSelection:!!product.variant_selection_required&&!variant};
}
export function canQuoteProduct(product,variantId,quantity){const facts=selectedProductFacts(product,variantId);return Number.isSafeInteger(quantity)&&quantity>=1&&quantity<=facts.maxQuantity&&!facts.requiresSelection&&(!facts.variant||facts.variant.purchasable===true);}
