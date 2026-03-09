/*
 * NovaStore Hero Section
 * Design: Stellar Commerce — Dark navy gradient background with hero image overlay
 * Animated text entrance, orange CTA button with shimmer effect
 */

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { HERO_BG_URL } from "@shared/const";

export default function Hero() {
  return (
    <section className="relative min-h-[100vh] flex items-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={HERO_BG_URL}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0F2A43]/95 via-[#0F2A43]/80 to-[#1E4E79]/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F2A43]/50 to-transparent" />
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-20 right-20 w-72 h-72 bg-[#F7941D]/10 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#1E4E79]/30 rounded-full blur-[120px]" />

      {/* Content */}
      <div className="container mx-auto relative z-10 pt-[72px]">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left - Text Content */}
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-white/90 text-sm font-medium mb-8"
            >
              <Sparkles size={16} className="text-[#F7941D]" />
              Yeni Sezon Ürünleri Keşfedin
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white leading-[1.1] mb-6"
            >
              Alışverişin{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-[#F7941D] to-[#FFB347]">
                  Yeni Yıldızı
                </span>
                <span className="absolute -bottom-2 left-0 w-full h-3 bg-[#F7941D]/20 rounded-full" />
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-lg sm:text-xl text-white/70 mb-10 leading-relaxed max-w-lg"
            >
              Güvenli, hızlı ve kaliteli ürünlerle alışveriş deneyiminizi
              yeniden keşfedin. Binlerce ürün, tek bir tıkla kapınızda.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="flex flex-wrap gap-4"
            >
              <a
                href="#urunler"
                className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-[#F7941D] to-[#FF6B00] text-white font-semibold rounded-2xl shadow-lg shadow-[#F7941D]/30 hover:shadow-xl hover:shadow-[#F7941D]/40 transition-all duration-300 hover:-translate-y-1 shimmer-btn"
              >
                Alışverişe Başla
                <ArrowRight
                  size={20}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </a>
              <a
                href="#kategoriler"
                className="inline-flex items-center gap-3 px-8 py-4 bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold rounded-2xl hover:bg-white/20 transition-all duration-300 hover:-translate-y-1"
              >
                Kategorileri Keşfet
              </a>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="flex gap-10 mt-14 pt-10 border-t border-white/10"
            >
              {[
                { value: "50K+", label: "Mutlu Müşteri" },
                { value: "10K+", label: "Ürün Çeşidi" },
                { value: "4.9", label: "Müşteri Puanı" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl sm:text-3xl font-bold text-white">
                    {stat.value}
                  </div>
                  <div className="text-sm text-white/50 mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right - Visual Element (decorative floating cards) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="hidden lg:flex justify-center items-center relative"
          >
            <div className="relative w-[400px] h-[400px]">
              {/* Floating product cards */}
              <motion.div
                animate={{ y: [0, -15, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-0 right-0 w-52 bg-white/10 backdrop-blur-xl rounded-3xl p-5 border border-white/20 shadow-2xl"
              >
                <div className="w-full h-32 bg-gradient-to-br from-[#F7941D]/20 to-[#FF6B00]/10 rounded-2xl mb-4 flex items-center justify-center">
                  <Sparkles size={40} className="text-[#F7941D]" />
                </div>
                <div className="h-3 bg-white/20 rounded-full w-3/4 mb-2" />
                <div className="h-3 bg-[#F7941D]/40 rounded-full w-1/2" />
              </motion.div>

              <motion.div
                animate={{ y: [0, 15, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute bottom-0 left-0 w-56 bg-white/10 backdrop-blur-xl rounded-3xl p-5 border border-white/20 shadow-2xl"
              >
                <div className="w-full h-36 bg-gradient-to-br from-[#1E4E79]/30 to-[#0F2A43]/20 rounded-2xl mb-4 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/20" />
                </div>
                <div className="h-3 bg-white/20 rounded-full w-2/3 mb-2" />
                <div className="h-3 bg-[#F7941D]/40 rounded-full w-2/5" />
              </motion.div>

              {/* Center glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[#F7941D]/15 rounded-full blur-[60px]" />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path d="M0 80L60 74.7C120 69.3 240 58.7 360 53.3C480 48 600 48 720 53.3C840 58.7 960 69.3 1080 69.3C1200 69.3 1320 58.7 1380 53.3L1440 48V80H1380C1320 80 1200 80 1080 80C960 80 840 80 720 80C600 80 480 80 360 80C240 80 120 80 60 80H0Z" fill="#F5F7FA"/>
        </svg>
      </div>
    </section>
  );
}
