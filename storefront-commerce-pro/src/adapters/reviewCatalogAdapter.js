import { createCatalogAdapter } from './catalogAdapter.js';
import { normalizePagination } from './publicPagination.js';
import { normalizeSearchText } from '../searchText.js';
import release from '../../../config/publicReviewRelease.json' with { type: 'json' };

export const verifiedLegacyAuthority = authority => authority?.contract === 'unbounded-public-array'
  && authority.sourceCommit === release.legacyBaseCommit;

export const legacyDescriptionText = value => String(value || '')
  .replace(/<!--[^]*?-->|<(script|style)\b[^>]*>[^]*?<\/\1>/gi,'')
  .replace(/<br\s*\/?>|<\/(?:p|div|li)>/gi,'\n')
  .replace(/<\/?[a-z][^>]*>/gi,'')
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[entity])
  .trim();

const validateProducts = items => {
  const ids = new Set();
  for (const product of items) {
    const id = product?.id;
    const validId = (typeof id === 'number' || (typeof id === 'string' && /^[1-9]\d*$/.test(id)))
      && Number.isSafeInteger(Number(id)) && Number(id) > 0;
    if (!product || Array.isArray(product) || !validId || ids.has(Number(id))
      || typeof product.name !== 'string' || !product.name.trim()) {
      throw new Error('Ürün yanıtı doğrulanamadı.');
    }
    ids.add(Number(id));
  }
};

// Valid only for the sealed legacy base whose public SELECT has no LIMIT.
// Unknown/bounded arrays cannot be treated as a complete marketplace.
export function classifyReviewProductResponse(payload, { legacyAuthority = null, query = {} } = {}) {
  if (Array.isArray(payload)) {
    if (!verifiedLegacyAuthority(legacyAuthority) || Object.hasOwn(query, 'cursor')) throw new Error('Katalog kapsamı doğrulanamadı.');
    validateProducts(payload);
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Katalog sayfa sınırı doğrulanamadı.');
    const q = normalizeSearchText(query.q || '');
    const items = q ? payload.filter(product => normalizeSearchText([product.name, product.description, product.brand, ...(Array.isArray(product.categories) ? product.categories : [])].join(' ')).includes(q)) : payload;
    return { items, limit, hasMore:false, nextCursor:null,
      responseShape:'legacy-array', completeness:'verified-unbounded-legacy-query' };
  }
  if (!payload || !Array.isArray(payload.items)) throw new Error('Katalog yanıtı doğrulanamadı.');
  const pagination = normalizePagination(payload);
  validateProducts(payload.items);
  if (payload.items.length > pagination.limit || (pagination.hasMore && !payload.items.length)) throw new Error('Katalog sayfa sınırı doğrulanamadı.');
  return {...payload, ...pagination, responseShape:'cursor-envelope', completeness:'server-pagination'};
}

export function createReviewCatalogAdapter(http, {legacyAuthority=null}={}) {
  const request = async (route, options) => {
    const payload = await http.request(route, options);
    if (/^\/api\/products(?:\?|$)/.test(route)) {
      const query = Object.fromEntries(new URLSearchParams(route.split('?')[1] || ''));
      return classifyReviewProductResponse(payload, {legacyAuthority, query});
    }
    return payload;
  };
  const base = createCatalogAdapter({request});
  const normalizeProduct = product => {
    const legacySimpleProduct = product.legacySimpleProduct === true || product.variantContractLoaded !== true;
    return Object.freeze({...product,
    description:legacyDescriptionText(product.description),
    // Absence of the canonical contract is simple-product truth in this release.
    variantContractLoaded:true, legacySimpleProduct,
    // Descriptive attributes remain in features; they are not purchase options.
    ...(legacySimpleProduct ? {color:null,storage:null,variants:Object.freeze([]),variantSelectionRequired:false,variantMedia:null} : {}),
    // This exact review authority has no public Store DTO/route.
    store:null,
  });};
  return Object.freeze({
    ...base,
    load:async options=>{const catalog=await base.load(options);return Object.freeze({...catalog,products:Object.freeze(catalog.products.map(normalizeProduct))});},
    loadProduct:async (...args)=>normalizeProduct(await base.loadProduct(...args)),
    loadPage:async options=>{const page=await base.loadPage(options);return {...page,items:page.items.map(normalizeProduct)};},
    loadCollection:async (...args)=>{const result=await base.loadCollection(...args);return {...result,products:result.products.map(normalizeProduct)};},
  });
}
