import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { normalizePurchasableVariants } from "../src/adapters/variantContract.js";
import { changeVariantSelection, createVariantMatrix, resolveVariantSelection, safeVariantColor, variantGroupLabel, variantValueLabel, variantOptionState } from "../src/adapters/variantMatrix.js";
import { ownerVariants, threeDimensionVariants, manyVariants, hostileVariants, variant } from "../scripts/r29-variant-fixtures.mjs";

const matrixOf = (rows) => createVariantMatrix(normalizePurchasableVariants(rows));
const choices = (values) => Object.entries(values).map(([group, value]) => ({ group, value }));
const owner = matrixOf(ownerVariants);
const available = (matrix, selected, group) => [...matrix.groups.get(group).keys()]
  .filter((value) => variantOptionState(matrix, choices(selected), group, value).available);

test("R29 owner matrix constrains each direction without inventing missing combinations", () => {
  assert.equal(owner.rows.length, 4);
  assert.deepEqual(available(owner, { Color: "Orange" }, "Size"), ["M", "L"]);
  assert.deepEqual(available(owner, { Color: "Blue" }, "Size"), ["M"]);
  assert.deepEqual(available(owner, { Color: "Green" }, "Size"), ["L"]);
  assert.deepEqual(available(owner, { Size: "M" }, "Color"), ["Orange", "Blue"]);
  assert.deepEqual(available(owner, { Size: "L" }, "Color"), ["Orange", "Green"]);
  for (const [Color, Size] of [["Blue", "L"], ["Green", "M"]]) {
    const result = resolveVariantSelection(owner, choices({ Color, Size }));
    assert.equal(result.variant, null); assert.deepEqual(result.compatibleCanonicalVariants, []);
  }
});

const permutations = (items) => items.length ? items.flatMap((item, index) =>
  permutations(items.filter((_, other) => other !== index)).map((rest) => [item, ...rest])) : [[]];
test("R29 Turkish presentation preserves canonical English keys and unknown server labels", () => {
  assert.equal(variantGroupLabel("Color"), "Renk"); assert.equal(variantGroupLabel("Size"), "Beden");
  assert.deepEqual(["Orange", "Blue", "Green"].map((v) => variantValueLabel("Color", v)), ["Turuncu", "Mavi", "Yeşil"]);
  assert.equal(variantValueLabel("Model", "Orange"), "Orange");
  assert.equal(variantGroupLabel("Özel ölçü"), "Özel ölçü");
  assert.equal(variantValueLabel("Color", "Gece mavisi / özel"), "Gece mavisi / özel");
  assert.equal(resolveVariantSelection(owner, choices({ Color: "Blue", Size: "M" })).variant.id, 303);
  assert.equal(resolveVariantSelection(owner, choices({ Renk: "Mavi", Beden: "M" })).variant, null);
});
test("R29 every canonical row resolves identically in every group order, only after explicit completion", () => {
  for (const source of [ownerVariants, threeDimensionVariants]) {
    const matrix = matrixOf(source);
    for (const row of source.filter((row) => row.purchasable)) for (const order of permutations(row.selections)) {
      let selected = [];
      for (let i = 0; i < order.length; i++) {
        const choice = order[i];
        assert.equal(variantOptionState(matrix, selected, choice.group, choice.value).available, true);
        selected = changeVariantSelection(matrix, selected, choice.group, choice.value).selections;
        assert.equal(resolveVariantSelection(matrix, selected).variant?.id ?? null, i === order.length - 1 ? row.id : null);
      }
    }
  }
});

test("R29 changing intent clears only incompatible earlier choices and never completes a group", () => {
  const result = changeVariantSelection(owner, choices({ Color: "Orange", Size: "L" }), "Color", "Blue");
  assert.deepEqual(result, { selections: choices({ Color: "Blue" }), cleared: ["Size"] });
  assert.equal(resolveVariantSelection(owner, result.selections).variant, null);
  const matrix = matrixOf(threeDimensionVariants);
  const changed = changeVariantSelection(matrix, choices({ Beden: "M", Kapasite: "256 GB", Renk: "Mavi" }), "Renk", "Turuncu");
  assert.deepEqual(changed.cleared, ["Beden"]);
  assert.deepEqual(changed.selections, choices({ Kapasite: "256 GB", Renk: "Turuncu" }));
  assert.equal(resolveVariantSelection(matrix, changed.selections).variant, null);
  const cleared = changeVariantSelection(owner, choices({ Color: "Blue", Size: "M" }), "Color", null);
  assert.deepEqual(cleared.selections, choices({ Size: "M" }));
});

test("R29 nonexistent, sold-out and ineligible rows have distinct truthful states", () => {
  const matrix = matrixOf(threeDimensionVariants);
  assert.equal(variantOptionState(matrix, choices({ Renk: "Mavi" }), "Beden", "L").state, "UNAVAILABLE_COMBINATION");
  assert.equal(variantOptionState(matrix, [], "Renk", "Mor").state, "OUT_OF_STOCK");
  assert.equal(variantOptionState(matrix, [], "Renk", "Beyaz").state, "NOT_PURCHASABLE");
  for (const value of ["Mor", "Beyaz", "Unknown"]) assert.deepEqual(changeVariantSelection(matrix, [], "Renk", value).selections, []);
});

