// Explicit canonical DTOs shared by the matrix and production-browser tests.
export const variant = (id, choices, extra = {}) => ({
  id, sku: `R29-${id}`, selections: Object.entries(choices).map(([group, value]) => ({ group, value })),
  price: 100 + id / 100, availableStock: 7, purchasable: true, commerce_revision: 1, ...extra,
});
export const ownerVariants = [
  variant(301, { Color: "Orange", Size: "M" }, { price: 219.90, availableStock: 4 }),
  variant(302, { Color: "Orange", Size: "L" }, { price: 229.75, availableStock: 3 }),
  variant(303, { Color: "Blue", Size: "M" }, { price: 249.50, availableStock: 2 }),
  variant(304, { Color: "Green", Size: "L" }, { price: 239, availableStock: 6 }),
];
export const threeDimensionVariants = [
  variant(401, { Renk: "Turuncu", Beden: "M", Kapasite: "128 GB" }),
  variant(402, { Renk: "Turuncu", Beden: "L", Kapasite: "256 GB" }),
  variant(403, { Renk: "Mavi", Beden: "M", Kapasite: "256 GB" }),
  variant(404, { Renk: "Yeşil", Beden: "L", Kapasite: "128 GB" }),
  variant(405, { Renk: "Mor", Beden: "XL", Kapasite: "512 GB" }, { availableStock: 0, purchasable: false }),
  variant(406, { Renk: "Beyaz", Beden: "S", Kapasite: "64 GB" }, { purchasable: false }),
];
export const hostileGroup = '<img src=x onerror="window.__r29Injected=true"> مجموعة 🧵';
export const hostileValue = '<script>window.__r29Injected=true</script> "雪🌿" مقاس';
export const longValue = "Özel üretim — uzun seçenek açıklaması · مقاوم للماء · 日本語 · 🌿 ".repeat(3).trim();
export const manyVariants = [
  ...Array.from({ length: 18 }, (_, i) => variant(501 + i, { Renk: ["Turuncu", "Mavi", "Yeşil"][i % 3], Beden: `${i + 32}`, Kapasite: `${(i + 1) * 64} GB` })),
  variant(530, { Renk: "Gece mavisi / özel", Beden: longValue, Kapasite: "Özel paket" }),
  variant(531, { Renk: 'url("https://unsafe.invalid/style")', Beden: "48", Kapasite: "512 GB" }),
];
export const hostileVariants = [variant(601, { [hostileGroup]: hostileValue, Color: 'red; background:url("https://unsafe.invalid")' })];
