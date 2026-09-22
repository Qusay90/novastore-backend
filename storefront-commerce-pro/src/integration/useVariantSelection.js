import { useMemo, useState } from "react";
import { changeVariantSelection, createVariantMatrix, resolveVariantSelection } from "../adapters/variantMatrix.js";

export function useVariantSelection(product) {
  const matrix = useMemo(() => createVariantMatrix(product.variants), [product]);
  const [choice, setChoice] = useState({ product: null, selections: [], cleared: [] });
  // Bind intent to this DTO: a new response must never reuse an old local ID.
  const selections = choice.product === product ? choice.selections : [];
  const cleared = choice.product === product ? choice.cleared : [];
  const resolution = useMemo(() => resolveVariantSelection(matrix, selections), [matrix, selections]);
  const onChange = (group, value) => setChoice((current) => ({
    product,
    ...changeVariantSelection(matrix, current.product === product ? current.selections : [], group, value),
  }));
  return { matrix, selections, cleared, resolution, onChange };
}
