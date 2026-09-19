import { currentCustomerSessionGuard, customerSessionMatchesGuard, requestCustomerApi } from '../notifications/customerNotificationApi';
import type { CustomerCheckoutRequest } from './customerCheckoutApi';

// Checkout state is a separate CAS resource. No prices, labels or local keys
// cross this boundary; canonical checkout still revalidates every line.
export async function saveCheckoutV2Snapshot(input: CustomerCheckoutRequest, stillCurrent: () => boolean) {
  const guard = currentCustomerSessionGuard();
  const value = await requestCustomerApi('/api/shared-state/checkout', 'GET', undefined, true, guard);
  const current = value as { key?: unknown; revision?: unknown; payload?: { cartSchemaVersion?: unknown } } | null;
  if (current?.key !== 'checkout' || current.payload?.cartSchemaVersion !== 2
    || !Number.isSafeInteger(current.revision) || Number(current.revision) < 0) throw new Error('Ödeme sepeti V2 sürümü doğrulanamadı.');
  if (!stillCurrent() || !customerSessionMatchesGuard(guard)) throw new Error('Ödeme sepeti bu sırada değişti.');
  await requestCustomerApi('/api/shared-state/checkout', 'PUT', {
    expectedRevision: current.revision,
    payload: { cartSchemaVersion: 2, items: input.cartItems.map((item) => ({ productId: item.id, variantId: item.variantId ?? null, quantity: item.quantity })), selectedAddressId: input.addressId, couponCode: input.couponCode || null, paymentMethod: 'card' },
  }, true, guard);
}
