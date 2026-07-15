import { Heart, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { readCustomerSession } from "../api/customerSession";
import { useCart } from "../state/CartContext";

const links = [{ href: "/theme-preview", label: "Ana Sayfa" }, { href: "/kategori/elektronik", label: "Kategoriler" }, { href: "/koleksiyon/vitrin", label: "Koleksiyonlar" }];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { items } = useCart();
  const session = readCustomerSession();
  const count = items.reduce((total, item) => total + item.quantity, 0);
  return <header className="site-header"><div className="nav-shell"><Link href="/theme-preview" className="brand" aria-label="NovaStore tema önizleme ana sayfa"><span>N</span><strong>NovaStore</strong></Link><nav className={open ? "nav-links open" : "nav-links"} aria-label="Mağaza navigasyonu">{links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</nav><div className="nav-actions"><button className="icon-button" aria-label="Ürün ara"><Search /></button><a className="icon-button" href={session.authenticated ? "/profile.html" : "/login.html"} aria-label={session.authenticated ? "Hesabım" : "Giriş yap"}><User /></a><a className="icon-button" href="/profile.html#favorites" aria-label="Favoriler"><Heart /></a><Link className="icon-button cart-link" href="/theme-preview/cart" aria-label={`Sepet, ${count} ürün`}><ShoppingBag /><span>{count}</span></Link><button className="icon-button menu-button" onClick={() => setOpen((value) => !value)} aria-label={open ? "Menüyü kapat" : "Menüyü aç"}>{open ? <X /> : <Menu />}</button></div></div></header>;
}
