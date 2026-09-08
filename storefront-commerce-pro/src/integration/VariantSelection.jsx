import { formatVariantSelections } from "../adapters/variantContract.js";

export function VariantSelection({ product, selectedId, onSelect }) {
  if (!product.variantSelectionRequired) return null;
  return <fieldset className="runtime-variant-selection">
    <legend>Seçenek seç</legend>
    <div className="runtime-variant-options">
      {product.variants.map((variant) => <button key={variant.id} type="button"
        data-variant-id={variant.id} aria-pressed={selectedId === variant.id}
        disabled={!variant.purchasable || variant.availableStock <= 0}
        onClick={() => onSelect(variant.id)}>
        <strong>{formatVariantSelections(variant.selections) || variant.sku}</strong>
        <small>{variant.purchasable && variant.availableStock > 0 ? `Stokta · ${variant.availableStock} adet` : "Stokta yok"}</small>
      </button>)}
    </div>
    {!product.variants.length && <p role="status">Bu ürün için satışa açık seçenek bulunmuyor.</p>}
    {product.variants.length > 0 && !selectedId && <p role="status">Sepete eklemek için bir seçenek seç.</p>}
  </fieldset>;
}
