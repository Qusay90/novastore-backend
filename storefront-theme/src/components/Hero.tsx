import { ArrowRight, Sparkles } from "lucide-react";

export function Hero() {
  return <section className="hero"><div className="hero-orbit one" /><div className="hero-orbit two" /><div className="hero-content"><span className="hero-kicker"><Sparkles /> Yeni nesil alışveriş deneyimi</span><h1>Aradığın her şey,<br /><em>NovaStore’da.</em></h1><p>Gerçek NovaStore kataloğunu modern, hızlı ve güvenli bir vitrinle keşfet.</p><a className="button primary" href="#urunler">Ürünleri Keşfet <ArrowRight /></a></div><div className="hero-card" aria-hidden="true"><span className="hero-card-badge">Güvenli alışveriş</span><strong>Seç, keşfet,<br />kolayca tamamla.</strong><div className="hero-mini-grid"><span>Hızlı</span><span>Güvenli</span><span>Kolay</span></div></div></section>;
}
