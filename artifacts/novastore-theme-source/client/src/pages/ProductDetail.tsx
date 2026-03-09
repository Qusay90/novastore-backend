/*
 * NovaStore Product Detail Page
 * Design: Left large image, right product info with tabs
 * Navy title, orange price, star rating, blue/orange buttons
 */

import { useParams, Link } from "wouter";
import { PRODUCTS } from "@shared/const";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Star,
  ShoppingCart,
  Zap,
  Heart,
  Share2,
  ChevronLeft,
  Minus,
  Plus,
  Check,
  Truck,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

type TabType = "description" | "features" | "reviews";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const product = PRODUCTS.find((p) => p.id === Number(id));
  const [activeTab, setActiveTab] = useState<TabType>("description");
  const [quantity, setQuantity] = useState(1);

  if (!product) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="pt-32 pb-20 text-center">
          <h1 className="text-2xl font-bold text-[#0F2A43] mb-4">
            Ürün bulunamadı
          </h1>
          <Link
            href="/"
            className="text-[#F7941D] font-medium hover:underline"
          >
            Ana sayfaya dön
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const discount = product.oldPrice
    ? Math.round(
        ((product.oldPrice - product.price) / product.oldPrice) * 100
      )
    : 0;

  const tabs: { key: TabType; label: string }[] = [
    { key: "description", label: "Açıklama" },
    { key: "features", label: "Özellikler" },
    { key: "reviews", label: "Yorumlar" },
  ];

  // Mock reviews
  const reviews = [
    {
      name: "Ahmet Y.",
      rating: 5,
      date: "2 gün önce",
      text: "Harika bir ürün, çok memnun kaldım. Kargo da çok hızlıydı.",
    },
    {
      name: "Elif K.",
      rating: 4,
      date: "1 hafta önce",
      text: "Kalitesi gayet iyi, fiyatına göre çok başarılı bir ürün.",
    },
    {
      name: "Mehmet S.",
      rating: 5,
      date: "2 hafta önce",
      text: "Beklentilerimin üzerinde bir ürün. Kesinlikle tavsiye ederim.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <Navbar />

      <main className="pt-28 pb-20">
        <div className="container mx-auto">
          {/* Breadcrumb */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-8"
          >
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-[#0F2A43]/50 hover:text-[#F7941D] transition-colors"
            >
              <ChevronLeft size={16} />
              Ana Sayfa
            </Link>
            <span className="text-[#0F2A43]/30">/</span>
            <span className="text-sm text-[#0F2A43]/50">
              {product.category}
            </span>
            <span className="text-[#0F2A43]/30">/</span>
            <span className="text-sm text-[#0F2A43] font-medium">
              {product.name}
            </span>
          </motion.div>

          {/* Product Section */}
          <div className="grid lg:grid-cols-2 gap-10">
            {/* Left - Image */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#0F2A43]/5 sticky top-28">
                <div className="relative overflow-hidden rounded-2xl bg-[#F5F7FA]">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full aspect-square object-cover"
                  />
                  {product.badge && (
                    <div className="absolute top-4 left-4 px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#F7941D] to-[#FF6B00] text-white text-sm font-semibold">
                      {product.badge}
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="absolute top-4 right-4 w-14 h-14 rounded-2xl bg-[#0F2A43] text-white text-sm font-bold flex items-center justify-center">
                      %{discount}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Right - Info */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="flex flex-col"
            >
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-[#0F2A43]/5">
                {/* Category */}
                <p className="text-sm text-[#1E4E79] font-medium uppercase tracking-wider mb-3">
                  {product.category}
                </p>

                {/* Name */}
                <h1 className="text-2xl sm:text-3xl font-bold text-[#0F2A43] mb-4">
                  {product.name}
                </h1>

                {/* Rating */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star
                        key={idx}
                        size={18}
                        className={
                          idx < Math.floor(product.rating)
                            ? "fill-[#F7941D] text-[#F7941D]"
                            : "text-[#0F2A43]/15"
                        }
                      />
                    ))}
                  </div>
                  <span className="text-sm text-[#0F2A43]/60">
                    {product.rating} ({product.reviewCount} değerlendirme)
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-end gap-3 mb-8 pb-8 border-b border-[#0F2A43]/5">
                  <span className="text-3xl sm:text-4xl font-bold text-[#F7941D]">
                    {product.price.toLocaleString("tr-TR")} ₺
                  </span>
                  {product.oldPrice && (
                    <span className="text-lg text-[#0F2A43]/40 line-through mb-1">
                      {product.oldPrice.toLocaleString("tr-TR")} ₺
                    </span>
                  )}
                  {discount > 0 && (
                    <span className="px-3 py-1 rounded-lg bg-[#F7941D]/10 text-[#F7941D] text-sm font-semibold mb-1">
                      %{discount} İndirim
                    </span>
                  )}
                </div>

                {/* Short features */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[
                    { icon: Truck, label: "Ücretsiz Kargo" },
                    { icon: ShieldCheck, label: "Güvenli Ödeme" },
                    { icon: RefreshCw, label: "Kolay İade" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#F5F7FA]"
                    >
                      <item.icon
                        size={20}
                        className="text-[#1E4E79]"
                        strokeWidth={1.5}
                      />
                      <span className="text-xs text-[#0F2A43]/60 text-center">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Quantity */}
                <div className="flex items-center gap-4 mb-6">
                  <span className="text-sm font-medium text-[#0F2A43]">
                    Adet:
                  </span>
                  <div className="flex items-center gap-1 bg-[#F5F7FA] rounded-xl p-1">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white transition-colors"
                    >
                      <Minus size={16} className="text-[#0F2A43]" />
                    </button>
                    <span className="w-12 text-center font-semibold text-[#0F2A43]">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white transition-colors"
                    >
                      <Plus size={16} className="text-[#0F2A43]" />
                    </button>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 mb-6">
                  <button
                    onClick={() =>
                      toast.success(`${product.name} sepete eklendi!`)
                    }
                    className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-[#0F2A43] to-[#1E4E79] text-white font-semibold hover:from-[#1E4E79] hover:to-[#2A6BA5] transition-all duration-300 hover:shadow-lg hover:shadow-[#0F2A43]/20 hover:-translate-y-0.5 shimmer-btn"
                  >
                    <ShoppingCart size={20} />
                    Sepete Ekle
                  </button>
                  <button
                    onClick={() =>
                      toast.success("Siparişiniz oluşturuldu!")
                    }
                    className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-[#F7941D] to-[#FF6B00] text-white font-semibold hover:shadow-lg hover:shadow-[#F7941D]/30 transition-all duration-300 hover:-translate-y-0.5 shimmer-btn"
                  >
                    <Zap size={20} />
                    Hemen Al
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => toast.success("Favorilere eklendi!")}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#F5F7FA] text-[#0F2A43]/60 text-sm font-medium hover:bg-[#0F2A43]/5 transition-colors"
                  >
                    <Heart size={16} />
                    Favorilere Ekle
                  </button>
                  <button
                    onClick={() => toast.info("Paylaşım bağlantısı kopyalandı!")}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#F5F7FA] text-[#0F2A43]/60 text-sm font-medium hover:bg-[#0F2A43]/5 transition-colors"
                  >
                    <Share2 size={16} />
                    Paylaş
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-[#0F2A43]/5 mt-6">
                {/* Tab Headers */}
                <div className="flex gap-1 p-1 bg-[#F5F7FA] rounded-xl mb-6">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all duration-300 ${
                        activeTab === tab.key
                          ? "bg-white text-[#0F2A43] shadow-sm"
                          : "text-[#0F2A43]/50 hover:text-[#0F2A43]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="min-h-[200px]">
                  {activeTab === "description" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <p className="text-[#0F2A43]/70 leading-relaxed">
                        {product.description}
                      </p>
                    </motion.div>
                  )}

                  {activeTab === "features" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ul className="space-y-3">
                        {product.features.map((feature, idx) => (
                          <li
                            key={idx}
                            className="flex items-center gap-3 text-[#0F2A43]/70"
                          >
                            <div className="w-6 h-6 rounded-full bg-[#F7941D]/10 flex items-center justify-center flex-shrink-0">
                              <Check
                                size={14}
                                className="text-[#F7941D]"
                              />
                            </div>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}

                  {activeTab === "reviews" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6"
                    >
                      {reviews.map((review, idx) => (
                        <div
                          key={idx}
                          className="pb-6 border-b border-[#0F2A43]/5 last:border-0 last:pb-0"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0F2A43] to-[#1E4E79] flex items-center justify-center text-white font-semibold text-sm">
                                {review.name.charAt(0)}
                              </div>
                              <div>
                                <p className="font-medium text-[#0F2A43] text-sm">
                                  {review.name}
                                </p>
                                <p className="text-xs text-[#0F2A43]/40">
                                  {review.date}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  size={14}
                                  className={
                                    i < review.rating
                                      ? "fill-[#F7941D] text-[#F7941D]"
                                      : "text-[#0F2A43]/15"
                                  }
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-[#0F2A43]/60 text-sm pl-[52px]">
                            {review.text}
                          </p>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
