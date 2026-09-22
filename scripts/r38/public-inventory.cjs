'use strict';
// Explicit public GET/HEAD inventory; never uses credentials or mutating requests.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const origin = 'https://novastore.tr';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
async function get(route) {
  const response = await fetch(origin + route, { method: 'GET', credentials: 'omit', headers: {'Cache-Control':'no-cache'}, redirect: 'error', signal: AbortSignal.timeout(30000) });
  const body = await response.text();
  let value; try { value = JSON.parse(body); } catch { value = null; }
  return { route, status: response.status, contentType: response.headers.get('content-type'), sha256: sha(body), value };
}
async function main() {
  const routes = ['/api/products', '/api/products?pagination=cursor&limit=1', '/api/products?q=Karaca', '/api/public/categories', '/api/categories', '/api/public/navigation/main', '/api/public/collections'];
  const responses = await Promise.all(routes.map(get));
  const products = responses[0].value;
  if (!Array.isArray(products)) throw new Error('Live legacy shape changed: re-inventory before proceeding');
  const details = await Promise.all(products.map(product => get(`/api/products/${Number(product.id)}`)));
  const imageUrls = [...new Set(details.flatMap(({value}) => [value?.image_url, ...(value?.media || []).map(item=>item.media_url)]).filter(Boolean))];
  const images = await Promise.all(imageUrls.map(async url => {
    const response = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(30000) });
    return {url, status:response.status, contentType:response.headers.get('content-type')};
  }));
  const unsafeNames = products.filter(product => /\b(?:test|fixture|localhost|r\d{2}|qa|deneme)\b/i.test(product.name));
  const collectionListing = responses.find(entry=>entry.route==='/api/public/collections');
  if (collectionListing.status!==200 || !Array.isArray(collectionListing.value)) throw new Error('Public collection listing cannot be verified');
  const malformedCollections = collectionListing.value.filter(collection=>collection.id===1 || collection.slug==='dfghjkls'
    || /\b(?:test|fixture|localhost|r\d{2}|qa|deneme)\b|dfgh|lorem ipsum/i.test(collection.name || '')
    || [collection.image_url,collection.banner_url].filter(Boolean).some(url=>!/^https:\/\/|^\/(?!\/)/i.test(url)));
  const removedCollection = await get('/api/public/collections/dfghjkls');
  if (malformedCollections.length || removedCollection.status!==404 || removedCollection.value?.code!=='COLLECTION_NOT_PUBLIC') throw new Error('STOP: production catalog blocker changed');
  if (unsafeNames.length || products.length!==8 || details.some(entry=>entry.status!==200) || images.some(entry=>entry.status!==200)) throw new Error('STOP: production catalog changed; owner reassessment required');
  const result = {observedAt:new Date().toISOString(), origin, authenticated:false, methods:['GET','HEAD'], productionWrites:0, catalogBlockerRecheck:'PASS', additionalCatalogBlockerCount:0, removedCollection, responses, details, images, unsafeProductIds:unsafeNames.map(product=>product.id)};
  const out = path.join(root,'artifacts/r38-r1'); fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'live-public-inventory.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({products:products.length, statuses:responses.map(({route,status,value})=>({route,status,shape:Array.isArray(value)?'array':typeof value,count:Array.isArray(value)?value.length:undefined})), images:images.length, failedImages:images.filter(x=>x.status!==200), unsafeProductIds:result.unsafeProductIds}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
