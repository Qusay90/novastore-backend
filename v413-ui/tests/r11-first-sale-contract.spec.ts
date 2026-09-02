import { expect, test } from "@playwright/test";

import { customerAccountApiTestUtils } from "../src/account/customerAccountApi";
import { customerCheckoutApiTestUtils } from "../src/checkout/customerCheckoutApi";

test("PayTR handoff accepts only the canonical iframe action and approved HTTPS target", () => {
  expect(customerCheckoutApiTestUtils.normalizePaymentAction({
    type: "iframe",
    iframeUrl: "https://www.paytr.com/odeme/guvenli/session-123",
  })).toBe("https://www.paytr.com/odeme/guvenli/session-123");
  expect(customerCheckoutApiTestUtils.normalizePaymentAction({
    type: "paytr_iframe",
    iframeUrl: "https://www.paytr.com/odeme/guvenli/session-123",
  })).toBe("");
  expect(customerCheckoutApiTestUtils.normalizePaymentAction({
    type: "iframe",
    iframeUrl: "https://example.com/odeme/guvenli/session-123",
  })).toBe("");
  expect(customerCheckoutApiTestUtils.normalizePaymentAction({
    type: "iframe",
    iframeUrl: "https://www.paytr.com/odeme/guvenli/session-123#redirect",
  })).toBe("");
});

test("checkout totals remain server-coherent and cart quantity is capped at 20", () => {
  expect(customerCheckoutApiTestUtils.normalizeTotals({
    currency: "TRY",
    subtotal: 100,
    bundleDiscount: 5,
    couponDiscount: 10,
    shippingFee: 15,
    total: 100,
  })).toEqual({ currency: "TRY", subtotal: 100, discount: 15, shipping: 15, total: 100 });
  expect(customerCheckoutApiTestUtils.normalizeTotals({
    currency: "TRY",
    subtotal: 100,
    discount: 10,
    shippingFee: 15,
    total: 999,
  })).toBeNull();
  expect(() => customerCheckoutApiTestUtils.canonicalCartItems([{ id: 7, quantity: 21 }])).toThrow(/Sepet ürünü geçersiz/u);
  expect(customerCheckoutApiTestUtils.canonicalCartItems([{ id: 7, quantity: 9 }, { id: 7, quantity: 11 }])).toEqual([{ id: 7, quantity: 20 }]);
  expect(() => customerCheckoutApiTestUtils.canonicalCartItems([{ id: 7, quantity: 12 }, { id: 7, quantity: 9 }])).toThrow(/en fazla 20 adet/u);
  expect(() => customerCheckoutApiTestUtils.canonicalCartItems(
    Array.from({ length: 21 }, (_, index) => ({ id: index + 1, quantity: 1 })),
  )).toThrow(/en fazla 20 farklı ürün/u);
  expect(() => customerCheckoutApiTestUtils.canonicalCartItems([
    { id: 1, quantity: 20 },
    { id: 2, quantity: 20 },
    { id: 3, quantity: 11 },
  ])).toThrow(/toplam en fazla 50 ürün/u);
});

test("checkout consent preserves canonical snapshot, versions and accepted flags in the server initialization body", () => {
  const preview = {
    schemaVersion: "checkout-agreements-v2" as const,
    snapshotSha256: "b".repeat(64),
    documents: [
      { slug: "pre-information", path: "/legal/pre-information", title: "Ön Bilgilendirme Formu", version: "r11-uat-test-v1", text: "Metin 1", contentSha256: "c".repeat(64) },
      { slug: "distance-sale", path: "/legal/distance-sale", title: "Mesafeli Satış Sözleşmesi", version: "r11-uat-test-v1", text: "Metin 2", contentSha256: "d".repeat(64) },
    ],
    quote: {
      totals: { subtotal: 100, discount: 0, shipping: 0, total: 100, currency: "TRY" },
      items: [{ id: 7, name: "Ürün", quantity: 1, price: 100, lineTotal: 100, image: null }],
      couponApplied: false,
      couponCode: null,
    },
  };
  const input = {
    addressId: 3,
    cartItems: [{ id: 7, quantity: 1 }],
    preview,
    acceptedSlugs: ["pre-information", "distance-sale"],
    idempotencyKey: "android-r11r3-test",
  };

  expect(customerCheckoutApiTestUtils.createCustomerPaymentInitializeBody(input)).toMatchObject({
    addressId: 3,
    paymentMethod: "card",
    idempotency_key: "android-r11r3-test",
    agreementSnapshotSha256: "b".repeat(64),
    agreementAcceptances: [
      { slug: "pre-information", version: "r11-uat-test-v1", accepted: true },
      { slug: "distance-sale", version: "r11-uat-test-v1", accepted: true },
    ],
  });
  expect(() => customerCheckoutApiTestUtils.createCustomerPaymentInitializeBody({
    ...input,
    acceptedSlugs: ["pre-information"],
  })).toThrow(/tümünü onaylamalısın/u);
});

test("order normalization preserves canonical and display status as separate truths", () => {
  expect(customerAccountApiTestUtils.normalizeCustomerOrder({
    id: 42,
    status: "Ödeme Bekliyor",
    display_status: "Ödeme Başarısız",
    status_note: "Ödeme tamamlanmadı.",
    is_pending_payment: false,
    is_payment_failed: true,
    delivered_at: "2026-09-01T10:30:00.000Z",
    refund_status: "FAILED",
    total_amount: 149.9,
    items: [],
  })).toMatchObject({
    id: 42,
    status: "Ödeme Bekliyor",
    displayStatus: "Ödeme Başarısız",
    statusNote: "Ödeme tamamlanmadı.",
    isPendingPayment: false,
    isPaymentFailed: true,
    deliveredAt: "2026-09-01T10:30:00.000Z",
    refundStatus: "FAILED",
  });
});
