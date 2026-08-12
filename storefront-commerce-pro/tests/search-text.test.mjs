import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSearchText } from "../src/searchText.js";

test("storefront search deliberately folds Turkish dotted and dotless I for discovery", () => {
  const product = normalizeSearchText("Apple iPhone 15 128 GB");

  for (const query of ["iphone", "IPHONE", "İPHONE", "ıphone"]) {
    assert.equal(product.includes(normalizeSearchText(query)), true, query);
  }
});
