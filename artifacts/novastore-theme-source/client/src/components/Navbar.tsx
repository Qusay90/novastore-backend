/*
 * NovaStore Navbar
 * Design: Stellar Commerce — Glassmorphism navbar with scroll blur effect
 * Colors: Navy (#0F2A43), Orange (#F7941D) accent
 * Font: Poppins
 */

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LOGO_URL } from "@shared/const";
import { useCart } from "@/contexts/CartContext";
import {
  ShoppingCart,
  Search,
  Menu,
  X,
  User,
  Heart,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { totalItems } = useCart();
  const [location] = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: "Ana Sayfa", href: "/" },
    { label: "Kategoriler", href: "/#kategoriler" },
    { label: "Ürünler", href: "/#urunler" },
    { label: "Kampanyalar", href: "/#kampanya" },
    { label: "İletişim", href: "/#iletisim" },
  ];

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-white/80 backdrop-blur-xl shadow-lg shadow-[#0F2A43]/5 border-b border-white/20"
            : "bg-transparent"
        }`}
      >
        <div className="container mx-auto">
          <div className="flex items-center justify-between h-[72px]">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <img
                src={LOGO_URL}
                alt="NovaStore Logo"
                className="h-11 w-11 rounded-xl object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <span
                className={`text-xl font-bold tracking-tight transition-colors duration-300 ${
                  scrolled ? "text-[#0F2A43]" : "text-white"
                }`}
              >
                Nova<span className="text-[#F7941D]">Store</span>
              </span>
            </Link>

            {/* Desktop Nav Links */}
            <div className="hidden lg:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-all duration-300 relative group ${
                    scrolled
                      ? "text-[#0F2A43]/70 hover:text-[#0F2A43]"
                      : "text-white/80 hover:text-white"
                  }`}
                >
                  {link.label}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-[#F7941D] to-[#FF6B00] transition-all duration-300 group-hover:w-full rounded-full" />
                </Link>
              ))}
            </div>

            {/* Desktop Actions */}
            <div className="hidden lg:flex items-center gap-3">
              {/* Search */}
              <button
                className={`p-2.5 rounded-xl transition-all duration-300 ${
                  scrolled
                    ? "text-[#0F2A43]/60 hover:bg-[#0F2A43]/5 hover:text-[#0F2A43]"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Search size={20} />
              </button>

              {/* Wishlist */}
              <button
                className={`p-2.5 rounded-xl transition-all duration-300 ${
                  scrolled
                    ? "text-[#0F2A43]/60 hover:bg-[#0F2A43]/5 hover:text-[#0F2A43]"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Heart size={20} />
              </button>

              {/* User */}
              <button
                className={`p-2.5 rounded-xl transition-all duration-300 ${
                  scrolled
                    ? "text-[#0F2A43]/60 hover:bg-[#0F2A43]/5 hover:text-[#0F2A43]"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <User size={20} />
              </button>

              {/* Cart */}
              <Link href="/cart">
                <button className="relative p-2.5 rounded-xl bg-gradient-to-r from-[#F7941D] to-[#FF6B00] text-white hover:shadow-lg hover:shadow-[#F7941D]/30 transition-all duration-300 hover:-translate-y-0.5">
                  <ShoppingCart size={20} />
                  {totalItems > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#0F2A43] text-white text-[10px] font-bold rounded-full flex items-center justify-center"
                    >
                      {totalItems}
                    </motion.span>
                  )}
                </button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex lg:hidden items-center gap-2">
              <Link href="/cart">
                <button className="relative p-2 rounded-xl bg-gradient-to-r from-[#F7941D] to-[#FF6B00] text-white">
                  <ShoppingCart size={18} />
                  {totalItems > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#0F2A43] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {totalItems}
                    </span>
                  )}
                </button>
              </Link>
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className={`p-2 rounded-xl transition-colors ${
                  scrolled ? "text-[#0F2A43]" : "text-white"
                }`}
              >
                {mobileOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 pt-[72px] bg-white/95 backdrop-blur-2xl lg:hidden"
          >
            <div className="container mx-auto py-8">
              <div className="flex flex-col gap-2">
                {navLinks.map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-4 py-4 px-4 rounded-2xl text-[#0F2A43] font-medium text-lg hover:bg-[#F5F7FA] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                ))}
              </div>
              <div className="mt-8 pt-8 border-t border-[#0F2A43]/10 flex gap-4">
                <button className="flex-1 py-3 rounded-2xl bg-[#F5F7FA] text-[#0F2A43] font-medium flex items-center justify-center gap-2">
                  <User size={18} />
                  Hesabım
                </button>
                <button className="flex-1 py-3 rounded-2xl bg-[#F5F7FA] text-[#0F2A43] font-medium flex items-center justify-center gap-2">
                  <Heart size={18} />
                  Favoriler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
