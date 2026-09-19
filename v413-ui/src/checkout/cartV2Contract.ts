import type { DeviceCartLine } from './deviceCart';
import { optionalAssetUrl } from '../adapters/publicStoreContract.ts';

export const CART_V2_CAPABILITIES = Object.freeze({
  'X-Cart-Schema-Version': '2',
  'X-Cart-Variant-Line-Identity': 'true',
  'X-Cart-CAS': 'true',
});
export type CartV2Pending = Readonly<{ productId: number; quantity: number; reason: string }>;
export type CartV2State = Readonly<{ revision: number; lines: DeviceCartLine[]; pending: readonly CartV2Pending[] }>;
export type CartV2Identity = Readonly<{ storeId?: number; productId: string | number; variantId?: number | null; quantity: number }>;

const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Sepet yanıtı doğrulanamadı.');
  return value as Record<string, unknown>;
};
const label = (value: unknown, max = 2048) => {
  if (typeof value !== 'string' || value.length > max) throw new Error('Sepet gösterim alanı doğrulanamadı.');
  return value;
};

export function cartV2LineKey(storeId: number, productId: number, variantId: number | null) {
  return `store-${storeId}-product-${productId}-variant-${variantId ?? 'none'}`;
}

// The response owns canonical store identity and public display values. Device
// keys and cached labels never become commerce authority in outgoing requests.
export function normalizeCartV2(value: unknown, assets: { apiOrigin?: string; allowCleartextAssets?: boolean } = {}): CartV2State {
  const source = record(value);
  const payload = record(source.payload);
  if (source.key !== 'cart' || payload.cartSchemaVersion !== 2
    || !Number.isSafeInteger(source.revision) || Number(source.revision) < 0
    || !Array.isArray(payload.items) || payload.items.length > 200) throw new Error('Sepet V2 sözleşmesi doğrulanamadı.');
  const seen = new Set<string>();
  const lines = payload.items.map((value): DeviceCartLine => {
    const item = record(value);
    if (!positiveId(item.storeId) || !positiveId(item.productId)
      || (item.variantId !== null && !positiveId(item.variantId))
      || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 999
      || !Number.isFinite(item.price) || Number(item.price) < 0
      || !Number.isSafeInteger(item.stock) || Number(item.stock) < 0) throw new Error('Sepet ürün kimliği doğrulanamadı.');
    const key = cartV2LineKey(item.storeId, item.productId, item.variantId);
    if (seen.has(key)) throw new Error('Sepet satırları veya sınırları doğrulanamadı.');
    seen.add(key);
    const selections = Array.isArray(item.variantSelections) ? item.variantSelections.map((entry) => {
      const pair = record(entry);
      return { group: label(pair.group, 200), value: label(pair.value, 200) };
    }) : [];
    if (selections.length > 20) throw new Error('Sepet seçenekleri doğrulanamadı.');
    if (item.variantId !== null && !selections.length) selections.push({ group: 'Seçenek', value: label(item.variantLabel || `#${item.variantId}`, 200) });
    const image = optionalAssetUrl(item.imageUrl, assets.apiOrigin, assets.allowCleartextAssets) ?? '';
    if (image.startsWith('//')) throw new Error('Sepet görseli doğrulanamadı.');
    return {
      id: key, storeId: item.storeId, productId: String(item.productId), quantity: Number(item.quantity),
      ...(item.variantId === null ? {} : { variantId: item.variantId, variantSelections: selections }),
      snapshot: {
        id: String(item.productId), name: label(item.name), store: label(item.storeName ?? ''),
        image, price: new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(item.price)),
        amount: Number(item.price), stock: Number(item.stock), isPublicProjection: true,
      },
    };
  });
  const migration = record(source.migration);
  if (!['NONE', 'REVIEW_REQUIRED'].includes(String(migration.status)) || !Array.isArray(migration.unresolvedItems)) throw new Error('Sepet aktarım durumu doğrulanamadı.');
  const pending = migration.unresolvedItems.map((value) => {
    const item = record(value);
    if (!positiveId(item.productId) || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1) throw new Error('Eski sepet satırı doğrulanamadı.');
    return { productId: item.productId, quantity: Number(item.quantity), reason: label(item.reason, 200) };
  });
  return { revision: Number(source.revision), lines, pending };
}

export function cartV2MutationBody(state: CartV2State, items: readonly CartV2Identity[], resolveLegacyProductIds: readonly number[] = []) {
  if (items.length > 200) throw new Error('Sepet kayıt sınırı aşıldı.');
  return {
    expectedRevision: state.revision,
    payload: {
      cartSchemaVersion: 2,
      items: items.map((item) => {
        const productId = Number(item.productId);
        if (!positiveId(productId) || (item.storeId !== undefined && !positiveId(item.storeId))
          || (item.variantId != null && !positiveId(item.variantId))
          || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) throw new Error('Sepet değişikliği geçersiz.');
        return { productId, variantId: item.variantId ?? null, quantity: item.quantity,
          ...(item.storeId === undefined ? {} : { storeId: item.storeId }) };
      }),
    },
    ...(resolveLegacyProductIds.length ? { resolveLegacyProductIds } : {}),
  };
}
