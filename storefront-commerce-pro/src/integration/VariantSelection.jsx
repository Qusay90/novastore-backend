import { useId } from "react";
import { safeVariantColor, variantGroupLabel, variantValueLabel, variantOptionState } from "../adapters/variantMatrix.js";

const OPTION_MESSAGES = {
  UNAVAILABLE_COMBINATION: "Bu seçimle sunulmuyor",
  OUT_OF_STOCK: "Stokta yok",
  NOT_PURCHASABLE: "Satışa uygun değil",
};

export function VariantSelection({ product, matrix, selections, cleared, resolution, onChange }) {
  const statusId = useId();
  if (!product.variantSelectionRequired) return null;
  const selected = resolution.variant;
  const status = !matrix.rows.length ? "Bu ürün için satışa açık seçenek bulunmuyor."
    : resolution.ambiguous ? "Bu seçim tek bir ürün seçeneğiyle eşleşmiyor. Satın alma şu anda kullanılamıyor."
    : selected ? selected.purchasable && selected.availableStock > 0 ? `Seçimin hazır. Stokta · ${selected.availableStock} adet.` : "Bu seçenek şu anda satın alınamıyor."
    : resolution.missingGroups.length ? `Kalan seçim: ${resolution.missingGroups.map(variantGroupLabel).join(", ")}.`
    : "Bu seçenekler birlikte sunulmuyor. Seçimlerini güncelle.";
  return <fieldset className="runtime-variant-selection" data-resolved-variant-id={selected?.id} aria-describedby={statusId}>
    <legend>Seçenekleri belirle</legend>
    <p className="runtime-variant-hint">İstediğin seçenekten başla.</p>
    {[...matrix.groups].map(([group, values]) => {
      const hasSelection = selections.some((choice) => choice.group === group);
      const groupLabel = variantGroupLabel(group);
      return <fieldset className="runtime-variant-group" key={group} data-variant-group={group}>
        <legend><bdi>{groupLabel}</bdi></legend>
        <button type="button" className="runtime-variant-clear" aria-label={`${groupLabel} seçimini temizle`}
          aria-disabled={!hasSelection} onClick={() => { if (hasSelection) onChange(group, null); }}>Temizle</button>
        <div className="runtime-variant-options">
          {[...values.keys()].map((value) => {
            const option = variantOptionState(matrix, selections, group, value);
            const color = safeVariantColor(group, value);
            const reason = OPTION_MESSAGES[option.state];
            const valueLabel = variantValueLabel(group, value);
            return <button key={value} type="button" data-variant-option={value} data-option-state={option.state}
              aria-pressed={option.selected} aria-disabled={!option.available}
              aria-label={`${valueLabel}${reason ? `, ${reason}` : ""}`}
              title={reason || undefined}
              onClick={() => { if (option.available) onChange(group, value); }}>
              {color && <span className="runtime-variant-swatch" aria-hidden="true" style={{ backgroundColor: color }} />}
              <span className="runtime-variant-copy"><bdi>{valueLabel}</bdi></span>
              <span className="runtime-variant-mark" aria-hidden="true">{option.selected
                ? <span className="runtime-variant-selected">✓</span> : !option.available ? "−" : ""}</span>
            </button>;
          })}
        </div>
      </fieldset>;
    })}
    <p id={statusId} className="runtime-variant-status" role="status" aria-atomic="true">
      {cleared.length > 0 && <><bdi>{cleared.map(variantGroupLabel).join(", ")}</bdi> seçimi uyumsuz olduğu için temizlendi. </>}
      <bdi>{status}</bdi>
    </p>
  </fieldset>;
}
