/*
 * NovaStore Categories Section
 * Design: 6 category cards with hover scale + orange border glow
 * Stagger fade-up animation on viewport entry
 */

import { motion } from "framer-motion";
import { CATEGORIES } from "@shared/const";
import {
  Smartphone,
  Shirt,
  Home,
  Dumbbell,
  Sparkles,
  BookOpen,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Smartphone,
  Shirt,
  Home,
  Dumbbell,
  Sparkles,
  BookOpen,
};

export default function Categories() {
  return (
    <section id="kategoriler" className="py-20 bg-[#F5F7FA]">
      <div className="container mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-14"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0F2A43] section-title">
            Kategoriler
          </h2>
          <p className="text-[#0F2A43]/60 mt-5 text-lg max-w-lg">
            İhtiyacınız olan her şey, tek bir çatı altında. Kategorileri keşfedin.
          </p>
        </motion.div>

        {/* Category Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
          {CATEGORIES.map((cat, i) => {
            const Icon = iconMap[cat.icon] || Smartphone;
            return (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                <div className="group relative bg-white rounded-2xl overflow-hidden cursor-pointer card-hover border-2 border-transparent hover:border-[#F7941D]/40 shadow-sm hover:shadow-xl">
                  {/* Image */}
                  <div className="relative h-40 overflow-hidden">
                    <img
                      src={cat.image}
                      alt={cat.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0F2A43]/80 via-[#0F2A43]/20 to-transparent" />
                    {/* Icon overlay */}
                    <div className="absolute top-3 right-3 w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/20">
                      <Icon size={18} className="text-white" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-semibold text-[#0F2A43] text-sm group-hover:text-[#F7941D] transition-colors duration-300">
                      {cat.name}
                    </h3>
                    <p className="text-xs text-[#0F2A43]/50 mt-1">
                      {cat.count} ürün
                    </p>
                  </div>

                  {/* Orange bottom line on hover */}
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-[#F7941D] to-[#FF6B00] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
