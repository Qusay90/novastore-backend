// Device-local display cache. Every purchase is revalidated by PC1; these values
// are never serialized as price, stock or seller authority in a checkout body.
export type DeviceCartSnapshot = Readonly<{
  id: string;
  name: string;
  store: string;
  image: string;
  price: string;
  amount: number;
  stock: number;
  isPublicProjection: true;
}>;

export type DeviceCartLine = {
  id: string;
  productId: string;
  variantId?: number;
  variantSelections?: readonly Readonly<{ group: string; value: string }>[];
  quantity: number;
  snapshot?: DeviceCartSnapshot;
};

export const DEVICE_CART_KEY = "novastore.customer.cart.v1";
export const DEVICE_SELECTION_KEY = "novastore.customer.variant-selection.v1";
export function deviceCartKey(productId: string, variantId?: number) {
  return variantId === undefined ? `product-${productId}` : `product-${productId}-variant-${variantId}`;
}

function positiveId(value: unknown): boolean {
  return (typeof value === "number" || typeof value === "string")
    && /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;
}

export function restoreDeviceCart(raw: string | null): DeviceCartLine[] {
  if (!raw || raw.length > 128_000) return [];
  try {
    const source = JSON.parse(raw);
    if (source?.version !== 1 || !Array.isArray(source.lines) || source.lines.length > 20) return [];
    const seen = new Set<string>();
    let total = 0;
    return source.lines.map((line: DeviceCartLine) => {
      if (!line || !positiveId(line.productId)
        || (line.variantId !== undefined && !positiveId(line.variantId))
        || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) throw new Error("Invalid cart identity");
      const productId = String(line.productId);
      const variantId = line.variantId === undefined ? undefined : Number(line.variantId);
      const id = deviceCartKey(productId, variantId);
      total += line.quantity;
      if (seen.has(id) || total > 50) throw new Error("Invalid cart limits");
      seen.add(id);
      const snapshot = line.snapshot;
      if (!snapshot || snapshot.id !== productId || snapshot.isPublicProjection !== true
        || !Number.isFinite(snapshot.amount) || snapshot.amount < 0
        || !Number.isSafeInteger(snapshot.stock) || snapshot.stock < 0
        || [snapshot.name, snapshot.store, snapshot.price, snapshot.image].some((value) => typeof value !== "string" || value.length > 2048)
        || !snapshot.name.trim()
        || (!snapshot.image.startsWith("https://") && !/^\/(?!\/)/.test(snapshot.image))) throw new Error("Invalid cart display");
      const labels = line.variantSelections;
      if (variantId !== undefined && (!Array.isArray(labels) || !labels.length || labels.length > 20
        || labels.some((label) => !label || [label.group, label.value].some((value) => typeof value !== "string" || !value.trim() || value.length > 200)))) throw new Error("Invalid variant labels");
      return {
        id, productId, quantity: line.quantity,
        ...(variantId === undefined ? {} : { variantId, variantSelections: labels!.map(({ group, value }) => ({ group, value })) }),
        snapshot: { id: productId, name: snapshot.name, store: snapshot.store, image: snapshot.image, price: snapshot.price, amount: snapshot.amount, stock: snapshot.stock, isPublicProjection: true as const },
      };
    });
  } catch { return []; }
}

export function readDeviceCart(): DeviceCartLine[] {
  try { return restoreDeviceCart(localStorage.getItem(DEVICE_CART_KEY)); } catch { return []; }
}

export function saveDeviceCart(lines: readonly DeviceCartLine[]): void {
  try { localStorage.setItem(DEVICE_CART_KEY, JSON.stringify({ version: 1, lines })); } catch { /* Storage can be unavailable; in-memory cart remains usable. */ }
}

export function readDeviceVariantSelection(productId: string): number | undefined {
  try {
    const selection = JSON.parse(localStorage.getItem(DEVICE_SELECTION_KEY) || "null");
    return selection?.productId === productId && positiveId(selection.variantId) ? Number(selection.variantId) : undefined;
  } catch { return undefined; }
}

export function saveDeviceVariantSelection(productId: string, variantId?: number): void {
  try {
    if (variantId === undefined) localStorage.removeItem(DEVICE_SELECTION_KEY);
    else localStorage.setItem(DEVICE_SELECTION_KEY, JSON.stringify({ productId, variantId }));
  } catch { /* Selection is still usable until the view is recreated. */ }
}
