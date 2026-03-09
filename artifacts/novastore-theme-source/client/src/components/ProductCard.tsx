/*
 * NovaStore Product Card
 * Design: Modern Apple-style card with soft shadow, hover lift
 * Orange price, navy "Sepete Ekle" button, badge system
 */

import { Star, ShoppingCart, Heart } from "lucide-react";
import { motion } from "framer-motion";
import type { Product } from "@shared/const";
import { Link } from "wouter";
import { toast } from "sonner";
import { useCart } from "@/contexts/CartContext";

const badgeColors: Record<string, string> = {
  "Çok Satan": "bg-[#0F2A43] text-white",
  "İndirimli": "bg-gradient-to-r from-[#F7941D] to-[#FF6B00] text-white",
  "Trend": "bg-[#1E4E79] text-white",
  "Premium": "bg-gradient-to-r from-[#0F2A43] to-[#1E4E79] text-white",
  "Yeni": "bg-[#F7941D] text-white",
  "Popüler": "bg-[#1E4E79] text-white",
};

export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const discount = product.oldPrice
    ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
    : 0;

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      quantity: 1,
      name: product.name,
      price: product.price * 100, // Sent cinsine çevir
    });
    toast.success(`${product.name} sepete eklendi!`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <div className="group bg-white rounded-2xl overflow-hidden card-hover shadow-sm hover:shadow-2xl border border-[#0F2A43]/5">
        {/* Image Container */}
        <div className="relative overflow-hidden bg-[#F5F7FA]">
          <Link href={`/product/${product.id}`}>
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-56 object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </Link>

          {/* Badge */}
          {product.badge && (
            <div
              className={`absolute top-3 left-3 px-3 py-1 rounded-lg text-xs font-semibold ${
                badgeColors[product.badge] || "bg-[#0F2A43] text-white"
              }`}
            >
              {product.badge}
            </div>
          )}

          {/* Discount Badge */}
          {discount > 0 && (
            <div className="absolute top-3 right-3 w-11 h-11 rounded-full bg-[#F7941D] text-white text-xs font-bold flex items-center justify-center shadow-lg shadow-[#F7941D]/30">
              %{discount}
            </div>
          )}

          {/* Wishlist Button */}
          <button
            onClick={() => toast.success("Favorilere eklendi!")}
            className="absolute bottom-3 right-3 w-10 h-10 rounded-xl bg-white/90 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 hover:bg-white shadow-md"
          >
            <Heart size={18} className="text-[#0F2A43]/60 hover:text-[#F7941D] transition-colors" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          <p className="text-xs text-[#1E4E79] font-medium mb-2 uppercase tracking-wider">
            {product.category}
          </p>
          <Link href={`/product/${product.id}`}>
            <h3 className="font-semibold text-[#0F2A43] text-base mb-3 line-clamp-1 hover:text-[#1E4E79] transition-colors cursor-pointer">
              {product.name}
            </h3>
          </Link>

          {/* Rating */}
          <div className="flex items-center gap-1.5 mb-3">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Star
                  key={idx}
                  size={14}
                  className={
                    idx < Math.floor(product.rating)
                      ? "fill-[#F7941D] text-[#F7941D]"
                      : "text-[#0F2A43]/15"
                  }
                />
              ))}
            </div>
            <span className="text-xs text-[#0F2A43]/50">
              ({product.reviewCount})
            </span>
          </div>

          {/* Price */}
          <div className="flex items-end gap-2 mb-4">
            <span className="text-xl font-bold text-[#F7941D]">
              {product.price.toLocaleString("tr-TR")} ₺
            </span>
            {product.oldPrice && (
              <span className="text-sm text-[#0F2A43]/40 line-through">
                {product.oldPrice.toLocaleString("tr-TR")} ₺
              </span>
            )}
          </div>

          {/* Add to Cart Button */}
          <button
            onClick={handleAddToCart}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#0F2A43] to-[#1E4E79] text-white font-medium text-sm hover:from-[#1E4E79] hover:to-[#2A6BA5] transition-all duration-300 hover:shadow-lg hover:shadow-[#0F2A43]/20 hover:-translate-y-0.5 shimmer-btn"
          >
            <ShoppingCart size={16} />
            Sepete Ekle
          </button>
        </div>
      </div>
    </motion.div>
  );
}
