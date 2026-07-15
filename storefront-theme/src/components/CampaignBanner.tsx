import { ArrowRight, Gift } from "lucide-react";
import type { Collection } from "../types/catalog";

interface CampaignBannerProps { collection?: Collection; }

export function CampaignBanner({ collection }: CampaignBannerProps) {
  return <section className="campaign"><div><span className="campaign-icon"><Gift /></span><span className="eyebrow">NovaStore seçkisi</span><h2>{collection?.name || "Keşfetmeye değer fırsatlar"}</h2><p>{collection?.description || "Güncel koleksiyonları ve öne çıkan ürünleri tek yerde incele."}</p><a className="button light" href={collection ? `/koleksiyon/${encodeURIComponent(collection.slug)}` : "/koleksiyon/vitrin"}>Koleksiyonu Aç <ArrowRight /></a></div><strong className="campaign-mark">NOVA</strong></section>;
}
