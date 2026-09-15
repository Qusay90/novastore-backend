import { expect, test } from "@playwright/test";

import { customerAccountApiTestUtils } from "../src/account/customerAccountApi";
import {
  canonicalCartLineKey,
  canonicalVariantId,
  findCanonicalVariantBySelections,
} from "../src/adapters/canonicalVariant";
import {
  CustomerProductContractError,
  normalizeCanonicalProductDetail,
} from "../src/adapters/customerProductContract";
import { customerCheckoutApiTestUtils } from "../src/checkout/customerCheckoutApi";

const variants = [
  {
    id: 123,
    sku: "RED-M",
    selections: [{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "M" }],
    price: 100,
    availableStock: 4,
    purchasable: true,
    commerce_revision: 2,
  },
  {
    id: 124,
    sku: "RED-L",
    selections: [{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "L" }],
    price: 125,
    availableStock: 0,
    purchasable: false,
    commerce_revision: 3,
  },
];

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    slug: "kanonik-tisort",
    name: "Kanonik Tişört",
    description: "Sunucudan gelen açıklama",
    category: "Giyim",
    price: "100.00",
    old_price: "150.00",
    stock: 4,
    is_purchasable: true,
    image_url: "https://cdn.example.test/product.jpg",
    media: [{ id: 1, media_url: "https://cdn.example.test/product.jpg", media_type: "image", is_main: true, sort_order: 0 }],
    average_rating: 4.5,
    review_count: 8,
    store: { slug: "nova-giyim", name: "Nova Giyim" },
    attributes: [{ code: "fabric", name: "Kumaş", type: "text", unit: null, value: "Pamuk" }],
    variant_selection_required: true,
    variants,
    ...overrides,
  };
}

test("canonical detail keeps only complete server variants and real description/features", () => {
  const detail = normalizeCanonicalProductDetail(product({ description: "Sunucudan gelen açıklama\nİkinci satır\r\n\tSekmeli ayrıntı" }), 42);
  expect(detail).toMatchObject({
    id: 42,
    description: "Sunucudan gelen açıklama\nİkinci satır\r\n\tSekmeli ayrıntı",
    variantSelectionRequired: true,
    store: { slug: "nova-giyim", name: "Nova Giyim" },
  });
  expect(detail.attributes).toEqual([{ code: "fabric", name: "Kumaş", type: "text", unit: null, value: "Pamuk" }]);
  expect(detail.variants).toEqual([
    { id: 123, sku: "RED-M", price: 100, availableStock: 4, purchasable: true, commerceRevision: 2, selections: variants[0].selections },
    { id: 124, sku: "RED-L", price: 125, availableStock: 0, purchasable: false, commerceRevision: 3, selections: variants[1].selections },
  ]);
  expect(() => normalizeCanonicalProductDetail(product({ description: "Güvenli değil\u000bmetin" }), 42)).toThrow(/PRODUCT_DESCRIPTION_INVALID/u);
});

test("required variant empty is authoritative while missing/malformed data fails closed", () => {
  expect(normalizeCanonicalProductDetail(product({ variants: [] }), 42).variants).toEqual([]);
  expect(() => normalizeCanonicalProductDetail(product({ variants: undefined }), 42)).toThrow(CustomerProductContractError);
  expect(() => normalizeCanonicalProductDetail(product({ variants: [{ ...variants[0], id: 0 }] }), 42)).toThrow(/PURCHASABLE_VARIANT_INVALID/u);
  expect(() => normalizeCanonicalProductDetail(product({ variants: [{ ...variants[0], selections: [{ group: "Beden", value: "M" }, { group: "Beden", value: "L" }] }] }), 42)).toThrow(/VARIANT_SELECTIONS_INVALID/u);
  expect(() => normalizeCanonicalProductDetail(product({ variant_selection_required: false }), 42)).toThrow(/SIMPLE_PRODUCT_VARIANTS_INVALID/u);
  expect(normalizeCanonicalProductDetail(product({ variant_selection_required: false, variants: undefined }), 42).variants).toBeNull();
});

