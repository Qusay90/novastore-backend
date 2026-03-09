/*
 * NovaStore Footer
 * Design: Dark navy background, white text, orange hover links
 */

import { LOGO_URL } from "@shared/const";
import {
  Facebook,
  Twitter,
  Instagram,
  Youtube,
  Mail,
  Phone,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

export default function Footer() {
  return (
    <footer id="iletisim" className="bg-[#0F2A43] text-white">
      {/* Newsletter */}
      <div className="border-b border-white/10">
        <div className="container mx-auto py-12">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div>
              <h3 className="text-2xl font-bold mb-2">
                Fırsatlardan Haberdar Olun
              </h3>
              <p className="text-white/60">
                E-bültenimize abone olun, kampanyaları ilk siz öğrenin.
              </p>
            </div>
            <div className="flex w-full lg:w-auto gap-3">
              <input
                type="email"
                placeholder="E-posta adresiniz"
                className="flex-1 lg:w-80 px-5 py-3.5 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:border-[#F7941D]/50 focus:bg-white/15 transition-all"
              />
              <button
                onClick={() => toast.success("Bültene başarıyla abone oldunuz!")}
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#F7941D] to-[#FF6B00] text-white font-semibold hover:shadow-lg hover:shadow-[#F7941D]/30 transition-all duration-300 hover:-translate-y-0.5 flex items-center gap-2 shimmer-btn"
              >
                Abone Ol
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="container mx-auto py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <img
                src={LOGO_URL}
                alt="NovaStore"
                className="h-10 w-10 rounded-xl object-cover"
              />
              <span className="text-xl font-bold">
                Nova<span className="text-[#F7941D]">Store</span>
              </span>
            </div>
            <p className="text-white/50 text-sm leading-relaxed mb-6">
              Güvenli, hızlı ve kaliteli alışveriş deneyimi. Binlerce ürün,
              uygun fiyatlar ve hızlı teslimat ile hizmetinizdeyiz.
            </p>
            <div className="flex gap-3">
              {[Facebook, Twitter, Instagram, Youtube].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-[#F7941D] transition-all duration-300 group"
                >
                  <Icon
                    size={18}
                    className="text-white/50 group-hover:text-white transition-colors"
                  />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-base mb-5">Hızlı Bağlantılar</h4>
            <ul className="space-y-3">
              {[
                "Ana Sayfa",
                "Ürünler",
                "Kategoriler",
                "Kampanyalar",
                "Hakkımızda",
                "Blog",
              ].map((link) => (
                <li key={link}>
                  <a
                    href="#"
                    className="text-white/50 text-sm hover:text-[#F7941D] transition-colors duration-300"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Customer Service */}
          <div>
            <h4 className="font-semibold text-base mb-5">Müşteri Hizmetleri</h4>
            <ul className="space-y-3">
              {[
                "Sipariş Takibi",
                "İade ve Değişim",
                "Sıkça Sorulan Sorular",
                "Gizlilik Politikası",
                "Kullanım Koşulları",
                "KVKK Aydınlatma Metni",
              ].map((link) => (
                <li key={link}>
                  <a
                    href="#"
                    className="text-white/50 text-sm hover:text-[#F7941D] transition-colors duration-300"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-base mb-5">İletişim</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin size={18} className="text-[#F7941D] flex-shrink-0 mt-0.5" />
                <span className="text-white/50 text-sm">
                  Levent Mah. Büyükdere Cad. No:123
                  <br />
                  Beşiktaş, İstanbul
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone size={18} className="text-[#F7941D] flex-shrink-0" />
                <span className="text-white/50 text-sm">
                  0850 123 45 67
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Mail size={18} className="text-[#F7941D] flex-shrink-0" />
                <span className="text-white/50 text-sm">
                  info@novastore.com
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="container mx-auto py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/40 text-sm">
            &copy; 2026 NovaStore. Tüm hakları saklıdır.
          </p>
          <div className="flex items-center gap-6">
            <span className="text-white/30 text-xs">Ödeme Yöntemleri:</span>
            <div className="flex items-center gap-3">
              {["Visa", "Mastercard", "Troy", "PayPal"].map((method) => (
                <span
                  key={method}
                  className="px-3 py-1 rounded-md bg-white/5 text-white/40 text-xs font-medium"
                >
                  {method}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
