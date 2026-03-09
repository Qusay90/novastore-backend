/*
 * NovaStore Featured Products Section
 * Design: 4-column grid of product cards with stagger animation
 */

import { motion } from "framer-motion";
import { PRODUCTS } from "@shared/const";
import ProductCard from "./ProductCard";
import { ArrowRight } from "lucide-react";

export default function FeaturedProducts() {
  return (
    <section id="urunler" className="py-20 bg-[#F5F7FA]">
      <div className="container mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between mb-14 gap-4"
        >
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#0F2A43] section-title">
              Öne Çıkan Ürünler
            </h2>
            <p className="text-[#0F2A43]/60 mt-5 text-lg max-w-lg">
              En çok tercih edilen ve en yüksek puanlı ürünlerimizi keşfedin.
            </p>
          </div>
          <a
            href="#"
            className="group inline-flex items-center gap-2 text-[#1E4E79] font-medium hover:text-[#F7941D] transition-colors"
          >
            Tümünü Gör
            <ArrowRight
              size={18}
              className="transition-transform group-hover:translate-x-1"
            />
          </a>
        </motion.div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PRODUCTS.slice(0, 8).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
