// Server projections own identity, visibility, prices, stock and media. Only naming changes here.
export function nativeCatalog(input={}) {
  const categories=(input.categories||[]).map(row=>({...row,id:String(row.id),parentId:row.parent_id===null?null:String(row.parent_id),imageUrl:row.image_url,descendantVisibleProductCount:Number(row.product_count),sortOrder:row.sort_order||0}));
  const byId=new Map(categories.map(row=>[row.id,row]));
  const path=(row,visited=new Set())=>{if(visited.has(row.id))throw Error('Geçersiz kategori ağacı.');visited.add(row.id);const parent=byId.get(row.parentId);return [...(parent?path(parent,visited):[]),row.slug].join('/');};
  categories.forEach(row=>{row.path=path(row);row.canonicalPath=row.path;});
  const products=(input.products||[]).map(row=>{
    if(typeof row.price!=='number'||!Number.isFinite(row.price)||row.price<0||!Number.isInteger(row.stock)||row.stock<0)throw Error('Ürün fiyatı veya stok sunucu tarafından doğrulanmadı.');
    return {...row,oldPrice:row.old_price,imageUrl:row.image_url,rating:row.average_rating,reviews:row.review_count,categoryId:row.category_id===undefined?null:String(row.category_id),categoryIds:(row.category_ids||[]).map(String),media:(row.media||[]).map(media=>({...media,type:media.media_type,url:media.media_url,isMain:media.is_main,sortOrder:media.sort_order,cardFraming:media.card_framing}))};
  });
  return {products,categories,collections:input.collections||[]};
}
