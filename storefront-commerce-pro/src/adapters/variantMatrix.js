// Index server rows only, never descriptive attributes or Cartesian combinations.
export function createVariantMatrix(variants = []) {
  const groups = new Map();
  const rows = [];
  for (const variant of variants) {
    const values = new Map(variant.selections.map(({ group, value }) => [group, value]));
    if (values.size !== variant.selections.length || !values.size) continue;
    const row = { variant, values };
    rows.push(row);
    for (const [group, value] of values) {
      if (!groups.has(group)) groups.set(group, new Map());
      const options = groups.get(group);
      if (!options.has(value)) options.set(value, new Set());
      options.get(value).add(row);
    }
  }
  return { rows, groups };
}

export function compatibleVariantRows(matrix, selections, exceptGroup) {
  const sets = selections.filter(({ group }) => group !== exceptGroup)
    .map(({ group, value }) => matrix.groups.get(group)?.get(value));
  if (sets.some((set) => !set)) return [];
  if (!sets.length) return matrix.rows;
  sets.sort((a, b) => a.size - b.size);
  return [...sets[0]].filter((row) => sets.every((set) => set.has(row)));
}

export function resolveVariantSelection(matrix, selections) {
  const compatible = compatibleVariantRows(matrix, selections);
  const selectedGroups = new Set(selections.map(({ group }) => group));
  const missingGroups = [...matrix.groups.keys()].filter((group) => !selectedGroups.has(group));
  const complete = matrix.groups.size > 0 && !missingGroups.length
    && selectedGroups.size === selections.length && selections.length === matrix.groups.size;
  return {
    compatibleCanonicalVariants: compatible.map(({ variant }) => variant),
    missingGroups,
    ambiguous: complete && compatible.length > 1,
    // Eligibility must not hide ambiguity by picking the first purchasable row.
    variant: complete && compatible.length === 1 ? compatible[0].variant : null,
  };
}

export function variantOptionState(matrix, selections, group, value) {
  const containing = matrix.groups.get(group)?.get(value);
  const compatible = compatibleVariantRows(matrix, selections, group)
    .filter((row) => containing?.has(row));
  const purchasable = (row) => row.variant.purchasable && row.variant.availableStock > 0;
  const selected = selections.some((choice) => choice.group === group && choice.value === value);
  const available = compatible.some(purchasable);
  return {
    selected, available,
    exists: Boolean(containing?.size),
    hasPurchasableVariant: Boolean(containing && [...containing].some(purchasable)),
    compatibleCount: compatible.length,
    inStock: compatible.some((row) => row.variant.availableStock > 0),
    state: !compatible.length ? "UNAVAILABLE_COMBINATION" : available ? "AVAILABLE"
      : compatible.every((row) => row.variant.availableStock === 0) ? "OUT_OF_STOCK" : "NOT_PURCHASABLE",
  };
}

// Keep new intent, then compatible earlier choices from newest to oldest.
// No value is auto-filled. The UI disables conflicts; this also makes a change
// deterministic if it races another interaction. Unknown values are rejected.
export function changeVariantSelection(matrix, selections, group, value) {
  const previous = selections.filter((choice) => choice.group !== group);
  if (value === null || selections.some((choice) => choice.group === group && choice.value === value)) {
    return { selections: previous, cleared: [] };
  }
  if (!variantOptionState(matrix, [], group, value).available) return { selections, cleared: [] };
  const next = [{ group, value }];
  const cleared = [];
  for (const choice of [...previous].reverse()) {
    const candidates = compatibleVariantRows(matrix, [...next, choice]);
    if (candidates.some(({ variant }) => variant.purchasable && variant.availableStock > 0)) next.unshift(choice);
    else cleared.push(choice.group);
  }
  return { selections: next, cleared };
}

const COLOR_GROUPS = new Set(["renk", "color", "colour"]);
const SAFE_COLORS = new Map([
  ["siyah", "#20242c"], ["black", "#20242c"], ["beyaz", "#ffffff"], ["white", "#ffffff"],
  ["kırmızı", "#c93843"], ["kirmizi", "#c93843"], ["red", "#c93843"],
  ["mavi", "#326ac4"], ["blue", "#326ac4"], ["yeşil", "#27835b"], ["yesil", "#27835b"], ["green", "#27835b"],
  ["turuncu", "#e77c2c"], ["orange", "#e77c2c"], ["sarı", "#f2ce47"], ["sari", "#f2ce47"], ["yellow", "#f2ce47"],
  ["mor", "#8354b6"], ["purple", "#8354b6"], ["pembe", "#df83a3"], ["pink", "#df83a3"],
  ["gri", "#8a9099"], ["gray", "#8a9099"], ["grey", "#8a9099"],
  ["bej", "#d9c7a7"], ["beige", "#d9c7a7"], ["kahverengi", "#79523d"], ["brown", "#79523d"],
  ["lacivert", "#25365c"], ["navy", "#25365c"],
]);
const colorKey = (text) => String(text).normalize("NFC").trim().toLowerCase().replace(/\u0307/g, "");
const GROUP_LABELS = new Map([
  ["color", "Renk"], ["colour", "Renk"], ["size", "Beden"], ["capacity", "Kapasite"],
  ["storage", "Depolama"], ["length", "Uzunluk"], ["material", "Malzeme"],
  ["pack size", "Paket adedi"], ["model", "Model"], ["memory", "Bellek"],
  ["finish", "Yüzey"], ["style", "Stil"], ["case color", "Kasa rengi"],
  ["case finish", "Kasa yüzeyi"], ["configuration", "Yapılandırma"],
  ["gpu", "Ekran kartı"], ["gpu configuration", "Ekran kartı"], ["display size", "Ekran boyutu"],
]);
const COLOR_LABELS = new Map([
  ["orange", "Turuncu"], ["blue", "Mavi"], ["green", "Yeşil"], ["red", "Kırmızı"],
  ["black", "Siyah"], ["white", "Beyaz"], ["yellow", "Sarı"], ["purple", "Mor"],
  ["pink", "Pembe"], ["gray", "Gri"], ["grey", "Gri"], ["beige", "Bej"],
  ["brown", "Kahverengi"], ["navy", "Lacivert"],
]);
// Presentation only: canonical matching always uses the original server text.
// Unknown labels remain literal; never guess a translation of a model or SKU.
export const variantGroupLabel = (group) => GROUP_LABELS.get(colorKey(group)) || group;
const FINISH_LABELS = new Map([["matte", "Mat"], ["gloss", "Parlak"]]);
const LENGTH_LABELS = new Map([["short", "Kısa"], ["long", "Uzun"]]);
export const variantValueLabel = (group, value) => {
  const key = colorKey(group);
  const labels = COLOR_GROUPS.has(key) ? COLOR_LABELS : ["finish", "case finish"].includes(key) ? FINISH_LABELS
    : key === "length" ? LENGTH_LABELS : null;
  return labels?.get(colorKey(value)) || value;
};
export function safeVariantColor(group, value) {
  return COLOR_GROUPS.has(colorKey(group)) ? SAFE_COLORS.get(colorKey(value)) || null : null;
}
