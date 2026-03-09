/*
 * NovaStore Campaign Banner
 * Design: Orange background with campaign image, white text, minimal icons
 */

import { motion } from "framer-motion";
import { CAMPAIGN_BG_URL } from "@shared/const";
import { ArrowRight, Gift, Percent, Truck } from "lucide-react";

export default function CampaignBanner() {
  return (
    <section id="kampanya" className="py-20 bg-white">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative rounded-3xl overflow-hidden"
        >
          {/* Background */}
          <div className="absolute inset-0">
            <img
              src={CAMPAIGN_BG_URL}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#F7941D]/90 via-[#FF6B00]/85 to-[#F7941D]/70" />
          </div>

          {/* Content */}
          <div className="relative z-10 px-8 sm:px-12 lg:px-16 py-14 lg:py-20">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              {/* Left */}
              <div>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium mb-6"
                >
                  <Percent size={16} />
                  Sınırlı Süre Kampanyası
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4"
                >
                  Kış İndirimleri
                  <br />
                  <span className="text-white/90">%50'ye Varan</span>
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="text-white/80 text-lg mb-8 max-w-md"
                >
                  Seçili ürünlerde büyük indirimler! Fırsatları kaçırmadan
                  alışverişinizi tamamlayın.
                </motion.p>

                <motion.a
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  href="#urunler"
                  className="group inline-flex items-center gap-3 px-8 py-4 bg-white text-[#F7941D] font-bold rounded-2xl shadow-lg shadow-black/10 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                >
                  Kampanyaları Keşfet
                  <ArrowRight
                    size={20}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </motion.a>
              </div>

              {/* Right - Feature icons */}
              <div className="flex flex-col gap-5 lg:items-end">
                {[
                  {
                    icon: Gift,
                    title: "Hediye Paketi",
                    desc: "Tüm siparişlerde ücretsiz hediye paketi",
                  },
                  {
                    icon: Truck,
                    title: "Ücretsiz Kargo",
                    desc: "200₺ üzeri siparişlerde ücretsiz kargo",
                  },
                  {
                    icon: Percent,
                    title: "Ekstra İndirim",
                    desc: "İlk alışverişe özel %10 ek indirim",
                  },
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                    className="flex items-center gap-4 bg-white/15 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/20 max-w-sm"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <item.icon size={22} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-white font-semibold text-sm">
                        {item.title}
                      </h4>
                      <p className="text-white/70 text-xs mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
