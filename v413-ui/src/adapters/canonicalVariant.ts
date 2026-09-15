export const MAX_CANONICAL_VARIANT_ID = 2_147_483_647;

export type CustomerVariantSelection = Readonly<{
  group: string;
  value: string;
}>;

export type CanonicalVariantIdentity = Readonly<{
  productId: number;
  variantId: number | null;
}>;

export type CanonicalVariantChoice = Readonly<{
  id: number;
  selections: readonly CustomerVariantSelection[];
}>;

function positiveBoundedInteger(value: unknown, maximum: number): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

export function canonicalProductNumericId(value: unknown): number | null {
  return positiveBoundedInteger(value, MAX_CANONICAL_VARIANT_ID);
}

export function canonicalVariantId(value: unknown): number | null {
  return positiveBoundedInteger(value, MAX_CANONICAL_VARIANT_ID);
}

export function canonicalCartLineKey(
  identityOrProductId: CanonicalVariantIdentity | number,
  explicitVariantId: number | null = null,
): string {
  const productId = canonicalProductNumericId(
    typeof identityOrProductId === "object" ? identityOrProductId.productId : identityOrProductId,
  );
  const rawVariantId = typeof identityOrProductId === "object"
    ? identityOrProductId.variantId
    : explicitVariantId;
  const variantId = rawVariantId === null || rawVariantId === undefined
    ? null
    : canonicalVariantId(rawVariantId);
  if (!productId || (rawVariantId !== null && rawVariantId !== undefined && !variantId)) {
    throw new TypeError("CANONICAL_CART_IDENTITY_INVALID");
  }
  return `${productId}:${variantId ?? "simple"}`;
}

export function canonicalVariantSelectionLabel(
  selections: readonly CustomerVariantSelection[],
): string {
  return selections.map(({ group, value }) => `${group}: ${value}`).join(" · ");
}

function requestedSelectionEntries(
  selected: Readonly<Record<string, string>> | ReadonlyMap<string, string>,
): readonly (readonly [string, string])[] {
  return selected instanceof Map
    ? [...selected.entries()]
    : Object.entries(selected);
}

/**
 * Resolves only an exact row returned by the server. Partial selections and
 * locally invented combinations deliberately produce no match.
 */
export function findCanonicalVariantBySelections<T extends CanonicalVariantChoice>(
  variants: readonly T[],
  selected: Readonly<Record<string, string>> | ReadonlyMap<string, string>,
): T | null {
  const entries = requestedSelectionEntries(selected);
  if (entries.length === 0 || entries.some(([group, value]) => !group || !value)) return null;

  return variants.find((variant) => (
    variant.selections.length === entries.length
    && entries.every(([group, value]) => (
      variant.selections.some((selection) => selection.group === group && selection.value === value)
    ))
  )) ?? null;
}
