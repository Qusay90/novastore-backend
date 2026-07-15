import { ArrowUpRight } from "lucide-react";
import type { Category } from "../types/catalog";

interface CategoriesProps { categories: Category[]; }

export function Categories({ categories }: CategoriesProps) {
  if (!categories.length) return null;
  return <section className="section categories-section"><div className="section-heading"><div><span className="eyebrow">Kategoriler</span><h2>İlgi alanına göre keşfet</h2></div></div><div className="category-grid">{categories.slice(0, 6).map((category, index) => <a className={`category-card tone-${index % 3}`} href={`/kategori/${encodeURIComponent(category.slug)}`} key={category.id}><span className="category-index">0{index + 1}</span><strong>{category.name}</strong><small>{category.productCount > 0 ? `${category.productCount} görünür ürün` : "Kataloğu incele"}</small><ArrowUpRight /></a>)}</div></section>;
}