test("R29 duplicate combinations stay ambiguous including an ineligible sibling", () => {
  const matrix = matrixOf([ownerVariants[0], { ...ownerVariants[0], id: 999, purchasable: false }]);
  const result = resolveVariantSelection(matrix, ownerVariants[0].selections);
  assert.equal(result.ambiguous, true); assert.equal(result.variant, null);
  assert.equal(result.compatibleCanonicalVariants.length, 2);
});

test("R29 malformed duplicate dimensions, missing dimensions and stale values fail closed", () => {
  assert.equal(matrixOf([{ ...ownerVariants[0], selections: [...ownerVariants[0].selections, { group: "Color", value: "Blue" }] }]).rows.length, 0);
  const matrix = matrixOf([ownerVariants[0], variant(999, { Material: "Cotton" })]);
  assert.equal(resolveVariantSelection(matrix, ownerVariants[0].selections).variant, null);
  assert.equal(resolveVariantSelection(owner, choices({ Color: "Gone", Size: "M" })).variant, null);
  assert.equal(resolveVariantSelection(matrixOf([]), []).variant, null);
  assert.equal(resolveVariantSelection(owner, [...ownerVariants[0].selections, ownerVariants[0].selections[0]]).variant, null);
});

test("R29 exact canonical price, stock and ID survive selection and changed availability", () => {
  const selected = resolveVariantSelection(owner, choices({ Color: "Orange", Size: "L" })).variant;
  assert.deepEqual([selected.id, selected.price, selected.availableStock], [302, 229.75, 3]);
  const next = matrixOf([{ ...ownerVariants[1], availableStock: 0, purchasable: false }]);
  assert.equal(variantOptionState(next, [], "Size", "L").available, false);
  assert.equal(resolveVariantSelection(next, []).variant, null);
});

test("R29 safe color mapping is strict, group-aware and never accepts server CSS", () => {
  assert.equal(safeVariantColor("Color", "Blue"), "#326ac4");
  assert.equal(safeVariantColor(" RENK ", "YEŞİL"), "#27835b");
  for (const value of ["#fff", "rgb(0,0,0)", "var(--red)", "url(https://unsafe.invalid)", "red;display:none", "<b>red</b>", "Gece mavisi", "__proto__", "constructor"]) assert.equal(safeVariantColor("Color", value), null);
  assert.equal(safeVariantColor("Material", "Blue"), null);
  assert.equal(safeVariantColor("Color<script>", "Blue"), null);
});

test("R29 labels including HTML, Unicode, RTL and prototype keys remain exact text identities", () => {
  for (const raw of [...hostileVariants, variant(900, { constructor: "__proto__", toString: "🧵 طويل 雪" })]) {
    const matrix = matrixOf([raw]);
    assert.equal(resolveVariantSelection(matrix, raw.selections).variant.id, raw.id);
    assert.equal(resolveVariantSelection(matrix, []).variant, null);
  }
});

test("R29 availability agrees with an independent row oracle for every partial three-dimensional selection", () => {
  const matrix = matrixOf(threeDimensionVariants);
  const groups = [...matrix.groups];
  const visit = (index, selected) => {
    if (index < groups.length) {
      visit(index + 1, selected);
      for (const value of groups[index][1].keys()) visit(index + 1, [...selected, { group: groups[index][0], value }]);
      return;
    }
    for (const [group, values] of groups) for (const value of values.keys()) {
      const expected = threeDimensionVariants.filter((row) => row.selections.some((s) => s.group === group && s.value === value)
        && selected.filter((s) => s.group !== group).every((s) => row.selections.some((r) => r.group === s.group && r.value === s.value)));
      const state = variantOptionState(matrix, selected, group, value);
      assert.equal(state.compatibleCount, expected.length);
      assert.equal(state.available, expected.some((row) => row.purchasable && row.availableStock > 0));
    }
  };
  visit(0, []);
});

test("R29 indexing remains proportional to canonical rows with many textual dimensions", (context) => {
  const source = Array.from({ length: 1000 }, (_, i) => variant(i + 1000, {
    Model: `Model ${i}`, Memory: `${i % 8}`, Length: `${i % 20}`, Material: `Material ${i % 5}`, Pack: `${i % 4}`,
  }));
  const start = performance.now();
  const matrix = matrixOf(source);
  assert.equal(matrix.rows.length, source.length);
  for (let i = 0; i < 100; i++) {
    const selected = source[i].selections.slice(1);
    assert.equal(variantOptionState(matrix, selected, "Model", `Model ${i}`).available, true);
  }
  const elapsed = performance.now() - start;
  context.diagnostic(`1000 rows / 5 groups, index plus 100 interactions: ${elapsed.toFixed(1)} ms`);
  assert(elapsed < 1000, "bounded canonical index and interaction budget");
  assert.equal(matrixOf(manyVariants).rows.length, manyVariants.length);
});