test("variant identity is bounded and selection resolves exact rows only", () => {
  expect(canonicalVariantId(2_147_483_647)).toBe(2_147_483_647);
  for (const invalid of [0, -1, 2_147_483_648, true, "01", "1.1", {}, []]) {
    expect(canonicalVariantId(invalid)).toBeNull();
  }
  const normalized = normalizeCanonicalProductDetail(product(), 42).variants!;
  expect(findCanonicalVariantBySelections(normalized, { Renk: "Kırmızı", Beden: "M" })?.id).toBe(123);
  expect(findCanonicalVariantBySelections(normalized, { Renk: "Kırmızı" })).toBeNull();
  expect(findCanonicalVariantBySelections(normalized, { Renk: "Kırmızı", Beden: "XL" })).toBeNull();
  expect(canonicalCartLineKey(42, 123)).not.toBe(canonicalCartLineKey(42, 124));
});

test("checkout wire lines aggregate by product plus variant and contain only canonical identity", () => {
  const wire = customerCheckoutApiTestUtils.canonicalCartItems([
    { id: 42, variantId: 123, quantity: 1, name: "forged", image: "https://evil.invalid/forged.jpg" },
    { id: 42, variantId: 124, quantity: 1 },
    { id: 42, variantId: 123, quantity: 2 },
    { id: 41, quantity: 1 },
  ]);
  expect(wire).toEqual([
    { product_id: 42, variant_id: 123, quantity: 3 },
    { product_id: 42, variant_id: 124, quantity: 1 },
    { product_id: 41, quantity: 1 },
  ]);
  expect(Object.keys(wire[0]).sort()).toEqual(["product_id", "quantity", "variant_id"]);
  expect(() => customerCheckoutApiTestUtils.canonicalCartItems([{ id: 42, variantId: 2_147_483_648, quantity: 1 }])).toThrow(/Sepet ürünü geçersiz/u);
});

test("quote and historical order preserve immutable variant labels, SKU and identity", () => {
  const quoteItem = customerCheckoutApiTestUtils.normalizeCustomerCheckoutQuoteItem({
    id: 42,
    variant_id: 123,
    variant_selections: variants[0].selections,
    sku: "RED-M-HISTORICAL",
    name: "Kanonik Tişört",
    quantity: 2,
    price: 100,
    line_total: 200,
  });
  expect(quoteItem).toMatchObject({ variantId: 123, variantSelections: variants[0].selections, sku: "RED-M-HISTORICAL" });
  expect(customerCheckoutApiTestUtils.quoteMatchesCanonicalCartItems(
    [quoteItem!],
    [{ product_id: 42, variant_id: 123, quantity: 2 }],
  )).toBe(true);
  expect(customerCheckoutApiTestUtils.quoteMatchesCanonicalCartItems(
    [quoteItem!],
    [{ product_id: 42, variant_id: 124, quantity: 2 }],
  )).toBe(false);
  expect(customerCheckoutApiTestUtils.quoteMatchesCanonicalCartItems(
    [quoteItem!],
    [{ product_id: 42, variant_id: 123, quantity: 1 }],
  )).toBe(false);
  expect(customerCheckoutApiTestUtils.normalizeCustomerCheckoutQuoteItem({
    id: 42,
    variant_id: 123,
    variantId: 124,
    variant_selections: variants[0].selections,
    sku: "RED-M",
    name: "Kanonik Tişört",
    quantity: 1,
    price: 100,
    line_total: 100,
  })).toBeNull();

  const order = customerAccountApiTestUtils.normalizeCustomerOrder({
    id: 91,
    status: "Teslim Edildi",
    total_amount: 100,
    items: [{ id: 42, variant_id: 123, variant_selections: variants[0].selections, sku: "RED-M-HISTORICAL", name: "Kanonik Tişört", quantity: 1, price: 100 }],
  });
  expect(order?.items[0]).toMatchObject({ variantId: 123, variantSelections: variants[0].selections, sku: "RED-M-HISTORICAL" });
});
