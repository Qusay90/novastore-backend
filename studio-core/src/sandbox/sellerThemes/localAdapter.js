import {listMerchants,getMerchant} from '../merchantWorkspaces.js';
import {getSectorCatalog} from '../sectorCatalog.js';
import {decimalToMinor} from './model.js';
export const LOCAL_OFFER_SCOPE=Object.freeze({tenantId:'local-demo',storeId:'studio-demo'});
export function localRecipients(){return listMerchants().map(m=>({tenantId:'local-demo',sellerId:m.id,storeId:m.id,name:m.name}));}
export function localCatalog(recipient){const merchant=getMerchant(recipient.storeId);if(!merchant||merchant.id!==recipient.sellerId||recipient.tenantId!=='local-demo')throw new Error('Yerel mağaza bulunamadı.');return (getSectorCatalog(merchant.catalogFamily)?.products||[]).map(p=>({id:`demo:${merchant.id}:${p.id}`,name:p.name,scope:{...recipient},priceMinor:decimalToMinor(String(p.price)),currency:'TRY',stock:p.stock,imageUrl:p.imageUrl}));}
