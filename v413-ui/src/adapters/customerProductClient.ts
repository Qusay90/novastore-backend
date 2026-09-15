import { requestCustomerApi } from "../notifications/customerNotificationApi";
import { canonicalProductNumericId } from "./canonicalVariant";
import {
  CustomerProductContractError,
  normalizeCanonicalProductDetail,
  type CustomerCanonicalProductDetail,
} from "./customerProductContract";

export async function loadCanonicalProductDetail(productId: number | string): Promise<CustomerCanonicalProductDetail> {
  const id = canonicalProductNumericId(productId);
  if (!id) throw new CustomerProductContractError("PRODUCT_ID_INVALID");
  const payload = await requestCustomerApi(`/api/products/${id}`, "GET", undefined, false);
  return normalizeCanonicalProductDetail(payload, id);
}
