import { Headphones, RefreshCw, ShieldCheck, Truck } from "lucide-react";

const items = [{ icon: ShieldCheck, title: "Güvenli alışveriş", text: "Mevcut NovaStore güvenlik sözleşmeleri" }, { icon: Truck, title: "Teslimat görünürlüğü", text: "Sipariş akışında açık durum takibi" }, { icon: RefreshCw, title: "Kolay iade", text: "Mevcut iade süreciyle uyumlu" }, { icon: Headphones, title: "Destek", text: "NovaStore destek kanalları yanında" }];

export function TrustSection() { return <section className="trust-grid section">{items.map(({ icon: Icon, title, text }) => <div className="trust-item" key={title}><Icon /><div><strong>{title}</strong><span>{text}</span></div></div>)}</section>; }
